import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { calcDocument, D, expectedWithholding, money, NI, TAX_CODES, WITHHOLDINGS, type WithholdingType } from '@contable/shared';
import { one, pool, query, tx } from '../db.js';
import { ACCOUNTANTS, WRITERS, ctx, requireCompany } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/errors.js';
import { createEntry, reverseEntry, systemAccount, type EntryLine } from '../lib/journal.js';
import { audit } from '../lib/audit.js';
import { getRate } from '../lib/fx.js';
import { amount, isoDate, pagination, positiveAmount, rate, today } from '../lib/validation.js';
import { invoicePdf } from '../lib/pdf.js';

export const invoicesRouter = Router();

const lineSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1, 'Describe la línea'),
  quantity: positiveAmount,
  unitPrice: amount,
  discount: rate.default(0),
  taxCode: z.enum(['IVA15', 'IVA0', 'EXENTO']).default('IVA15'),
});

const invoiceSchema = z.object({
  contactId: z.string().uuid('Elige un cliente'),
  issueDate: isoDate.default(today()),
  dueDate: isoDate.optional().nullable(),
  /** Moneda de la factura (NIO o USD). La contabilidad siempre se registra en córdobas. */
  currency: z.string().length(3).toUpperCase().optional(),
  notes: z.string().optional().nullable(),
  /** Tipo de retención del IR que te aplicará el cliente (si es del régimen general). */
  withholdingType: z.enum(Object.keys(WITHHOLDINGS) as [WithholdingType, ...WithholdingType[]]).default('ninguna'),
  lines: z.array(lineSchema).min(1, 'Agrega al menos una línea'),
});

const paymentSchema = z.object({
  date: isoDate.default(today()),
  /** Importe que se descuenta del saldo de la factura (en la moneda de la factura), incluida la retención. */
  amount: positiveAmount,
  /** Parte del importe que el cliente retuvo como IR (te entrega constancia de retención). */
  withheld: amount.default('0'),
  method: z.enum(['transfer', 'cash', 'card', 'check', 'other']).default('transfer'),
  reference: z.string().optional().nullable(),
});

function warnings(i: any): string[] {
  const list: string[] = [];
  if (i.company_regime === 'cuota_fija' && i.contact_is_state && D(i.total).times(i.exchange_rate).gt(NI.cuotaFijaMaxStateSale)) {
    list.push(`Venta al Estado mayor a C$ ${NI.cuotaFijaMaxStateSale.toLocaleString('es-NI')}: con esta operación quedas excluido del régimen de cuota fija y debes pasar al régimen general.`);
  }
  return list;
}

const summary = (i: any) => ({
  id: i.id, series: i.series, number: i.number, issueDate: i.issue_date, dueDate: i.due_date, status: i.status,
  currency: i.currency, exchangeRate: i.exchange_rate, subtotal: i.subtotal, taxTotal: i.tax_total, total: i.total, amountPaid: i.amount_paid,
  balance: money(D(i.total).minus(i.amount_paid)), notes: i.notes, contactId: i.contact_id, contactName: i.contact_name,
  contactRegime: i.contact_regime, withholdingType: i.withholding_type, withholdingRate: i.withholding_rate, withholdingAmount: i.withholding_amount,
  overdue: ['issued', 'partial'].includes(i.status) && !!i.due_date && i.due_date < today(),
  warnings: warnings(i),
});

async function loadInvoice(db: PoolClient | typeof pool, companyId: string, id: string, lock = false) {
  const inv = await one(
    db,
    `SELECT i.*, c.name AS contact_name, c.tax_regime AS contact_regime, c.is_state AS contact_is_state, co.tax_regime AS company_regime
     FROM invoices i JOIN contacts c ON c.id = i.contact_id JOIN companies co ON co.id = i.company_id
     WHERE i.id = $1 AND i.company_id = $2 ${lock ? 'FOR UPDATE OF i' : ''}`,
    [id, companyId],
  );
  if (!inv) throw notFound('Factura');
  return inv;
}

/**
 * Guarda las líneas y recalcula totales y retención esperada. En el régimen de cuota fija
 * no se traslada IVA: todas las líneas van con impuesto 0.
 */
