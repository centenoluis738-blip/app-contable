import { Router } from 'express';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { D, Decimal, money, NI } from '@contable/shared';
import { one, pool, query, tx, type Db } from '../db.js';
import { ACCOUNTANTS, ctx, requireCompany } from '../middleware/auth.js';
import { badRequest } from '../middleware/errors.js';
import { createEntry, systemAccount, type EntryLine } from '../lib/journal.js';
import { audit } from '../lib/audit.js';
import { isoDate } from '../lib/validation.js';

export const taxesRouter = Router();

const month = z.string().regex(/^\d{4}-\d{2}$/, 'Usa el formato AAAA-MM');
const monthRange = (m: string) => {
  const [y, mm] = m.split('-').map(Number);
  const last = new Date(Date.UTC(y, mm, 0)).getUTCDate();
  return { from: `${m}-01`, to: `${m}-${String(last).padStart(2, '0')}` };
};
const min = (a: Decimal, b: Decimal) => Decimal.min(a, b);
const pos = (a: Decimal) => Decimal.max(0, a);

/** Movimiento neto de las cuentas del sistema en el período, sin contar las liquidaciones de impuestos. */
async function movement(db: Db | PoolClient, companyId: string, keys: string[], side: 'debit' | 'credit', from: string, to: string) {
  const row = await one(
    db,
    `SELECT COALESCE(SUM(${side === 'credit' ? 'l.credit - l.debit' : 'l.debit - l.credit'}), 0) AS v
     FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id JOIN accounts a ON a.id = l.account_id
     WHERE e.company_id = $1 AND a.system_key = ANY($2) AND e.date BETWEEN $3 AND $4 AND e.source_type <> 'tax_settlement'`,
    [companyId, keys, from, to],
  );
  return D(row.v);
}

/** Saldo disponible de una cuenta a una fecha (incluye todo, también liquidaciones anteriores). */
async function balanceAt(db: Db | PoolClient, companyId: string, key: string, to: string) {
  const row = await one(
    db,
    `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS v FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
     JOIN accounts a ON a.id = l.account_id WHERE e.company_id = $1 AND a.system_key = $2 AND e.date <= $3`,
    [companyId, key, to],
  );
  return D(row.v);
}

/**
 * Cálculo de las obligaciones del período según el régimen de la empresa (Nicaragua):
 * - Cuota fija: cuota mensual asignada por la DGI menos las retenciones IR que te hicieron (art. 259 LCT).
 * - Régimen general: IVA (débito − crédito) y PMD / anticipo IR sobre ingresos brutos menos retenciones.
 * - Ambos: IMI municipal (1 % de ingresos brutos), retenciones IR de nómina, INSS e INATEC.
 */
