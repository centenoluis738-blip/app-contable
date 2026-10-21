import { Router } from 'express';
import type { PoolClient } from 'pg';
import multer from 'multer';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { calcLine, D, money, splitTaxIncluded, TAX_CODES } from '@contable/shared';
import { config } from '../config.js';
import { one, pool, query, tx } from '../db.js';
import { ACCOUNTANTS, WRITERS, ctx, requireCompany } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/errors.js';
import { createEntry, reverseEntry, systemAccount, type EntryLine } from '../lib/journal.js';
import { getRate } from '../lib/fx.js';
import { audit } from '../lib/audit.js';
import { isoDate, pagination, positiveAmount, today } from '../lib/validation.js';

export const expensesRouter = Router();

const uploadDir = path.resolve(config.uploadDir, 'receipts');
mkdirSync(uploadDir, { recursive: true });
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf', 'text/xml', 'application/xml']);
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase().slice(0, 6)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => (ALLOWED.has(file.mimetype) ? cb(null, true) : cb(badRequest('Formato de archivo no permitido (usa JPG, PNG, PDF o XML)'))),
});

const expenseSchema = z.object({
  contactId: z.string().uuid().optional().nullable(),
  accountId: z.string().uuid('Elige una categoría de gasto'),
  date: isoDate.default(today()),
  description: z.string().trim().min(2, 'Describe el gasto'),
  reference: z.string().optional().nullable(),
  amount: positiveAmount,
  /** true: el importe ya incluye el impuesto (como en un ticket). */
  taxIncluded: z.boolean().default(true),
  /** IVA15, IVA0 o EXENTO. */
  taxCode: z.enum(['IVA15', 'IVA0', 'EXENTO']).default('IVA15'),
  currency: z.string().length(3).toUpperCase().optional(),
  /** false si no tiene factura formal o soporte legal: se registra en "Gastos no deducibles" y su IVA no se acredita. */
  deductible: z.boolean().default(true),
  paid: z.boolean().default(true),
  paymentMethod: z.enum(['transfer', 'cash', 'card', 'other']).default('card'),
});

const toRow = (e: any) => ({
  id: e.id, contactId: e.contact_id, contactName: e.contact_name, accountId: e.account_id, accountName: e.account_name, date: e.date,
  description: e.description, reference: e.reference, subtotal: e.subtotal, taxCode: e.tax_code, taxRate: e.tax_rate, tax: e.tax, total: e.total,
  currency: e.currency, exchangeRate: e.exchange_rate, deductible: e.deductible,
  status: e.status, paidDate: e.paid_date, hasReceipt: !!e.receipt_path,
});

async function loadExpense(db: PoolClient | typeof pool, companyId: string, id: string, lock = false) {
  const e = await one(
    db,
    `SELECT e.*, c.name AS contact_name, a.name AS account_name FROM expenses e
     LEFT JOIN contacts c ON c.id = e.contact_id JOIN accounts a ON a.id = e.account_id
     WHERE e.id = $1 AND e.company_id = $2 ${lock ? 'FOR UPDATE OF e' : ''}`,
    [id, companyId],
  );
  if (!e) throw notFound('Gasto');
  return e;
}

expensesRouter.get('/', requireCompany(), async (req, res) => {
  const f = pagination
    .extend({ status: z.enum(['unpaid', 'paid', 'void']).optional(), from: isoDate.optional(), to: isoDate.optional(), accountId: z.string().uuid().optional() })
    .parse(req.query);
  const rows = await query(
    pool,
    `SELECT e.*, c.name AS contact_name, a.name AS account_name FROM expenses e
     LEFT JOIN contacts c ON c.id = e.contact_id JOIN accounts a ON a.id = e.account_id
     WHERE e.company_id = $1 AND ($2::text IS NULL OR e.status = $2) AND ($3::date IS NULL OR e.date >= $3)
       AND ($4::date IS NULL OR e.date <= $4) AND ($5::uuid IS NULL OR e.account_id = $5)
     ORDER BY e.date DESC, e.created_at DESC LIMIT $6 OFFSET $7`,
    [req.company!.id, f.status ?? null, f.from ?? null, f.to ?? null, f.accountId ?? null, f.limit, f.offset],
  );
  res.json(rows.map(toRow));
});