async function saveInvoice(client: PoolClient, invoiceId: string, companyId: string, b: z.infer<typeof invoiceSchema>) {
  const company = await one(client, 'SELECT tax_regime FROM companies WHERE id = $1', [companyId]);
  const contact = await one(client, 'SELECT tax_regime FROM contacts WHERE id = $1', [b.contactId]);
  const inv = await one(client, 'SELECT currency, issue_date FROM invoices WHERE id = $1', [invoiceId]);
  const rateFor = (code: keyof typeof TAX_CODES) => (company.tax_regime === 'cuota_fija' ? 0 : TAX_CODES[code].rate);
  const lines = b.lines.map((l) => ({ ...l, taxRate: rateFor(l.taxCode) }));
  const totals = calcDocument(lines);
  await client.query('DELETE FROM invoice_lines WHERE invoice_id = $1', [invoiceId]);
  for (const [i, l] of lines.entries()) {
    const t = totals.lines[i];
    await client.query(
      `INSERT INTO invoice_lines(invoice_id, position, product_id, description, quantity, unit_price, discount, tax_code, tax_rate, subtotal, tax, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [invoiceId, i + 1, l.productId ?? null, l.description, l.quantity, l.unitPrice, l.discount, l.taxCode, l.taxRate, t.subtotal, t.tax, t.total],
    );
  }
  const fx = await getRate(client, companyId, inv.currency, inv.issue_date);
  const wht = expectedWithholding(b.withholdingType, D(totals.subtotal).times(fx), contact.tax_regime);
  const whtInvoiceCurrency = money(D(wht.amount).dividedBy(fx));
  await client.query(
    `UPDATE invoices SET subtotal = $2, tax_total = $3, total = $4, exchange_rate = $5, withholding_type = $6, withholding_rate = $7, withholding_amount = $8
     WHERE id = $1`,
    [invoiceId, totals.subtotal, totals.taxTotal, totals.total, fx, b.withholdingType, wht.rate, whtInvoiceCurrency],
  );
}

async function assertCustomer(client: PoolClient, companyId: string, contactId: string) {
  const c = await one(client, `SELECT kind FROM contacts WHERE id = $1 AND company_id = $2`, [contactId, companyId]);
  if (!c) throw notFound('Cliente');
  if (c.kind === 'supplier') throw badRequest('El contacto elegido es un proveedor, no un cliente');
}

invoicesRouter.get('/', requireCompany(), async (req, res) => {
  const f = pagination
    .extend({ status: z.string().optional(), contactId: z.string().uuid().optional(), from: isoDate.optional(), to: isoDate.optional(), q: z.string().optional() })
    .parse(req.query);
  const rows = await query(
    pool,
    `SELECT i.*, c.name AS contact_name, c.tax_regime AS contact_regime, c.is_state AS contact_is_state, co.tax_regime AS company_regime
     FROM invoices i JOIN contacts c ON c.id = i.contact_id JOIN companies co ON co.id = i.company_id
     WHERE i.company_id = $1 AND ($2::text IS NULL OR i.status = ANY(string_to_array($2, ',')))
       AND ($3::uuid IS NULL OR i.contact_id = $3) AND ($4::date IS NULL OR i.issue_date >= $4) AND ($5::date IS NULL OR i.issue_date <= $5)
       AND ($6::text IS NULL OR c.name ILIKE '%' || $6 || '%' OR (i.series || '-' || i.number) ILIKE '%' || $6 || '%')
     ORDER BY i.issue_date DESC, i.number DESC NULLS FIRST LIMIT $7 OFFSET $8`,
    [req.company!.id, f.status ?? null, f.contactId ?? null, f.from ?? null, f.to ?? null, f.q ?? null, f.limit, f.offset],
  );
  res.json(rows.map(summary));
});

invoicesRouter.get('/:id', requireCompany(), async (req, res) => {
  const inv = await loadInvoice(pool, req.company!.id, String(req.params.id));
  const lines = await query(pool, 'SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY position', [inv.id]);
  const payments = await query(pool, 'SELECT id, date, amount, withheld, method, reference, exchange_rate FROM payments WHERE invoice_id = $1 ORDER BY date', [inv.id]);
  res.json({
    ...summary(inv),
    lines: lines.map((l) => ({
      id: l.id, productId: l.product_id, description: l.description, quantity: l.quantity, unitPrice: l.unit_price,
      discount: l.discount, taxCode: l.tax_code, taxRate: l.tax_rate, subtotal: l.subtotal, tax: l.tax, total: l.total,
    })),
    payments: payments.map((p) => ({ id: p.id, date: p.date, amount: p.amount, withheld: p.withheld, method: p.method, reference: p.reference, exchangeRate: p.exchange_rate })),
    taxBreakdown: calcDocument(lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unit_price, discount: l.discount, taxRate: l.tax_rate }))).taxBreakdown,
  });
});

/** Crea una factura en borrador. Con issue=true se emite en el mismo paso. */
invoicesRouter.post('/', requireCompany(...WRITERS), async (req, res) => {
  const b = invoiceSchema.extend({ issue: z.boolean().default(false) }).parse(req.body);
  const id = await tx(async (client) => {
    await assertCustomer(client, req.company!.id, b.contactId);
    const company = await one(client, 'SELECT invoice_series, currency FROM companies WHERE id = $1', [req.company!.id]);
    const inv = await one(
      client,
      `INSERT INTO invoices(company_id, contact_id, series, issue_date, due_date, currency, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [req.company!.id, b.contactId, company.invoice_series, b.issueDate, b.dueDate ?? null, b.currency ?? company.currency, b.notes ?? null, req.user!.id],
    );
    await saveInvoice(client, inv.id, req.company!.id, b);
    await audit(client, { ...ctx(req), action: 'create', entity: 'invoice', entityId: inv.id });
    if (b.issue) await issueInvoice(client, req.company!.id, inv.id, req.user!.id);
    return inv.id;
  });
  res.status(201).json(summary(await loadInvoice(pool, req.company!.id, id)));
});

