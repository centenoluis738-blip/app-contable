import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '@contable/shared';
import { one, pool, query, tx } from '../db.js';
import { ACCOUNTANTS, ctx, requireCompany } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/errors.js';
import { createDefaultChart } from '../lib/journal.js';
import { audit } from '../lib/audit.js';
import { amount, isoDate, rate, positiveAmount } from '../lib/validation.js';

export const companiesRouter = Router();

const companyFields = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre de la empresa'),
  taxId: z.string().trim().optional(),
  country: z.string().length(2).toUpperCase().default('NI'),
  currency: z.string().length(3).toUpperCase().default('NIO'),
  taxRegime: z.enum(['cuota_fija', 'general']).default('cuota_fija'),
  defaultTaxRate: rate.default(15),
  fixedFee: amount.default('0'),
  imiRate: rate.default(1),
  pmdRate: rate.default(1),
  municipality: z.string().optional().nullable(),
  invoiceAuthorization: z.string().optional().nullable(),
  address: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  invoiceSeries: z.string().trim().min(1).max(10).default('A'),
  /** Modo sencillo: menú reducido y venta rápida. */
  simpleMode: z.boolean().default(true),
});

const toRow = (c: Record<string, any>) => ({
  id: c.id,
  name: c.name,
  taxId: c.tax_id,
  country: c.country,
  currency: c.currency,
  taxRegime: c.tax_regime,
  defaultTaxRate: c.default_tax_rate,
  address: c.address,
  email: c.email,
  phone: c.phone,
  invoiceSeries: c.invoice_series,
  nextInvoiceNumber: c.next_invoice_number,
  lockedUntil: c.locked_until,
  fixedFee: c.fixed_fee,
  imiRate: c.imi_rate,
  pmdRate: c.pmd_rate,
  municipality: c.municipality,
  invoiceAuthorization: c.invoice_authorization,
  simpleMode: c.simple_mode,
  role: c.role,
});

companiesRouter.get('/', async (req, res) => {
  const rows = await query(
    pool,
    `SELECT c.*, m.role FROM companies c JOIN memberships m ON m.company_id = c.id WHERE m.user_id = $1 ORDER BY c.name`,
    [req.user!.id],
  );
  res.json(rows.map(toRow));
});