expensesRouter.get('/:id', requireCompany(), async (req, res) => {
  res.json(toRow(await loadExpense(pool, req.company!.id, String(req.params.id))));
});

/**
 * Registra un gasto (en córdobas o dólares; la contabilidad siempre en córdobas).
 * Asiento: Gasto (debe) + IVA acreditable (debe, solo régimen general y gasto deducible)
 * contra Proveedores si queda pendiente, o Bancos/Caja si ya se pagó (haber).
 * En cuota fija el IVA pagado no se acredita: forma parte del gasto.
 */
expensesRouter.post('/', requireCompany(...WRITERS), async (req, res) => {
  const b = expenseSchema.parse(req.body);
  const id = await tx(async (client) => {
    const companyId = req.company!.id;
    const company = await one(client, 'SELECT tax_regime, currency FROM companies WHERE id = $1', [companyId]);
    const account = await one(client, 'SELECT type FROM accounts WHERE id = $1 AND company_id = $2', [b.accountId, companyId]);
    if (!account) throw notFound('Categoría');
    if (account.type !== 'expense' && account.type !== 'asset') throw badRequest('La categoría debe ser una cuenta de gasto o de activo');
    if (b.contactId) {
      const c = await one(client, 'SELECT 1 FROM contacts WHERE id = $1 AND company_id = $2', [b.contactId, companyId]);
      if (!c) throw notFound('Proveedor');
    }
    if (!b.paid && !b.contactId) throw badRequest('Para dejar un gasto pendiente de pago indica el proveedor');
    const currency = b.currency ?? company.currency;
    const fx = await getRate(client, companyId, currency, b.date);
    const taxRate = TAX_CODES[b.taxCode].rate;
    const t = b.taxIncluded ? splitTaxIncluded(b.amount, taxRate) : calcLine({ quantity: 1, unitPrice: b.amount, taxRate });
    const exp = await one(
      client,
      `INSERT INTO expenses(company_id, contact_id, account_id, date, description, reference, subtotal, tax_code, tax_rate, tax, total, status, paid_date,
         currency, exchange_rate, deductible, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [companyId, b.contactId ?? null, b.accountId, b.date, b.description, b.reference ?? null, t.subtotal, b.taxCode, taxRate, t.tax, t.total,
        b.paid ? 'paid' : 'unpaid', b.paid ? b.date : null, currency, fx, b.deductible, req.user!.id],
    );
    const totalNio = money(D(t.total).times(fx));
    const creditable = company.tax_regime === 'general' && b.deductible;
    const taxNio = creditable ? money(D(t.tax).times(fx)) : '0';
    const expenseAccount = b.deductible ? b.accountId : await systemAccount(client, companyId, 'nonDeductible');
    const creditKey = b.paid ? (b.paymentMethod === 'cash' ? 'cash' : 'bank') : 'payable';
    const entryId = await createEntry(client, {
      companyId, userId: req.user!.id, date: b.date, sourceType: 'expense', sourceId: exp.id,
      description: `Gasto: ${b.description}${b.deductible ? '' : ' (no deducible)'}`,
      lines: [
        { accountId: expenseAccount, debit: money(D(totalNio).minus(taxNio)) },
        { accountId: await systemAccount(client, companyId, 'vatReceivable'), debit: taxNio },
        { accountId: await systemAccount(client, companyId, creditKey), credit: totalNio },
      ],
    });
    await client.query('UPDATE expenses SET journal_entry_id = $2 WHERE id = $1', [exp.id, entryId]);
    await audit(client, { ...ctx(req), action: 'create', entity: 'expense', entityId: exp.id });
    return exp.id;
  });
  res.status(201).json(toRow(await loadExpense(pool, req.company!.id, id)));
});

/** Paga un gasto pendiente: Proveedores (debe) contra Bancos/Caja (haber), con diferencial cambiario si es en dólares. */
export async function payExpense(
  client: PoolClient,
  companyId: string,
  userId: string,
  id: string,
  p: { date: string; method: 'transfer' | 'cash' | 'card' | 'other' },
): Promise<string> {
  const e = await loadExpense(client, companyId, id, true);
  if (e.status !== 'unpaid') throw badRequest('El gasto no está pendiente de pago');
  const bookedNio = money(D(e.total).times(e.exchange_rate));
  const payFx = await getRate(client, companyId, e.currency, p.date);
  const paidNio = money(D(e.total).times(payFx));
  const diff = D(paidNio).minus(bookedNio);
  const lines: EntryLine[] = [
    { accountId: await systemAccount(client, companyId, 'payable'), debit: bookedNio },
    { accountId: await systemAccount(client, companyId, p.method === 'cash' ? 'cash' : 'bank'), credit: paidNio },
  ];
  if (diff.gt(0)) lines.push({ accountId: await systemAccount(client, companyId, 'fxLoss'), debit: money(diff) });
  if (diff.lt(0)) lines.push({ accountId: await systemAccount(client, companyId, 'fxGain'), credit: money(diff.abs()) });
  const entryId = await createEntry(client, {
    companyId, userId, date: p.date, sourceType: 'expense_payment', sourceId: e.id, description: `Pago del gasto: ${e.description}`, lines,
  });
  await client.query(`UPDATE expenses SET status = 'paid', paid_date = $2, payment_entry_id = $3 WHERE id = $1`, [e.id, p.date, entryId]);
  await audit(client, { companyId, userId, action: 'pay', entity: 'expense', entityId: e.id, data: p });
  return entryId;
}

expensesRouter.post('/:id/pay', requireCompany(...WRITERS), async (req, res) => {
  const p = z.object({ date: isoDate.default(today()), method: z.enum(['transfer', 'cash', 'card', 'other']).default('transfer') }).parse(req.body);
  await tx((client) => payExpense(client, req.company!.id, req.user!.id, String(req.params.id), p));
  res.json(toRow(await loadExpense(pool, req.company!.id, String(req.params.id))));
});

expensesRouter.post('/:id/void', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const b = z.object({ reason: z.string().trim().min(3, 'Indica el motivo'), date: isoDate.default(today()) }).parse(req.body);
  await tx(async (client) => {
    const e = await loadExpense(client, req.company!.id, String(req.params.id), true);
    if (e.status === 'void') throw badRequest('El gasto ya está anulado');
    if (e.payment_entry_id) {
      await reverseEntry(client, { companyId: req.company!.id, entryId: e.payment_entry_id, date: b.date, userId: req.user!.id, description: `Anulación del pago: ${e.description}` });
    }
    await reverseEntry(client, { companyId: req.company!.id, entryId: e.journal_entry_id, date: b.date, userId: req.user!.id, description: `Anulación del gasto: ${e.description} (${b.reason})` });
    await client.query(`UPDATE expenses SET status = 'void' WHERE id = $1`, [e.id]);
    await audit(client, { ...ctx(req), action: 'void', entity: 'expense', entityId: e.id, data: b });
  });
  res.json(toRow(await loadExpense(pool, req.company!.id, String(req.params.id))));
});

/** Adjunta la foto o el PDF del comprobante (campo "file" en multipart/form-data). */
expensesRouter.post('/:id/receipt', requireCompany(...WRITERS), upload.single('file'), async (req, res) => {
  if (!req.file) throw badRequest('Adjunta un archivo en el campo "file"');
  await loadExpense(pool, req.company!.id, String(req.params.id));
  await pool.query('UPDATE expenses SET receipt_path = $2 WHERE id = $1', [String(req.params.id), req.file.filename]);
  await audit(pool, { ...ctx(req), action: 'attach_receipt', entity: 'expense', entityId: String(req.params.id) });
  res.json(toRow(await loadExpense(pool, req.company!.id, String(req.params.id))));
});

expensesRouter.get('/:id/receipt', requireCompany(), async (req, res) => {
  const e = await loadExpense(pool, req.company!.id, String(req.params.id));
  const file = e.receipt_path && path.join(uploadDir, path.basename(e.receipt_path));
  if (!file || !existsSync(file)) throw notFound('Comprobante');
  res.sendFile(file);
});