invoicesRouter.put('/:id', requireCompany(...WRITERS), async (req, res) => {
  const b = invoiceSchema.parse(req.body);
  await tx(async (client) => {
    const inv = await loadInvoice(client, req.company!.id, String(req.params.id), true);
    if (inv.status !== 'draft') throw badRequest('Solo se pueden editar facturas en borrador; una emitida se anula');
    await assertCustomer(client, req.company!.id, b.contactId);
    await client.query('UPDATE invoices SET contact_id=$2, issue_date=$3, due_date=$4, notes=$5, currency=$6 WHERE id=$1', [
      inv.id, b.contactId, b.issueDate, b.dueDate ?? null, b.notes ?? null, b.currency ?? inv.currency,
    ]);
    await saveInvoice(client, inv.id, req.company!.id, b);
    await audit(client, { ...ctx(req), action: 'update', entity: 'invoice', entityId: inv.id });
  });
  res.json(summary(await loadInvoice(pool, req.company!.id, String(req.params.id))));
});

invoicesRouter.delete('/:id', requireCompany(...WRITERS), async (req, res) => {
  await tx(async (client) => {
    const inv = await loadInvoice(client, req.company!.id, String(req.params.id), true);
    if (inv.status !== 'draft') throw badRequest('Solo se pueden borrar borradores; una factura emitida se anula');
    await client.query('DELETE FROM invoices WHERE id = $1', [inv.id]);
    await audit(client, { ...ctx(req), action: 'delete', entity: 'invoice', entityId: inv.id });
  });
  res.status(204).end();
});

/**
 * Emite la factura: número correlativo y asiento en córdobas
 * Clientes (debe) contra Ventas e IVA por pagar (haber). Si hay productos con inventario,
 * registra también Costo de ventas (debe) contra Inventario (haber) al costo promedio.
 */