export async function computeTaxes(db: Db | PoolClient, companyId: string, from: string, to: string) {
  const company = await one(db, 'SELECT tax_regime, fixed_fee, imi_rate, pmd_rate, municipality FROM companies WHERE id = $1', [companyId]);
  const grossIncome = await movement(db, companyId, ['sales', 'otherIncome'], 'credit', from, to);
  const vatOutput = await movement(db, companyId, ['vatPayable'], 'credit', from, to);
  const vatInput = await movement(db, companyId, ['vatReceivable'], 'debit', from, to);
  const withholdingsReceived = await movement(db, companyId, ['whtReceivable'], 'debit', from, to);
  // Retenciones disponibles para acreditar = saldo acumulado de la cuenta (incluye remanentes de meses anteriores)
  const whtAvailable = await balanceAt(db, companyId, 'whtReceivable', to);
  const irWithheldPayroll = await movement(db, companyId, ['irPayable'], 'credit', from, to);
  const inss = await movement(db, companyId, ['inssPayable'], 'credit', from, to);
  const inatec = await movement(db, companyId, ['inatecPayable'], 'credit', from, to);
  const imi = grossIncome.times(company.imi_rate).dividedBy(100);

  const items: { concept: string; authority: string; amount: string; detail: string }[] = [];
  const alerts: string[] = [];
  let cuotaFija = null;
  let iva = null;
  let pmd = null;

  if (company.tax_regime === 'cuota_fija') {
    const fee = D(company.fixed_fee);
    const applied = min(whtAvailable.isNeg() ? D(0) : whtAvailable, fee);
    cuotaFija = { fee: money(fee), withholdingsApplied: money(applied), net: money(fee.minus(applied)), carryForward: money(pos(whtAvailable.minus(applied))) };
    items.push({ concept: 'Cuota fija (neta de retenciones)', authority: 'DGI', amount: cuotaFija.net, detail: `Cuota ${money(fee)} − retenciones acreditadas ${money(applied)}` });
    if (fee.isZero()) alerts.push('Registra el monto de tu cuota fija mensual en Configuración (lo asigna la DGI).');
    if (grossIncome.gt(NI.cuotaFijaMaxMonthlyIncome)) {
      alerts.push(`Tus ingresos del período (C$ ${money(grossIncome)}) superan C$ 100,000 mensuales: revisa con tu contador si debes pasar al régimen general.`);
    }
  } else {
    const net = vatOutput.minus(vatInput);
    iva = { output: money(vatOutput), input: money(vatInput), net: money(net), result: net.gt(0) ? 'a_pagar' : net.lt(0) ? 'saldo_a_favor' : 'cero' };
    items.push({ concept: 'IVA', authority: 'DGI', amount: money(pos(net)), detail: `Débito ${money(vatOutput)} − crédito ${money(vatInput)}` });
    const pmdGross = grossIncome.times(company.pmd_rate).dividedBy(100);
    const applied = min(whtAvailable.isNeg() ? D(0) : whtAvailable, pmdGross);
    pmd = { rate: company.pmd_rate, gross: money(pmdGross), withholdingsApplied: money(applied), net: money(pmdGross.minus(applied)) };
    items.push({ concept: `Anticipo IR / PMD ${Number(company.pmd_rate)} %`, authority: 'DGI', amount: pmd.net, detail: `${money(pmdGross)} − retenciones acreditadas ${money(applied)}` });
  }
  items.push({ concept: `IMI ${Number(company.imi_rate)} %`, authority: `Alcaldía${company.municipality ? ` de ${company.municipality}` : ''}`, amount: money(imi), detail: `Sobre ingresos brutos ${money(grossIncome)}` });
  if (irWithheldPayroll.gt(0)) items.push({ concept: 'Retenciones IR (salarios)', authority: 'DGI', amount: money(irWithheldPayroll), detail: 'Retenido a trabajadores en la nómina' });
  if (inss.gt(0)) items.push({ concept: 'INSS laboral y patronal', authority: 'INSS', amount: money(inss), detail: 'Según nómina del período' });
  if (inatec.gt(0)) items.push({ concept: 'INATEC 2 %', authority: 'INATEC', amount: money(inatec), detail: 'Según nómina del período' });

  return {
    from, to, regime: company.tax_regime,
    grossIncome: money(grossIncome),
    withholdingsReceived: money(withholdingsReceived),
    withholdingsAvailable: money(whtAvailable),
    cuotaFija, iva, pmd, imi: money(imi),
    items,
    total: money(items.reduce((s, i) => s.plus(i.amount), D(0))),
    alerts,
    note: 'Cálculo orientativo según la LCT. Verifica con tu contador antes de declarar en la VET de la DGI y en la alcaldía.',
  };
}

