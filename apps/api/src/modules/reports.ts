import { Router } from 'express';
import { z } from 'zod';
import { D, Decimal, money, NI, sum } from '@contable/shared';
import { one, pool, query } from '../db.js';
import { requireCompany } from '../middleware/auth.js';
import { isoDate, today } from '../lib/validation.js';
import { sendCsv } from '../lib/csv.js';

export const reportsRouter = Router();

const range = z.object({ from: isoDate, to: isoDate, format: z.enum(['json', 'csv']).default('json') });

/** Saldos por cuenta entre dos fechas (from opcional = desde el inicio). */
async function balances(companyId: string, from: string | null, to: string) {
  return query(
    pool,
    `SELECT a.id, a.code, a.name, a.type, COALESCE(SUM(l.debit),0) AS debit, COALESCE(SUM(l.credit),0) AS credit
     FROM accounts a
     LEFT JOIN (journal_lines l JOIN journal_entries e ON e.id = l.entry_id AND ($2::date IS NULL OR e.date >= $2) AND e.date <= $3)
       ON l.account_id = a.id
     WHERE a.company_id = $1 GROUP BY a.id
     HAVING COALESCE(SUM(l.debit),0) <> 0 OR COALESCE(SUM(l.credit),0) <> 0
     ORDER BY string_to_array(a.code, '.')::int[]`,
    [companyId, from, to],
  );
}

const natural = (a: { type: string; debit: string; credit: string }) =>
  ['asset', 'expense'].includes(a.type) ? D(a.debit).minus(a.credit) : D(a.credit).minus(a.debit);

reportsRouter.get('/trial-balance', requireCompany(), async (req, res) => {
  const f = range.parse(req.query);
  const rows = (await balances(req.company!.id, f.from, f.to)).map((a) => {
    const net = D(a.debit).minus(a.credit);
    return { code: a.code, name: a.name, type: a.type, debit: a.debit, credit: a.credit, debitBalance: money(net.gt(0) ? net : 0), creditBalance: money(net.lt(0) ? net.neg() : 0) };
  });
  if (f.format === 'csv') return sendCsv(res, `balanza-${f.from}-${f.to}.csv`, rows);
  res.json({ from: f.from, to: f.to, rows, totals: { debit: money(sum(rows.map((r) => r.debit))), credit: money(sum(rows.map((r) => r.credit))) } });
});

/** Estado de resultados (pérdidas y ganancias). */
reportsRouter.get('/income-statement', requireCompany(), async (req, res) => {
  const f = range.parse(req.query);
  const rows = (await balances(req.company!.id, f.from, f.to)).filter((a) => a.type === 'income' || a.type === 'expense');
  const income = rows.filter((a) => a.type === 'income').map((a) => ({ code: a.code, name: a.name, amount: money(natural(a)) }));
  const expenses = rows.filter((a) => a.type === 'expense').map((a) => ({ code: a.code, name: a.name, amount: money(natural(a)) }));
  const totalIncome = sum(income.map((r) => r.amount));
  const totalExpenses = sum(expenses.map((r) => r.amount));
  if (f.format === 'csv') {
    return sendCsv(res, `estado-resultados-${f.from}-${f.to}.csv`, [
      ...income.map((r) => ({ seccion: 'Ingresos', ...r })),
      ...expenses.map((r) => ({ seccion: 'Gastos', ...r })),
      { seccion: 'Resultado', code: '', name: 'Utilidad (pérdida) neta', amount: money(totalIncome.minus(totalExpenses)) },
    ]);
  }
  res.json({ from: f.from, to: f.to, income, expenses, totalIncome: money(totalIncome), totalExpenses: money(totalExpenses), netIncome: money(totalIncome.minus(totalExpenses)) });
});

