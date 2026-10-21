import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { D, money } from '@contable/shared';
import { one, pool, query, tx } from '../db.js';
import { WRITERS, ctx, requireCompany } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/errors.js';
import { createEntry, systemAccount } from '../lib/journal.js';
import { audit } from '../lib/audit.js';
import { registerPayment } from './invoices.js';
import { payExpense } from './expenses.js';

export const bankRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

/** Convierte "21/10/2026", "2026-10-21" o "21-10-2026" a "2026-10-21". */
export function parseDate(v: string): string | null {
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Convierte "1.234,56", "1,234.56", "-500" o "$ 1 200.00" a "1234.56". */
export function parseAmount(v: string): string | null {
  let s = v.replace(/[^\d,.\-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? money(s) : null;
}

const pick = (row: Record<string, string>, names: string[]) => {
  const key = Object.keys(row).find((k) => names.includes(k.trim().toLowerCase()));
  return key ? row[key] : undefined;
};

/**
 * Importa un extracto bancario en CSV. Columnas reconocidas: fecha/date, descripcion/concepto/description,
 * importe/monto/amount (o cargo y abono por separado) y referencia/reference. Omite filas ya importadas.
 */
bankRouter.post('/import', requireCompany(...WRITERS), upload.single('file'), async (req, res) => {
  const text = req.file ? req.file.buffer.toString('utf8') : typeof req.body?.csv === 'string' ? req.body.csv : '';
  if (!text.trim()) throw badRequest('Adjunta el archivo CSV en el campo "file" o envía su texto en "csv"');
  const delimiter = (text.split('\n')[0].match(/;/g)?.length ?? 0) > (text.split('\n')[0].match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: Record<string, string>[] = parse(text.replace(/^﻿/, ''), { columns: true, skip_empty_lines: true, trim: true, delimiter });

  const parsed = rows.map((r, i) => {
    const date = parseDate(pick(r, ['fecha', 'date', 'fecha operación', 'fecha operacion']) ?? '');
    const description = pick(r, ['descripcion', 'descripción', 'concepto', 'description', 'detalle']) ?? '';
    let amount = parseAmount(pick(r, ['importe', 'monto', 'amount', 'valor']) ?? '');
    if (amount === null) {
      const debit = parseAmount(pick(r, ['cargo', 'retiro', 'debe', 'debit']) ?? '') ?? '0';
      const credit = parseAmount(pick(r, ['abono', 'deposito', 'depósito', 'haber', 'credit']) ?? '') ?? '0';
      amount = money(D(credit).minus(debit));
    }
    if (!date || D(amount).isZero()) throw badRequest(`Fila ${i + 2}: falta la fecha o el importe`);
    return { date, description: description || 'Sin descripción', amount, reference: pick(r, ['referencia', 'reference', 'ref']) ?? null };
  });

  const batch = randomUUID();
  let imported = 0;
  await tx(async (client) => {
    for (const r of parsed) {
      const dup = await one(
        client,
        'SELECT 1 FROM bank_transactions WHERE company_id = $1 AND date = $2 AND amount = $3 AND description = $4',
        [req.company!.id, r.date, r.amount, r.description],
      );
      if (dup) continue;
      await client.query(
        'INSERT INTO bank_transactions(company_id, date, description, amount, reference, import_batch) VALUES ($1,$2,$3,$4,$5,$6)',
        [req.company!.id, r.date, r.description, r.amount, r.reference, batch],
      );
      imported++;
    }
    await audit(client, { ...ctx(req), action: 'import', entity: 'bank_transactions', entityId: batch, data: { imported, total: parsed.length } });
  });
  res.status(201).json({ batch, imported, skipped: parsed.length - imported });
});

/** Movimientos bancarios con sugerencias de conciliación (facturas o gastos con el mismo importe). */
bankRouter.get('/transactions', requireCompany(), async (req, res) => {
  const { status } = z.object({ status: z.enum(['pending', 'matched', 'all']).default('all') }).parse(req.query);
  const rows = await query(
    pool,
    `SELECT * FROM bank_transactions WHERE company_id = $1
       AND ($2 = 'all' OR ($2 = 'pending' AND matched_type IS NULL) OR ($2 = 'matched' AND matched_type IS NOT NULL))
     ORDER BY date DESC, created_at DESC LIMIT 500`,
    [req.company!.id, status],
  );
  const openInvoices = await query(
    pool,
    `SELECT i.id, i.series, i.number, i.total - i.amount_paid AS pending, i.withholding_amount, c.name AS contact_name FROM invoices i
     JOIN contacts c ON c.id = i.contact_id JOIN companies co ON co.id = i.company_id
     WHERE i.company_id = $1 AND i.status IN ('issued','partial') AND i.currency = co.currency`,
    [req.company!.id],
  );
  const unpaidExpenses = await query(
    pool,
    `SELECT e.id, e.description, e.total FROM expenses e JOIN companies co ON co.id = e.company_id
     WHERE e.company_id = $1 AND e.status = 'unpaid' AND e.currency = co.currency`,
    [req.company!.id],
  );
  // Un cobro coincide con la factura si es el saldo completo, o el saldo menos la retención IR esperada
  const matchesInvoice = (i: any, amount: string) =>
    D(i.pending).equals(amount) || (D(i.withholding_amount).gt(0) && D(i.pending).minus(i.withholding_amount).equals(amount));
  res.json(
    rows.map((t) => ({
      id: t.id, date: t.date, description: t.description, amount: t.amount, reference: t.reference,
      matchedType: t.matched_type, matchedId: t.matched_id,
      suggestions: t.matched_type
        ? []
        : D(t.amount).gt(0)
          ? openInvoices.filter((i) => matchesInvoice(i, t.amount)).map((i) => ({ type: 'invoice', id: i.id, label: `Factura ${i.series}-${i.number} · ${i.contact_name}` }))
          : unpaidExpenses.filter((e) => D(e.total).equals(D(t.amount).abs())).map((e) => ({ type: 'expense', id: e.id, label: `Gasto · ${e.description}` })),
    })),
  );
});

/**
 * Concilia un movimiento: con una factura (registra el cobro), con un gasto pendiente (registra el pago)
 * o directamente con una cuenta contable (p. ej. comisiones bancarias).
 */
bankRouter.post('/transactions/:id/match', requireCompany(...WRITERS), async (req, res) => {
  const b = z
    .discriminatedUnion('type', [
      z.object({ type: z.literal('invoice'), id: z.string().uuid() }),
      z.object({ type: z.literal('expense'), id: z.string().uuid() }),
      z.object({ type: z.literal('account'), id: z.string().uuid(), description: z.string().optional() }),
    ])
    .parse(req.body);
  await tx(async (client) => {
    const companyId = req.company!.id;
    const t = await one(client, 'SELECT * FROM bank_transactions WHERE id = $1 AND company_id = $2 FOR UPDATE', [String(req.params.id), companyId]);
    if (!t) throw notFound('Movimiento');
    if (t.matched_type) throw badRequest('El movimiento ya está conciliado');
    const amount = D(t.amount);
    let entryId: string;
    if (b.type === 'invoice') {
      if (amount.lte(0)) throw badRequest('Un cobro de factura debe ser un abono (importe positivo)');
      const inv = await one(client, 'SELECT total - amount_paid AS pending, withholding_amount FROM invoices WHERE id = $1 AND company_id = $2', [b.id, companyId]);
      if (!inv) throw notFound('Factura');
      // Si llegó el saldo menos la retención, se registra el cobro completo con la retención
      const withheld = D(inv.withholding_amount).gt(0) && D(inv.pending).minus(inv.withholding_amount).equals(amount) ? D(inv.withholding_amount) : D(0);
      ({ entryId } = await registerPayment(client, companyId, req.user!.id, b.id, {
        date: t.date, amount: money(amount.plus(withheld)), withheld: money(withheld), method: 'transfer', reference: t.reference ?? t.description,
      }));
    } else if (b.type === 'expense') {
      if (amount.gte(0)) throw badRequest('El pago de un gasto debe ser un cargo (importe negativo)');
      const e = await one(client, 'SELECT total FROM expenses WHERE id = $1 AND company_id = $2', [b.id, companyId]);
      if (!e) throw notFound('Gasto');
      if (!D(e.total).equals(amount.abs())) throw badRequest('El importe del movimiento no coincide con el del gasto');
      entryId = await payExpense(client, companyId, req.user!.id, b.id, { date: t.date, method: 'transfer' });
    } else {
      const bank = await systemAccount(client, companyId, 'bank');
      if (b.id === bank) throw badRequest('Elige una cuenta distinta de Bancos');
      const abs = money(amount.abs());
      entryId = await createEntry(client, {
        companyId, userId: req.user!.id, date: t.date, sourceType: 'bank', sourceId: t.id, description: b.description || t.description,
        lines: amount.gt(0) ? [{ accountId: bank, debit: abs }, { accountId: b.id, credit: abs }] : [{ accountId: b.id, debit: abs }, { accountId: bank, credit: abs }],
      });
    }
    await client.query('UPDATE bank_transactions SET matched_type = $2, matched_id = $3, journal_entry_id = $4 WHERE id = $1', [t.id, b.type, b.id, entryId]);
    await audit(client, { ...ctx(req), action: 'match', entity: 'bank_transaction', entityId: t.id, data: b });
  });
  res.json({ ok: true });
});
