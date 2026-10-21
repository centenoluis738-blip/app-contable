import { Router } from 'express';
import { z } from 'zod';
import { calcPayroll, D, money, NI, type PayrollLine } from '@contable/shared';
import { one, pool, query, tx, type Db } from '../db.js';
import { ACCOUNTANTS, ctx, requireCompany } from '../middleware/auth.js';
import { badRequest, notFound } from '../middleware/errors.js';
import { createEntry, systemAccount } from '../lib/journal.js';
import { audit } from '../lib/audit.js';
import { isoDate, positiveAmount, today } from '../lib/validation.js';

export const payrollRouter = Router();

const employeeSchema = z.object({
  name: z.string().trim().min(2, 'Escribe el nombre'),
  idNumber: z.string().trim().optional().nullable(),
  inssNumber: z.string().trim().optional().nullable(),
  position: z.string().trim().optional().nullable(),
  monthlySalary: positiveAmount,
  startDate: isoDate.default(today()),
  active: z.boolean().default(true),
});

const toEmployee = (e: any) => ({
  id: e.id, name: e.name, idNumber: e.id_number, inssNumber: e.inss_number, position: e.position, monthlySalary: e.monthly_salary,
  startDate: e.start_date, active: e.active,
});

payrollRouter.get('/employees', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const rows = await query(pool, 'SELECT * FROM employees WHERE company_id = $1 ORDER BY active DESC, name', [req.company!.id]);
  res.json(rows.map(toEmployee));
});