companiesRouter.post('/', async (req, res) => {
  const body = companyFields.parse(req.body);
  const company = await tx(async (client) => {
    const c = await one(
      client,
      `INSERT INTO companies(name, tax_id, country, currency, tax_regime, default_tax_rate, address, email, phone, invoice_series,
         fixed_fee, imi_rate, pmd_rate, municipality, invoice_authorization, simple_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [body.name, body.taxId, body.country, body.currency, body.taxRegime, body.defaultTaxRate, body.address, body.email || null, body.phone,
        body.invoiceSeries, body.fixedFee, body.imiRate, body.pmdRate, body.municipality ?? null, body.invoiceAuthorization ?? null, body.simpleMode],
    );
    await client.query(`INSERT INTO memberships(user_id, company_id, role) VALUES ($1,$2,'owner')`, [req.user!.id, c.id]);
    await createDefaultChart(client, c.id);
    await audit(client, { companyId: c.id, userId: req.user!.id, action: 'create', entity: 'company', entityId: c.id });
    return { ...c, role: 'owner' };
  });
  res.status(201).json(toRow(company));
});

companiesRouter.get('/current', requireCompany(), async (req, res) => {
  const c = await one(pool, 'SELECT * FROM companies WHERE id = $1', [req.company!.id]);
  res.json(toRow({ ...c, role: req.company!.role }));
});

companiesRouter.patch('/current', requireCompany('owner'), async (req, res) => {
  const body = companyFields.partial().parse(req.body);
  // Con .partial() los valores por defecto no deben pisar lo que ya existe
  for (const k of Object.keys(body) as (keyof typeof body)[]) if (!(k in req.body)) delete body[k];
  const map: Record<string, string> = {
    name: 'name', taxId: 'tax_id', country: 'country', currency: 'currency', taxRegime: 'tax_regime',
    defaultTaxRate: 'default_tax_rate', address: 'address', email: 'email', phone: 'phone', invoiceSeries: 'invoice_series',
    fixedFee: 'fixed_fee', imiRate: 'imi_rate', pmdRate: 'pmd_rate', municipality: 'municipality', invoiceAuthorization: 'invoice_authorization',
    simpleMode: 'simple_mode',
  };
  const entries = Object.entries(body).filter(([k, v]) => v !== undefined && map[k]);
  if (!entries.length) throw badRequest('No hay cambios');
  const sets = entries.map(([k], i) => `${map[k]} = $${i + 2}`).join(', ');
  const c = await one(pool, `UPDATE companies SET ${sets} WHERE id = $1 RETURNING *`, [req.company!.id, ...entries.map(([, v]) => v)]);
  await audit(pool, { ...ctx(req), action: 'update', entity: 'company', entityId: c.id, data: body });
  res.json(toRow({ ...c, role: req.company!.role }));
});

/** Cierre de período: impide registrar o modificar operaciones hasta la fecha indicada. */
companiesRouter.post('/current/close-period', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const { until } = z.object({ until: isoDate }).parse(req.body);
  const current = req.company!.lockedUntil;
  if (current && until < current) throw badRequest(`El período ya está cerrado hasta ${current}`);
  await pool.query('UPDATE companies SET locked_until = $2 WHERE id = $1', [req.company!.id, until]);
  await audit(pool, { ...ctx(req), action: 'close_period', entity: 'company', entityId: req.company!.id, data: { until } });
  res.json({ lockedUntil: until });
});

companiesRouter.get('/current/members', requireCompany(), async (req, res) => {
  const rows = await query(
    pool,
    `SELECT u.id, u.name, u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.company_id = $1 ORDER BY u.name`,
    [req.company!.id],
  );
  res.json(rows);
});

companiesRouter.post('/current/members', requireCompany('owner'), async (req, res) => {
  const body = z.object({ email: z.string().trim().toLowerCase().email(), role: z.enum(ROLES) }).parse(req.body);
  const user = await one(pool, 'SELECT id, name, email FROM users WHERE email = $1', [body.email]);
  if (!user) throw notFound('Usuario (debe registrarse primero)');
  await pool.query(
    `INSERT INTO memberships(user_id, company_id, role) VALUES ($1,$2,$3) ON CONFLICT (user_id, company_id) DO UPDATE SET role = EXCLUDED.role`,
    [user.id, req.company!.id, body.role],
  );
  await audit(pool, { ...ctx(req), action: 'add_member', entity: 'membership', entityId: user.id, data: body });
  res.status(201).json({ ...user, role: body.role });
});

companiesRouter.delete('/current/members/:userId', requireCompany('owner'), async (req, res) => {
  if (String(req.params.userId) === req.user!.id) throw badRequest('No puedes quitarte a ti mismo de la empresa');
  await pool.query('DELETE FROM memberships WHERE company_id = $1 AND user_id = $2', [req.company!.id, String(req.params.userId)]);
  await audit(pool, { ...ctx(req), action: 'remove_member', entity: 'membership', entityId: String(req.params.userId) });
  res.status(204).end();
});

companiesRouter.get('/current/audit-log', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const rows = await query(
    pool,
    `SELECT a.id, a.action, a.entity, a.entity_id, a.data, a.created_at, u.name AS user_name
     FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.company_id = $1 ORDER BY a.id DESC LIMIT 200`,
    [req.company!.id],
  );
  res.json(rows);
});

/** Tipo de cambio oficial del BCN (córdobas por dólar u otra moneda), por fecha. */
companiesRouter.get('/current/exchange-rates', requireCompany(), async (req, res) => {
  const rows = await query(
    pool,
    'SELECT currency, date, rate FROM exchange_rates WHERE company_id = $1 ORDER BY date DESC, currency LIMIT 120',
    [req.company!.id],
  );
  res.json(rows);
});

companiesRouter.post('/current/exchange-rates', requireCompany(...ACCOUNTANTS, 'employee'), async (req, res) => {
  const b = z
    .object({ currency: z.string().length(3).toUpperCase().default('USD'), date: isoDate, rate: positiveAmount })
    .parse(req.body);
  await pool.query(
    `INSERT INTO exchange_rates(company_id, currency, date, rate) VALUES ($1,$2,$3,$4)
     ON CONFLICT (company_id, currency, date) DO UPDATE SET rate = EXCLUDED.rate`,
    [req.company!.id, b.currency, b.date, b.rate],
  );
  await audit(pool, { ...ctx(req), action: 'exchange_rate', entity: 'company', entityId: req.company!.id, data: b });
  res.status(201).json(b);
});
