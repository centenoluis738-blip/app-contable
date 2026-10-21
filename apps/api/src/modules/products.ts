import { Router } from 'express';
import { z } from 'zod';
import { D, money, TAX_CODES } from '@contable/shared';
import { one, pool, query, tx } from '../db.js';
import { WRITERS, ctx, requireCompany } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/errors.js';
import { audit } from '../lib/audit.js';
import { createEntry, systemAccount } from '../lib/journal.js';
import { amount, isoDate, positiveAmount, today } from '../lib/validation.js';

export const productsRouter = Router();

const fields = z.object({
  kind: z.enum(['product', 'service']).default('service'),
  name: z.string().trim().min(1, 'Escribe el nombre'),
  sku: z.string().trim().optional().nullable(),
  price: amount.default('0'),
  /** IVA15 (gravado 15 %), IVA0 (tasa cero, exportación) o EXENTO (canasta básica, medicinas, salud, educación). */
  taxCode: z.enum(['IVA15', 'IVA0', 'EXENTO']).default('IVA15'),
  trackStock: z.boolean().default(false),
});

const toRow = (p: any) => ({
  id: p.id, kind: p.kind, name: p.name, sku: p.sku, price: p.price, taxCode: p.tax_code, taxRate: p.tax_rate,
  trackStock: p.track_stock, stock: p.stock, avgCost: p.avg_cost,
});

productsRouter.get('/', requireCompany(), async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : null;
  const rows = await query(
    pool,
    `SELECT * FROM products WHERE company_id = $1 AND ($2::text IS NULL OR name ILIKE '%' || $2 || '%' OR sku ILIKE '%' || $2 || '%') ORDER BY name`,
    [req.company!.id, q],
  );
  res.json(rows.map(toRow));
});

productsRouter.post('/', requireCompany(...WRITERS), async (req, res) => {
  const b = fields.parse(req.body);
  const p = await one(
    pool,
    `INSERT INTO products(company_id, kind, name, sku, price, tax_code, tax_rate, track_stock) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.company!.id, b.kind, b.name, b.sku || null, b.price, b.taxCode, TAX_CODES[b.taxCode].rate, b.kind === 'product' && b.trackStock],
  );
  await audit(pool, { ...ctx(req), action: 'create', entity: 'product', entityId: p.id });
  res.status(201).json(toRow(p));
});

productsRouter.put('/:id', requireCompany(...WRITERS), async (req, res) => {
  const b = fields.parse(req.body);
  const p = await one(
    pool,
    `UPDATE products SET kind=$3, name=$4, sku=$5, price=$6, tax_code=$7, tax_rate=$8, track_stock=$9 WHERE id=$1 AND company_id=$2 RETURNING *`,
    [String(req.params.id), req.company!.id, b.kind, b.name, b.sku || null, b.price, b.taxCode, TAX_CODES[b.taxCode].rate, b.kind === 'product' && b.trackStock],
  );
  if (!p) throw notFound('Producto');
  await audit(pool, { ...ctx(req), action: 'update', entity: 'product', entityId: p.id, data: b });
  res.json(toRow(p));
});

productsRouter.delete('/:id', requireCompany(...WRITERS), async (req, res) => {
  const r = await pool.query('DELETE FROM products WHERE id = $1 AND company_id = $2', [String(req.params.id), req.company!.id]);
  if (!r.rowCount) throw notFound('Producto');
  await audit(pool, { ...ctx(req), action: 'delete', entity: 'product', entityId: String(req.params.id) });
  res.status(204).end();
});

/**
 * Entrada de mercadería (compra para revender). Recalcula el costo promedio ponderado:
 * (existencias × costo actual + cantidad × costo de compra) ÷ (existencias + cantidad).
 * Asiento: Inventario (debe) contra Bancos, Caja o Proveedores (haber). El IVA de la compra se registra como gasto aparte si aplica.
 */
productsRouter.post('/:id/stock-in', requireCompany(...WRITERS), async (req, res) => {
  const b = z
    .object({
      date: isoDate.default(today()),
      quantity: positiveAmount,
      unitCost: positiveAmount,
      paidWith: z.enum(['bank', 'cash', 'payable']).default('bank'),
      reference: z.string().optional(),
    })
    .parse(req.body);
  const product = await tx(async (client) => {
    const companyId = req.company!.id;
    const p = await one(client, 'SELECT * FROM products WHERE id = $1 AND company_id = $2 FOR UPDATE', [String(req.params.id), companyId]);
    if (!p) throw notFound('Producto');
    if (!p.track_stock) throw badRequest('Activa el control de existencias de este producto');
    const stock = D(p.stock).isNeg() ? D(0) : D(p.stock);
    const newStock = stock.plus(b.quantity);
    const avg = stock.times(p.avg_cost).plus(D(b.quantity).times(b.unitCost)).dividedBy(newStock);
    const total = money(D(b.quantity).times(b.unitCost));
    const entryId = await createEntry(client, {
      companyId, userId: req.user!.id, date: b.date, sourceType: 'inventory', sourceId: p.id,
      description: `Entrada de inventario: ${Number(b.quantity)} × ${p.name}${b.reference ? ` (${b.reference})` : ''}`,
      lines: [
        { accountId: await systemAccount(client, companyId, 'inventory'), debit: total },
        { accountId: await systemAccount(client, companyId, b.paidWith), credit: total },
      ],
    });
    await client.query(
      `INSERT INTO inventory_moves(company_id, product_id, date, kind, quantity, unit_cost, source_type, journal_entry_id) VALUES ($1,$2,$3,'in',$4,$5,'purchase',$6)`,
      [companyId, p.id, b.date, b.quantity, b.unitCost, entryId],
    );
    const updated = await one(client, 'UPDATE products SET stock = $2, avg_cost = $3 WHERE id = $1 RETURNING *', [p.id, newStock.toFixed(3), avg.toFixed(4)]);
    await audit(client, { ...ctx(req), action: 'stock_in', entity: 'product', entityId: p.id, data: b });
    return updated;
  });
  res.status(201).json(toRow(product));
});

productsRouter.get('/:id/moves', requireCompany(), async (req, res) => {
  const rows = await query(
    pool,
    'SELECT date, kind, quantity, unit_cost, source_type FROM inventory_moves WHERE product_id = $1 AND company_id = $2 ORDER BY date DESC, created_at DESC',
    [String(req.params.id), req.company!.id],
  );
  res.json(rows);
});