async function issueInvoice(client: PoolClient, companyId: string, id: string, userId: string) {
  const inv = await loadInvoice(client, companyId, id, true);
  if (inv.status !== 'draft') throw badRequest('La factura ya fue emitida');
  if (D(inv.total).lte(0)) throw badRequest('El total de la factura debe ser mayor que cero');
  // El tipo de cambio se fija a la fecha de emisión
  const fx = await getRate(client, companyId, inv.currency, inv.issue_date);
  const totalNio = money(D(inv.total).times(fx));
  const subtotalNio = money(D(inv.subtotal).times(fx));
  const taxNio = money(D(totalNio).minus(subtotalNio));

  const stockLines = await query(
    client,
    `SELECT l.id, l.quantity, p.id AS product_id, p.name, p.stock, p.avg_cost FROM invoice_lines l JOIN products p ON p.id = l.product_id
     WHERE l.invoice_id = $1 AND p.track_stock FOR UPDATE OF p`,
    [id],
  );
  let cost = D(0);
  for (const l of stockLines) {
    if (D(l.stock).lt(l.quantity)) throw badRequest(`No hay existencias suficientes de "${l.name}" (quedan ${Number(l.stock)})`);
    cost = cost.plus(D(l.quantity).times(l.avg_cost));
  }

  const company = await one(client, 'SELECT next_invoice_number FROM companies WHERE id = $1 FOR UPDATE', [companyId]);
  const number = company.next_invoice_number;
  const lines: EntryLine[] = [
    { accountId: await systemAccount(client, companyId, 'receivable'), debit: totalNio },
    { accountId: await systemAccount(client, companyId, 'sales'), credit: subtotalNio },
    { accountId: await systemAccount(client, companyId, 'vatPayable'), credit: taxNio },
  ];
  if (cost.gt(0)) {
    lines.push(
      { accountId: await systemAccount(client, companyId, 'costOfSales'), debit: money(cost) },
      { accountId: await systemAccount(client, companyId, 'inventory'), credit: money(cost) },
    );
  }
  const entryId = await createEntry(client, {
    companyId, userId, date: inv.issue_date, sourceType: 'invoice', sourceId: inv.id,
    description: `Factura ${inv.series}-${number} a ${inv.contact_name}${inv.currency !== 'NIO' ? ` (${inv.currency} a ${fx})` : ''}`,
    lines,
  });
  for (const l of stockLines) {
    await client.query('UPDATE products SET stock = stock - $2 WHERE id = $1', [l.product_id, l.quantity]);
    await client.query('UPDATE invoice_lines SET unit_cost = $2 WHERE id = $1', [l.id, l.avg_cost]);
    await client.query(
      `INSERT INTO inventory_moves(company_id, product_id, date, kind, quantity, unit_cost, source_type, source_id, journal_entry_id)
       VALUES ($1,$2,$3,'out',$4,$5,'invoice',$6,$7)`,
      [companyId, l.product_id, inv.issue_date, l.quantity, l.avg_cost, id, entryId],
    );
  }
  await client.query('UPDATE companies SET next_invoice_number = next_invoice_number + 1 WHERE id = $1', [companyId]);
  await client.query(`UPDATE invoices SET status = 'issued', number = $2, journal_entry_id = $3, exchange_rate = $4 WHERE id = $1`, [id, number, entryId, fx]);
  await audit(client, { companyId, userId, action: 'issue', entity: 'invoice', entityId: id, data: { number } });
}

invoicesRouter.post('/:id/issue', requireCompany(...WRITERS), async (req, res) => {
  await tx((client) => issueInvoice(client, req.company!.id, String(req.params.id), req.user!.id));
  res.json(summary(await loadInvoice(pool, req.company!.id, String(req.params.id))));
});

/**
 * Registra un cobro (total o parcial). Asiento en córdobas:
 * Bancos/Caja (lo recibido) + Retenciones IR por acreditar (lo retenido) contra Clientes (al tipo de cambio de la factura).
 * En facturas en dólares, la diferencia entre el tipo de cambio de la factura y el del cobro es ganancia o pérdida cambiaria.
 */