payrollRouter.post('/employees', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const b = employeeSchema.parse(req.body);
  const e = await one(
    pool,
    `INSERT INTO employees(company_id, name, id_number, inss_number, position, monthly_salary, start_date, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [req.company!.id, b.name, b.idNumber ?? null, b.inssNumber ?? null, b.position ?? null, b.monthlySalary, b.startDate, b.active],
  );
  await audit(pool, { ...ctx(req), action: 'create', entity: 'employee', entityId: e.id });
  res.status(201).json(toEmployee(e));
});

payrollRouter.put('/employees/:id', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const b = employeeSchema.parse(req.body);
  const e = await one(
    pool,
    `UPDATE employees SET name=$3, id_number=$4, inss_number=$5, position=$6, monthly_salary=$7, start_date=$8, active=$9
     WHERE id=$1 AND company_id=$2 RETURNING *`,
    [String(req.params.id), req.company!.id, b.name, b.idNumber ?? null, b.inssNumber ?? null, b.position ?? null, b.monthlySalary, b.startDate, b.active],
  );
  if (!e) throw notFound('Trabajador');
  await audit(pool, { ...ctx(req), action: 'update', entity: 'employee', entityId: e.id, data: b });
  res.json(toEmployee(e));
});

const KEYS: (keyof PayrollLine)[] = ['gross', 'inssEmployee', 'ir', 'net', 'inssEmployer', 'inatec', 'aguinaldo', 'vacaciones', 'indemnizacion'];

/** Calcula la nómina del mes para los trabajadores activos (sin registrarla). */
async function computeRun(db: Db, companyId: string) {
  const employees = await query(db, 'SELECT * FROM employees WHERE company_id = $1 AND active ORDER BY name', [companyId]);
  if (!employees.length) throw badRequest('Agrega al menos un trabajador activo');
  const lines = employees.map((e) => ({ employee: toEmployee(e), ...calcPayroll(e.monthly_salary, employees.length) }));
  const totals = Object.fromEntries(KEYS.map((k) => [k, money(lines.reduce((s, l) => s.plus(l[k]), D(0)))])) as Record<keyof PayrollLine, string>;
  return { employees: employees.length, inssEmployerRate: NI.inssEmployerRate(employees.length), lines, totals };
}

payrollRouter.get('/preview', requireCompany(...ACCOUNTANTS), async (req, res) => {
  res.json(await computeRun(pool, req.company!.id));
});

/**
 * Registra la nómina del mes con sus provisiones. Asiento:
 * Debe: Sueldos, INSS patronal, INATEC, Aguinaldo, Vacaciones, Indemnización (gastos)
 * Haber: Sueldos por pagar (neto), INSS por pagar (laboral + patronal), INATEC por pagar,
 *        Retenciones IR por pagar, Provisiones de aguinaldo, vacaciones e indemnización.
 */
payrollRouter.post('/runs', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const b = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), date: isoDate.optional() }).parse(req.body);
  const run = await tx(async (client) => {
    const companyId = req.company!.id;
    const exists = await one(client, 'SELECT 1 FROM payroll_runs WHERE company_id = $1 AND month = $2', [companyId, b.month]);
    if (exists) throw badRequest(`La nómina de ${b.month} ya fue registrada`);
    const r = await computeRun(client, companyId);
    const [y, m] = b.month.split('-').map(Number);
    const date = b.date ?? `${b.month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    const t = r.totals;
    const acc = (k: Parameters<typeof systemAccount>[2]) => systemAccount(client, companyId, k);
    const entryId = await createEntry(client, {
      companyId, userId: req.user!.id, date, sourceType: 'payroll', description: `Nómina de ${b.month} (${r.employees} trabajadores)`,
      lines: [
        { accountId: await acc('salaries'), debit: t.gross },
        { accountId: await acc('expInss'), debit: t.inssEmployer },
        { accountId: await acc('expInatec'), debit: t.inatec },
        { accountId: await acc('expAguinaldo'), debit: t.aguinaldo },
        { accountId: await acc('expVacaciones'), debit: t.vacaciones },
        { accountId: await acc('expIndemnizacion'), debit: t.indemnizacion },
        { accountId: await acc('wagesPayable'), credit: t.net },
        { accountId: await acc('inssPayable'), credit: money(D(t.inssEmployee).plus(t.inssEmployer)) },
        { accountId: await acc('inatecPayable'), credit: t.inatec },
        { accountId: await acc('irPayable'), credit: t.ir },
        { accountId: await acc('provAguinaldo'), credit: t.aguinaldo },
        { accountId: await acc('provVacaciones'), credit: t.vacaciones },
        { accountId: await acc('provIndemnizacion'), credit: t.indemnizacion },
      ],
    });
    const created = await one(
      client,
      `INSERT INTO payroll_runs(company_id, month, date, employees, totals, journal_entry_id, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [companyId, b.month, date, r.employees, JSON.stringify(t), entryId, req.user!.id],
    );
    for (const l of r.lines) {
      await client.query(
        `INSERT INTO payroll_lines(run_id, employee_id, gross, inss_employee, ir, net, inss_employer, inatec, aguinaldo, vacaciones, indemnizacion)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [created.id, l.employee.id, l.gross, l.inssEmployee, l.ir, l.net, l.inssEmployer, l.inatec, l.aguinaldo, l.vacaciones, l.indemnizacion],
      );
    }
    await audit(client, { ...ctx(req), action: 'run', entity: 'payroll', entityId: created.id, data: { month: b.month } });
    return { id: created.id, month: b.month, date, ...r };
  });
  res.status(201).json(run);
});

payrollRouter.get('/runs', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const rows = await query(pool, 'SELECT id, month, date, employees, totals FROM payroll_runs WHERE company_id = $1 ORDER BY month DESC', [req.company!.id]);
  res.json(rows);
});

payrollRouter.get('/runs/:id', requireCompany(...ACCOUNTANTS), async (req, res) => {
  const run = await one(pool, 'SELECT id, month, date, employees, totals FROM payroll_runs WHERE id = $1 AND company_id = $2', [String(req.params.id), req.company!.id]);
  if (!run) throw notFound('Nómina');
  const lines = await query(
    pool,
    `SELECT e.name, e.position, l.* FROM payroll_lines l JOIN employees e ON e.id = l.employee_id WHERE l.run_id = $1 ORDER BY e.name`,
    [run.id],
  );
  res.json({ ...run, lines });
});