taxesRouter.get('/summary', requireCompany(), async (req, res) => {
  const q = z.object({ month: month.optional(), from: isoDate.optional(), to: isoDate.optional() }).parse(req.query);
  const range = q.month ? monthRange(q.month) : q.from && q.to ? { from: q.from, to: q.to } : null;
  if (!range) throw badRequest('Indica el mes (month=AAAA-MM) o el rango from/to');
  const result = await computeTaxes(pool, req.company!.id, range.from, range.to);
  const salesByRate = await query(
    pool,
    `SELECT l.tax_code AS code, SUM(l.subtotal * i.exchange_rate)::numeric(14,2) AS base, SUM(l.tax * i.exchange_rate)::numeric(14,2) AS tax, COUNT(DISTINCT i.id) AS documents
     FROM invoice_lines l JOIN invoices i ON i.id = l.invoice_id
     WHERE i.company_id = $1 AND i.status IN ('issued','partial','paid') AND i.issue_date BETWEEN $2 AND $3 GROUP BY l.tax_code ORDER BY l.tax_code`,
    [req.company!.id, range.from, range.to],
  );
  const purchasesByRate = await query(
    pool,
    `SELECT tax_code AS code, SUM(subtotal * exchange_rate)::numeric(14,2) AS base, SUM(tax * exchange_rate)::numeric(14,2) AS tax, COUNT(*) AS documents
     FROM expenses WHERE company_id = $1 AND status <> 'void' AND date BETWEEN $2 AND $3 GROUP BY tax_code ORDER BY tax_code`,
    [req.company!.id, range.from, range.to],
  );
  const settled = q.month ? await one(pool, 'SELECT created_at FROM tax_settlements WHERE company_id = $1 AND month = $2', [req.company!.id, q.month]) : null;
  res.json({ ...result, salesByRate, purchasesByRate, settled: !!settled });
});

/**
 * Liquida los impuestos del mes: registra el gasto o la obligación y aplica las retenciones.
 * Cuota fija: Impuestos (gasto) contra Retenciones IR por acreditar y Cuota fija/IMI por pagar.
 * General: IVA por pagar contra IVA acreditable; Anticipos IR (PMD) contra retenciones y por pagar; IMI como gasto.
 */
taxesRouter.post('/settle', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const { month: m } = z.object({ month }).parse(req.body);
  const range = monthRange(m);
  const result = await tx(async (client) => {
    const companyId = req.company!.id;
    const exists = await one(client, 'SELECT 1 FROM tax_settlements WHERE company_id = $1 AND month = $2', [companyId, m]);
    if (exists) throw badRequest(`Los impuestos de ${m} ya fueron liquidados`);
    const t = await computeTaxes(client, companyId, range.from, range.to);
    const acc = (k: Parameters<typeof systemAccount>[2]) => systemAccount(client, companyId, k);
    const lines: EntryLine[] = [];
    const taxesExpense = await acc('taxesExpense');
    const taxesPayable = await acc('taxesPayable');
    if (t.cuotaFija) {
      lines.push(
        { accountId: taxesExpense, debit: t.cuotaFija.fee },
        { accountId: await acc('whtReceivable'), credit: t.cuotaFija.withholdingsApplied },
        { accountId: taxesPayable, credit: t.cuotaFija.net },
      );
    }
    if (t.iva) {
      const output = D(t.iva.output);
      const input = D(t.iva.input);
      // El crédito fiscal que exceda al débito queda como saldo a favor en IVA acreditable
      const used = min(input, output);
      lines.push(
        { accountId: await acc('vatPayable'), debit: money(output) },
        { accountId: await acc('vatReceivable'), credit: money(used) },
        { accountId: await acc('taxesPayable'), credit: money(output.minus(used)) },
      );
    }
    if (t.pmd) {
      lines.push(
        { accountId: await acc('irAdvances'), debit: t.pmd.gross },
        { accountId: await acc('whtReceivable'), credit: t.pmd.withholdingsApplied },
        { accountId: taxesPayable, credit: t.pmd.net },
      );
    }
    lines.push({ accountId: taxesExpense, debit: t.imi }, { accountId: taxesPayable, credit: t.imi });
    const nonZero = lines.filter((l) => !D(l.debit ?? 0).isZero() || !D(l.credit ?? 0).isZero());
    const entryId = nonZero.length >= 2
      ? await createEntry(client, { companyId, userId: req.user!.id, date: range.to, sourceType: 'tax_settlement', description: `Liquidación de impuestos ${m}`, lines })
      : null;
    await client.query('INSERT INTO tax_settlements(company_id, month, summary, journal_entry_id) VALUES ($1,$2,$3,$4)', [companyId, m, JSON.stringify(t), entryId]);
    await audit(client, { ...ctx(req), action: 'settle', entity: 'taxes', entityId: m, data: { total: t.total } });
    return t;
  });
  res.status(201).json(result);
});