/** Balance general a una fecha. El resultado del ejercicio se muestra dentro del patrimonio. */
reportsRouter.get('/balance-sheet', requireCompany(), async (req, res) => {
  const f = z.object({ date: isoDate.default(today()), format: z.enum(['json', 'csv']).default('json') }).parse(req.query);
  const rows = await balances(req.company!.id, null, f.date);
  const section = (type: string) => rows.filter((a) => a.type === type).map((a) => ({ code: a.code, name: a.name, amount: money(natural(a)) }));
  const assets = section('asset');
  const liabilities = section('liability');
  const equity = section('equity');
  const earnings = sum(rows.filter((a) => a.type === 'income').map(natural)).minus(sum(rows.filter((a) => a.type === 'expense').map(natural)));
  equity.push({ code: '', name: 'Resultado del ejercicio', amount: money(earnings) });
  const totalAssets = sum(assets.map((r) => r.amount));
  const totalLiabilities = sum(liabilities.map((r) => r.amount));
  const totalEquity = sum(equity.map((r) => r.amount));
  if (f.format === 'csv') {
    return sendCsv(res, `balance-general-${f.date}.csv`, [
      ...assets.map((r) => ({ seccion: 'Activo', ...r })),
      ...liabilities.map((r) => ({ seccion: 'Pasivo', ...r })),
      ...equity.map((r) => ({ seccion: 'Patrimonio', ...r })),
    ]);
  }
  res.json({
    date: f.date, assets, liabilities, equity,
    totalAssets: money(totalAssets), totalLiabilities: money(totalLiabilities), totalEquity: money(totalEquity),
    balanced: totalAssets.equals(totalLiabilities.plus(totalEquity)),
  });
});

/** Cuentas por cobrar con antigüedad de saldos. */
reportsRouter.get('/receivables', requireCompany(), async (req, res) => {
  const rows = await query(
    pool,
    `SELECT i.id, i.series, i.number, i.issue_date, i.due_date, c.name AS contact_name, i.total - i.amount_paid AS pending,
       GREATEST(0, CURRENT_DATE - COALESCE(i.due_date, i.issue_date)) AS days_overdue
     FROM invoices i JOIN contacts c ON c.id = i.contact_id
     WHERE i.company_id = $1 AND i.status IN ('issued','partial') ORDER BY days_overdue DESC`,
    [req.company!.id],
  );
  const bucket = (d: number) => (d === 0 ? 'al_corriente' : d <= 30 ? '1_30' : d <= 60 ? '31_60' : d <= 90 ? '61_90' : 'mas_90');
  const buckets: Record<string, string> = { al_corriente: '0.00', '1_30': '0.00', '31_60': '0.00', '61_90': '0.00', mas_90: '0.00' };
  for (const r of rows) buckets[bucket(r.days_overdue)] = money(D(buckets[bucket(r.days_overdue)]).plus(r.pending));
  res.json({
    total: money(sum(rows.map((r) => r.pending))),
    buckets,
    invoices: rows.map((r) => ({ id: r.id, number: `${r.series}-${r.number}`, contactName: r.contact_name, issueDate: r.issue_date, dueDate: r.due_date, pending: r.pending, daysOverdue: r.days_overdue })),
  });
});

reportsRouter.get('/payables', requireCompany(), async (req, res) => {
  const rows = await query(
    pool,
    `SELECT e.id, e.date, e.description, e.total, c.name AS contact_name FROM expenses e LEFT JOIN contacts c ON c.id = e.contact_id
     WHERE e.company_id = $1 AND e.status = 'unpaid' ORDER BY e.date`,
    [req.company!.id],
  );
  res.json({ total: money(sum(rows.map((r) => r.total))), expenses: rows.map((r) => ({ id: r.id, date: r.date, description: r.description, contactName: r.contact_name, total: r.total })) });
});