export async function registerPayment(
  client: PoolClient,
  companyId: string,
  userId: string,
  invoiceId: string,
  p: z.infer<typeof paymentSchema>,
): Promise<{ paymentId: string; entryId: string }> {
  const inv = await loadInvoice(client, companyId, invoiceId, true);
  if (!['issued', 'partial'].includes(inv.status)) throw badRequest('Solo se pueden cobrar facturas emitidas y pendientes');
  const pending = D(inv.total).minus(inv.amount_paid);
  if (D(p.amount).gt(pending)) throw badRequest(`El cobro supera el saldo pendiente (${money(pending)})`);
  if (D(p.withheld).gte(p.amount)) throw badRequest('La retención no puede ser igual o mayor al importe cobrado');
  if (D(p.withheld).gt(0) && inv.contact_regime === 'consumidor_final') {
    throw badRequest('Un consumidor final no aplica retenciones; revisa el régimen del cliente');
  }
  const payFx = await getRate(client, companyId, inv.currency, p.date);
  const receivedNio = money(D(p.amount).minus(p.withheld).times(payFx));
  const withheldNio = money(D(p.withheld).times(payFx));
  const arNio = money(D(p.amount).times(inv.exchange_rate));
  const diff = D(receivedNio).plus(withheldNio).minus(arNio);
  const lines: EntryLine[] = [
    { accountId: await systemAccount(client, companyId, p.method === 'cash' ? 'cash' : 'bank'), debit: receivedNio },
    { accountId: await systemAccount(client, companyId, 'whtReceivable'), debit: withheldNio },
    { accountId: await systemAccount(client, companyId, 'receivable'), credit: arNio },
  ];
  if (diff.gt(0)) lines.push({ accountId: await systemAccount(client, companyId, 'fxGain'), credit: money(diff) });
  if (diff.lt(0)) lines.push({ accountId: await systemAccount(client, companyId, 'fxLoss'), debit: money(diff.abs()) });
  const entryId = await createEntry(client, {
    companyId, userId, date: p.date, sourceType: 'payment', sourceId: inv.id,
    description: `Cobro de la factura ${inv.series}-${inv.number}${D(p.withheld).gt(0) ? ' con retención IR' : ''}`,
    lines,
  });
  const pay = await one(
    client,
    `INSERT INTO payments(company_id, invoice_id, date, amount, withheld, method, reference, exchange_rate, journal_entry_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [companyId, inv.id, p.date, p.amount, p.withheld, p.method, p.reference ?? null, payFx, entryId],
  );
  const paid = D(inv.amount_paid).plus(p.amount);
  await client.query('UPDATE invoices SET amount_paid = $2, status = $3 WHERE id = $1', [inv.id, money(paid), paid.gte(inv.total) ? 'paid' : 'partial']);
  await audit(client, { companyId, userId, action: 'payment', entity: 'invoice', entityId: inv.id, data: p });
  return { paymentId: pay.id, entryId };
}

invoicesRouter.post('/:id/payments', requireCompany(...WRITERS), async (req, res) => {
  const p = paymentSchema.parse(req.body);
  await tx((client) => registerPayment(client, req.company!.id, req.user!.id, String(req.params.id), p));
  res.status(201).json(summary(await loadInvoice(pool, req.company!.id, String(req.params.id))));
});

/** Anula una factura emitida: revierte su asiento (y el costo de ventas) y los de sus cobros. Requiere dueño o contador. */
invoicesRouter.post('/:id/void', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const b = z.object({ reason: z.string().trim().min(3, 'Indica el motivo'), date: isoDate.default(today()) }).parse(req.body);
  await tx(async (client) => {
    const inv = await loadInvoice(client, req.company!.id, String(req.params.id), true);
    if (inv.status === 'draft') throw badRequest('Un borrador no se anula, se borra');
    if (inv.status === 'void') throw badRequest('La factura ya está anulada');
    const payments = await query(client, 'SELECT journal_entry_id FROM payments WHERE invoice_id = $1', [inv.id]);
    for (const p of payments) {
      await reverseEntry(client, { companyId: req.company!.id, entryId: p.journal_entry_id, date: b.date, userId: req.user!.id, description: `Anulación de cobro de ${inv.series}-${inv.number}` });
    }
    await reverseEntry(client, {
      companyId: req.company!.id, entryId: inv.journal_entry_id, date: b.date, userId: req.user!.id,
      description: `Anulación de la factura ${inv.series}-${inv.number}: ${b.reason}`,
    });
    const stock = await query(
      client,
      `SELECT l.product_id, l.quantity, l.unit_cost FROM invoice_lines l JOIN products p ON p.id = l.product_id WHERE l.invoice_id = $1 AND p.track_stock`,
      [inv.id],
    );
    for (const l of stock) {
      await client.query('UPDATE products SET stock = stock + $2 WHERE id = $1', [l.product_id, l.quantity]);
      await client.query(
        `INSERT INTO inventory_moves(company_id, product_id, date, kind, quantity, unit_cost, source_type, source_id) VALUES ($1,$2,$3,'void',$4,$5,'invoice',$6)`,
        [req.company!.id, l.product_id, b.date, l.quantity, l.unit_cost, inv.id],
      );
    }
    await client.query(`UPDATE invoices SET status = 'void' WHERE id = $1`, [inv.id]);
    await audit(client, { ...ctx(req), action: 'void', entity: 'invoice', entityId: inv.id, data: b });
  });
  res.json(summary(await loadInvoice(pool, req.company!.id, String(req.params.id))));
});

invoicesRouter.get('/:id/pdf', requireCompany(), async (req, res) => {
  const inv = await loadInvoice(pool, req.company!.id, String(req.params.id));
  const company = await one(pool, 'SELECT name, tax_id, address, email, phone, tax_regime, invoice_authorization FROM companies WHERE id = $1', [req.company!.id]);
  const contact = await one(pool, 'SELECT name, tax_id, address, email FROM contacts WHERE id = $1', [inv.contact_id]);
  const lines = await query(pool, 'SELECT * FROM invoice_lines WHERE invoice_id = $1 ORDER BY position', [inv.id]);
  const pdf = await invoicePdf({ ...inv, company, contact, lines });
  const name = inv.number ? `factura-${inv.series}-${inv.number}.pdf` : 'factura-borrador.pdf';
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${name}"`);
  res.send(pdf);
});
