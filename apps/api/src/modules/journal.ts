import { Router } from 'express';
import { z } from 'zod';
import { one, pool, query, tx } from '../db.js';
import { ACCOUNTANTS, ctx, requireCompany } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/errors.js';
import { createEntry, reverseEntry } from '../lib/journal.js';
import { audit } from '../lib/audit.js';
import { amount, isoDate, pagination, today } from '../lib/validation.js';
import { sendCsv } from '../lib/csv.js';

export const journalRouter = Router();

/** Libro diario: asientos con sus líneas, filtrables por fecha y cuenta. */
journalRouter.get('/', requireCompany(), async (req, res) => {
  const f = pagination
    .extend({ from: isoDate.optional(), to: isoDate.optional(), accountId: z.string().uuid().optional(), format: z.enum(['json', 'csv']).default('json') })
    .parse(req.query);
  // Para exportar el libro diario completo (legalización de libros) se ignora la paginación
  if (f.format === 'csv') {
    f.limit = 1_000_000;
    f.offset = 0;
  }
  const entries = await query(
    pool,
    `SELECT e.id, e.number, e.date, e.description, e.source_type, e.source_id, e.reverses_id,
       (SELECT r.id FROM journal_entries r WHERE r.reverses_id = e.id) AS reversed_by
     FROM journal_entries e
     WHERE e.company_id = $1 AND ($2::date IS NULL OR e.date >= $2) AND ($3::date IS NULL OR e.date <= $3)
       AND ($4::uuid IS NULL OR EXISTS (SELECT 1 FROM journal_lines l WHERE l.entry_id = e.id AND l.account_id = $4))
     ORDER BY e.date DESC, e.number DESC LIMIT $5 OFFSET $6`,
    [req.company!.id, f.from ?? null, f.to ?? null, f.accountId ?? null, f.limit, f.offset],
  );
  const lines = entries.length
    ? await query(
        pool,
        `SELECT l.entry_id, l.account_id, a.code, a.name, l.description, l.debit, l.credit
         FROM journal_lines l JOIN accounts a ON a.id = l.account_id WHERE l.entry_id = ANY($1::uuid[]) ORDER BY l.debit DESC`,
        [entries.map((e) => e.id)],
      )
    : [];
  if (f.format === 'csv') {
    return sendCsv(
      res,
      `libro-diario-${f.from ?? 'inicio'}-${f.to ?? 'hoy'}.csv`,
      [...entries].reverse().flatMap((e) =>
        lines.filter((l) => l.entry_id === e.id).map((l) => ({
          asiento: e.number, fecha: e.date, concepto: e.description, cuenta: l.code, nombre: l.name, debe: l.debit, haber: l.credit,
        })),
      ),
    );
  }
  res.json(
    entries.map((e) => ({
      id: e.id, number: e.number, date: e.date, description: e.description, sourceType: e.source_type, sourceId: e.source_id,
      reversesId: e.reverses_id, reversedBy: e.reversed_by,
      lines: lines.filter((l) => l.entry_id === e.id).map((l) => ({
        accountId: l.account_id, code: l.code, name: l.name, description: l.description, debit: l.debit, credit: l.credit,
      })),
    })),
  );
});

/** Libro mayor de una cuenta: movimientos con saldo corrido. */
journalRouter.get('/ledger/:accountId', requireCompany(), async (req, res) => {
  const f = z.object({ from: isoDate.optional(), to: isoDate.optional(), format: z.enum(['json', 'csv']).default('json') }).parse(req.query);
  const account = await one(pool, 'SELECT * FROM accounts WHERE id = $1 AND company_id = $2', [String(req.params.accountId), req.company!.id]);
  if (!account) throw notFound('Cuenta');
  const sign = ['asset', 'expense'].includes(account.type) ? 1 : -1;
  const opening = await one(
    pool,
    `SELECT COALESCE(SUM(l.debit - l.credit), 0) * $3 AS balance FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
     WHERE l.account_id = $1 AND e.company_id = $2 AND $4::date IS NOT NULL AND e.date < $4`,
    [account.id, req.company!.id, sign, f.from ?? null],
  );
  const moves = await query(
    pool,
    `SELECT e.id AS entry_id, e.number, e.date, e.description, l.debit, l.credit,
       $3 * SUM(l.debit - l.credit) OVER (ORDER BY e.date, e.number, l.id) + $4::numeric AS balance
     FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
     WHERE l.account_id = $1 AND e.company_id = $2 AND ($5::date IS NULL OR e.date >= $5) AND ($6::date IS NULL OR e.date <= $6)
     ORDER BY e.date, e.number, l.id`,
    [account.id, req.company!.id, sign, opening.balance, f.from ?? null, f.to ?? null],
  );
  if (f.format === 'csv') {
    return sendCsv(res, `libro-mayor-${account.code}.csv`, [
      { fecha: '', asiento: '', concepto: 'Saldo inicial', debe: '', haber: '', saldo: opening.balance },
      ...moves.map((m) => ({ fecha: m.date, asiento: m.number, concepto: m.description, debe: m.debit, haber: m.credit, saldo: m.balance })),
    ]);
  }
  res.json({
    account: { id: account.id, code: account.code, name: account.name, type: account.type },
    openingBalance: opening.balance,
    moves: moves.map((m) => ({ entryId: m.entry_id, number: m.number, date: m.date, description: m.description, debit: m.debit, credit: m.credit, balance: m.balance })),
  });
});

/** Asiento manual (solo dueño o contador). */
journalRouter.post('/', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const b = z
    .object({
      date: isoDate.default(today()),
      description: z.string().trim().min(3, 'Describe el asiento'),
      lines: z
        .array(z.object({ accountId: z.string().uuid(), debit: amount.optional(), credit: amount.optional(), description: z.string().optional() }))
        .min(2),
    })
    .parse(req.body);
  const id = await tx(async (client) => {
    const entryId = await createEntry(client, { ...b, companyId: req.company!.id, userId: req.user!.id, sourceType: 'manual' });
    await audit(client, { ...ctx(req), action: 'create', entity: 'journal_entry', entityId: entryId });
    return entryId;
  });
  res.status(201).json({ id });
});

/** Revierte un asiento manual con un contraasiento. Los automáticos se anulan desde su documento. */
journalRouter.post('/:id/reverse', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const b = z.object({ date: isoDate.default(today()), reason: z.string().trim().min(3, 'Indica el motivo') }).parse(req.body);
  const entry = await one(pool, 'SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2', [String(req.params.id), req.company!.id]);
  if (!entry) throw notFound('Asiento');
  if (entry.source_type !== 'manual') throw badRequest('Este asiento es automático: anula la factura, el gasto o el cobro que lo generó');
  const id = await tx(async (client) => {
    const rid = await reverseEntry(client, {
      companyId: req.company!.id, entryId: entry.id, date: b.date, userId: req.user!.id,
      description: `Reversión del asiento ${entry.number}: ${b.reason}`,
    });
    await audit(client, { ...ctx(req), action: 'reverse', entity: 'journal_entry', entityId: entry.id, data: { reason: b.reason } });
    return rid;
  });
  res.status(201).json({ id });
});