/** Panel principal: cifras del mes, caja, pendientes y evolución de los últimos 6 meses. */
reportsRouter.get('/dashboard', requireCompany(), async (req, res) => {
  const { month } = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).default(today().slice(0, 7)) }).parse(req.query);
  const companyId = req.company!.id;
  const series = await query(
    pool,
    `WITH months AS (
       SELECT to_char(d, 'YYYY-MM') AS m FROM generate_series(($2 || '-01')::date - interval '5 months', ($2 || '-01')::date, interval '1 month') d
     )
     SELECT months.m AS month,
       COALESCE(SUM(CASE WHEN a.type = 'income' THEN l.credit - l.debit END), 0) AS income,
       COALESCE(SUM(CASE WHEN a.type = 'expense' THEN l.debit - l.credit END), 0) AS expenses
     FROM months
     LEFT JOIN journal_entries e ON e.company_id = $1 AND to_char(e.date, 'YYYY-MM') = months.m
     LEFT JOIN journal_lines l ON l.entry_id = e.id
     LEFT JOIN accounts a ON a.id = l.account_id
     GROUP BY months.m ORDER BY months.m`,
    [companyId, month],
  );
  const cash = await one(
    pool,
    `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS v FROM journal_lines l JOIN accounts a ON a.id = l.account_id
     WHERE a.company_id = $1 AND a.system_key IN ('bank','cash')`,
    [companyId],
  );
  const receivable = await one(
    pool,
    `SELECT COALESCE(SUM(total - amount_paid), 0) AS v, COUNT(*) FILTER (WHERE due_date < CURRENT_DATE) AS overdue
     FROM invoices WHERE company_id = $1 AND status IN ('issued','partial')`,
    [companyId],
  );
  const payable = await one(pool, `SELECT COALESCE(SUM(total), 0) AS v FROM expenses WHERE company_id = $1 AND status = 'unpaid'`, [companyId]);
  const pendingBank = await one(pool, 'SELECT COUNT(*)::int AS n FROM bank_transactions WHERE company_id = $1 AND matched_type IS NULL', [companyId]);
  const current = series.at(-1) ?? { income: '0', expenses: '0' };
  const company = await one(pool, 'SELECT tax_regime, fixed_fee FROM companies WHERE id = $1', [companyId]);
  const alerts: string[] = [];
  if (company.tax_regime === 'cuota_fija' && D(current.income).gt(NI.cuotaFijaMaxMonthlyIncome)) {
    alerts.push('Tus ingresos del mes superan C$ 100,000, el límite de la cuota fija. Consulta a tu contador sobre el cambio al régimen general.');
  }
  const inventory = await one(pool, `SELECT COALESCE(SUM(stock * avg_cost), 0) AS v FROM products WHERE company_id = $1 AND track_stock`, [companyId]);
  if (company.tax_regime === 'cuota_fija' && D(inventory.v).gt(NI.cuotaFijaMaxInventory)) {
    alerts.push('Tu inventario supera C$ 500,000, el límite de la cuota fija.');
  }
  res.json({
    month,
    income: money(current.income),
    expenses: money(current.expenses),
    result: money(D(current.income).minus(current.expenses)),
    cash: money(cash.v),
    receivable: money(receivable.v),
    overdueInvoices: Number(receivable.overdue),
    payable: money(payable.v),
    pendingBankTransactions: pendingBank.n,
    regime: company.tax_regime,
    alerts,
    series: series.map((s) => ({ month: s.month, income: money(s.income), expenses: money(s.expenses) })),
  });
});

/**
 * Estado de flujo de efectivo (método directo): movimientos de caja y bancos del período
 * clasificados por la cuenta contraria en actividades de operación, inversión y financiamiento.
 */
