import { Router } from 'express';
import { z } from 'zod';
import { one, pool, query } from '../db.js';
import { WRITERS, ctx, requireCompany } from '../middleware/auth.js';
import { notFound } from '../middleware/errors.js';
import { audit } from '../lib/audit.js';

export const contactsRouter = Router();

const fields = z.object({
  kind: z.enum(['customer', 'supplier', 'both']).default('customer'),
  name: z.string().trim().min(1, 'Escribe el nombre'),
  taxId: z.string().trim().optional().nullable(),
  email: z.string().trim().email('Correo no válido').optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  /** Régimen del cliente: define si te aplicará retención del IR. */
  taxRegime: z.enum(['consumidor_final', 'cuota_fija', 'general']).default('consumidor_final'),
  /** Institución del Estado (afecta el límite de la cuota fija). */
  isState: z.boolean().default(false),
});

const toRow = (c: any) => ({ id: c.id, kind: c.kind, name: c.name, taxId: c.tax_id, email: c.email, phone: c.phone, address: c.address, taxRegime: c.tax_regime, isState: c.is_state, balance: c.balance });

contactsRouter.get('/', requireCompany(), async (req, res) => {
  const { kind, q } = z.object({ kind: z.enum(['customer', 'supplier']).optional(), q: z.string().optional() }).parse(req.query);
  const rows = await query(
    pool,
    `SELECT c.*,
       COALESCE((SELECT SUM(i.total - i.amount_paid) FROM invoices i WHERE i.contact_id = c.id AND i.status IN ('issued','partial')), 0)
       - COALESCE((SELECT SUM(e.total) FROM expenses e WHERE e.contact_id = c.id AND e.status = 'unpaid'), 0) AS balance
     FROM contacts c
     WHERE c.company_id = $1 AND ($2::text IS NULL OR c.kind = $2 OR c.kind = 'both')
       AND ($3::text IS NULL OR c.name ILIKE '%' || $3 || '%' OR c.tax_id ILIKE '%' || $3 || '%')
     ORDER BY c.name`,
    [req.company!.id, kind ?? null, q ?? null],
  );
  res.json(rows.map(toRow));
});

contactsRouter.get('/:id', requireCompany(), async (req, res) => {
  const c = await one(pool, 'SELECT * FROM contacts WHERE id = $1 AND company_id = $2', [String(req.params.id), req.company!.id]);
  if (!c) throw notFound('Contacto');
  res.json(toRow(c));
});

contactsRouter.post('/', requireCompany(...WRITERS), async (req, res) => {
  const b = fields.parse(req.body);
  const c = await one(
    pool,
    'INSERT INTO contacts(company_id, kind, name, tax_id, email, phone, address, tax_regime, is_state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
    [req.company!.id, b.kind, b.name, b.taxId || null, b.email || null, b.phone || null, b.address || null, b.taxRegime, b.isState],
  );
  await audit(pool, { ...ctx(req), action: 'create', entity: 'contact', entityId: c.id });
  res.status(201).json(toRow(c));
});

contactsRouter.put('/:id', requireCompany(...WRITERS), async (req, res) => {
  const b = fields.parse(req.body);
  const c = await one(
    pool,
    `UPDATE contacts SET kind=$3, name=$4, tax_id=$5, email=$6, phone=$7, address=$8, tax_regime=$9, is_state=$10 WHERE id=$1 AND company_id=$2 RETURNING *`,
    [String(req.params.id), req.company!.id, b.kind, b.name, b.taxId || null, b.email || null, b.phone || null, b.address || null, b.taxRegime, b.isState],
  );
  if (!c) throw notFound('Contacto');
  await audit(pool, { ...ctx(req), action: 'update', entity: 'contact', entityId: c.id, data: b });
  res.json(toRow(c));
});

contactsRouter.delete('/:id', requireCompany(...WRITERS), async (req, res) => {
  // Si tiene facturas o gastos, la base de datos lo impide (error 409)
  const r = await pool.query('DELETE FROM contacts WHERE id = $1 AND company_id = $2', [String(req.params.id), req.company!.id]);
  if (!r.rowCount) throw notFound('Contacto');
  await audit(pool, { ...ctx(req), action: 'delete', entity: 'contact', entityId: String(req.params.id) });
  res.status(204).end();
});
