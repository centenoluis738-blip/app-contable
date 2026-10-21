import { Router } from 'express';
import { z } from 'zod';
import { ACCOUNT_TYPES, D, money } from '@contable/shared';
import { one, pool, query } from '../db.js';
import { ACCOUNTANTS, ctx, requireCompany } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/errors.js';
import { audit } from '../lib/audit.js';

export const accountsRouter = Router();

const toRow = (a: any) => ({
  id: a.id, code: a.code, name: a.name, type: a.type, parentId: a.parent_id, systemKey: a.system_key, isActive: a.is_active,
  debit: money(a.debit ?? 0), credit: money(a.credit ?? 0), balance: money(a.balance ?? 0),
});

/** Plan de cuentas con saldos acumulados (debe − haber; en pasivo, patrimonio e ingresos se invierte el signo). */
accountsRouter.get('/', requireCompany(), async (req, res) => {
  const rows = await query(
    pool,
    `SELECT a.*, COALESCE(SUM(l.debit),0) AS debit, COALESCE(SUM(l.credit),0) AS credit,
       CASE WHEN a.type IN ('asset','expense') THEN COALESCE(SUM(l.debit - l.credit),0) ELSE COALESCE(SUM(l.credit - l.debit),0) END AS balance
     FROM accounts a LEFT JOIN journal_lines l ON l.account_id = a.id
     WHERE a.company_id = $1 GROUP BY a.id
     ORDER BY string_to_array(a.code, '.')::int[]`,
    [req.company!.id],
  );
  // Las cuentas padre muestran la suma de sus subcuentas (de las más profundas hacia arriba)
  const byId = new Map(rows.map((r) => [r.id, r]));
  const depth = (code: string) => code.split('.').length;
  for (const r of [...rows].sort((a, b) => depth(b.code) - depth(a.code))) {
    const parent = r.parent_id && byId.get(r.parent_id);
    if (!parent) continue;
    for (const k of ['debit', 'credit', 'balance'] as const) parent[k] = money(D(parent[k]).plus(r[k]));
  }
  res.json(rows.map(toRow));
});

accountsRouter.post('/', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const b = z
    .object({
      code: z.string().trim().regex(/^\d+(\.\d+)*$/, 'El código debe ser numérico, por ejemplo 5.12'),
      name: z.string().trim().min(2),
      type: z.enum(ACCOUNT_TYPES),
      parentId: z.string().uuid().optional().nullable(),
    })
    .parse(req.body);
  if (b.parentId) {
    const parent = await one(pool, 'SELECT type FROM accounts WHERE id = $1 AND company_id = $2', [b.parentId, req.company!.id]);
    if (!parent) throw notFound('Cuenta padre');
    if (parent.type !== b.type) throw badRequest('La cuenta debe ser del mismo tipo que su cuenta padre');
  }
  const a = await one(pool, 'INSERT INTO accounts(company_id, code, name, type, parent_id) VALUES ($1,$2,$3,$4,$5) RETURNING *', [
    req.company!.id, b.code, b.name, b.type, b.parentId ?? null,
  ]);
  await audit(pool, { ...ctx(req), action: 'create', entity: 'account', entityId: a.id, data: b });
  res.status(201).json(toRow(a));
});

accountsRouter.patch('/:id', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const b = z.object({ name: z.string().trim().min(2).optional(), isActive: z.boolean().optional() }).parse(req.body);
  const current = await one(pool, 'SELECT * FROM accounts WHERE id = $1 AND company_id = $2', [String(req.params.id), req.company!.id]);
  if (!current) throw notFound('Cuenta');
  if (b.isActive === false && current.system_key) throw badRequest('Las cuentas del sistema no se pueden desactivar');
  const a = await one(pool, 'UPDATE accounts SET name = COALESCE($2, name), is_active = COALESCE($3, is_active) WHERE id = $1 RETURNING *', [
    String(req.params.id), b.name ?? null, b.isActive ?? null,
  ]);
  await audit(pool, { ...ctx(req), action: 'update', entity: 'account', entityId: a.id, data: b });
  res.json(toRow(a));
});