reportsRouter.get('/cash-flow', requireCompany(), async (req, res) => {
  const f = range.parse(req.query);
  const companyId = req.company!.id;
  const isCash = `(a.system_key IN ('cash','bank') OR a.code LIKE '1.1.01.%')`;
  const opening = await one(
    pool,
    `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS v FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
     JOIN accounts a ON a.id = l.account_id WHERE e.company_id = $1 AND e.date < $2 AND ${isCash}`,
    [companyId, f.from],
  );
  const rows = await query(
    pool,
    `SELECT e.id, l.debit, l.credit, a.code, a.type, a.system_key, ${isCash} AS is_cash
     FROM journal_entries e JOIN journal_lines l ON l.entry_id = e.id JOIN accounts a ON a.id = l.account_id
     WHERE e.company_id = $1 AND e.date BETWEEN $2 AND $3`,
    [companyId, f.from, f.to],
  );
  const LABELS: Record<string, [string, string]> = {
    customers: ['operacion', 'Cobros a clientes y ventas al contado'],
    suppliers: ['operacion', 'Pagos a proveedores y gastos'],
    payroll: ['operacion', 'Pagos de nómina, INSS e INATEC'],
    taxes: ['operacion', 'Pagos de impuestos (DGI y alcaldía)'],
    otherOp: ['operacion', 'Otros movimientos de operación'],
    investing: ['inversion', 'Compra o venta de propiedad, planta y equipo'],
    loans: ['financiamiento', 'Préstamos recibidos o pagados'],
    equity: ['financiamiento', 'Aportes y retiros de los dueños'],
  };
  const classify = (l: any): keyof typeof LABELS => {
    if (l.code.startsWith('1.2')) return 'investing';
    if (l.code.startsWith('2.1.04') || l.code.startsWith('2.2')) return 'loans';
    if (l.type === 'equity') return 'equity';
    if (['receivable', 'sales', 'otherIncome', 'whtReceivable'].includes(l.system_key) || l.type === 'income') return 'customers';
    if (['wagesPayable', 'inssPayable', 'inatecPayable', 'salaries'].includes(l.system_key)) return 'payroll';
    if (['taxesPayable', 'vatPayable', 'irPayable', 'irAdvances', 'taxesExpense'].includes(l.system_key)) return 'taxes';
    if (l.system_key === 'payable' || l.type === 'expense' || l.system_key === 'inventory' || l.system_key === 'vatReceivable') return 'suppliers';
    return 'otherOp';
  };
  const byEntry = new Map<string, any[]>();
  for (const r of rows) byEntry.set(r.id, [...(byEntry.get(r.id) ?? []), r]);
  const totals = new Map<string, Decimal>();
  for (const lines of byEntry.values()) {
    const cash = sum(lines.filter((l) => l.is_cash).map((l) => D(l.debit).minus(l.credit)));
    if (cash.isZero()) continue;
    // La cuenta contraria con mayor importe define la actividad
    const other = lines.filter((l) => !l.is_cash).sort((a, b) => D(b.debit).plus(b.credit).comparedTo(D(a.debit).plus(a.credit)))[0];
    const key = other ? classify(other) : 'otherOp';
    totals.set(key, (totals.get(key) ?? D(0)).plus(cash));
  }
  const sections = ['operacion', 'inversion', 'financiamiento'].map((section) => {
    const items = Object.entries(LABELS)
      .filter(([k, [s]]) => s === section && totals.has(k))
      .map(([k, [, label]]) => ({ label, amount: money(totals.get(k)!) }));
    return { section, items, total: money(sum(items.map((i) => i.amount))) };
  });
  const net = sum(sections.map((s) => s.total));
  const result = { from: f.from, to: f.to, opening: money(opening.v), sections, netChange: money(net), closing: money(D(opening.v).plus(net)) };
  if (f.format === 'csv') {
    return sendCsv(res, `flujo-efectivo-${f.from}-${f.to}.csv`, [
      { actividad: 'Saldo inicial', concepto: '', importe: result.opening },
      ...sections.flatMap((s) => s.items.map((i) => ({ actividad: s.section, concepto: i.label, importe: i.amount }))),
      { actividad: 'Saldo final', concepto: '', importe: result.closing },
    ]);
  }
  res.json(result);
});
