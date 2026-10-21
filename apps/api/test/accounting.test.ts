import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, setupCompany } from './helpers.js';

type Api = Awaited<ReturnType<typeof setupCompany>>['api'];
const balanceOf = async (api: Api, key: string) => {
  const accounts = (await api.get('/accounts').expect(200)).body as any[];
  return accounts.find((a) => a.systemKey === key || a.code === key).balance as string;
};
const customer = async (api: Api, taxRegime = 'general', extra: Record<string, unknown> = {}) =>
  (await api.post('/contacts').send({ kind: 'customer', name: `Cliente ${taxRegime}`, taxRegime, ...extra }).expect(201)).body;

describe('autenticación y acceso', () => {
  it('rechaza peticiones sin sesión y empresas ajenas', async () => {
    await request(app).get('/invoices').expect(401);
    const a = await setupCompany();
    const b = await setupCompany();
    await request(app).get('/invoices').set('Authorization', `Bearer ${a.token}`).set('X-Company-Id', b.companyId).expect(403);
  });

  it('inicia sesión con la contraseña correcta', async () => {
    const a = await setupCompany();
    await request(app).post('/auth/login').send({ email: a.email, password: 'mala' }).expect(401);
    const ok = await request(app).post('/auth/login').send({ email: a.email, password: 'Clave1234' }).expect(200);
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${ok.body.token}`).expect(200);
    expect(me.body.companies).toHaveLength(1);
  });

  it('valida contraseñas débiles', async () => {
    const r = await request(app).post('/auth/register').send({ name: 'X', email: 'x@y.test', password: '123' }).expect(400);
    expect(r.body.error).toBe('Datos no válidos');
  });

  it('crea la empresa con valores de Nicaragua', async () => {
    const { api } = await setupCompany({ taxRegime: undefined, currency: undefined, defaultTaxRate: undefined, country: undefined });
    const c = (await api.get('/companies/current').expect(200)).body;
    expect(c).toMatchObject({ country: 'NI', currency: 'NIO', defaultTaxRate: '15.00', taxRegime: 'cuota_fija', imiRate: '1.00' });
  });
});

describe('régimen general: IVA 15 % y retenciones', () => {
  it('emite, cobra con retención del 2 % y anula una factura', async () => {
    const { api } = await setupCompany();
    const client = await customer(api);
    const inv = (
      await api
        .post('/invoices')
        .send({
          contactId: client.id, issueDate: '2026-10-01', withholdingType: 'bienes_servicios',
          lines: [
            { description: 'Servicio técnico', quantity: 2, unitPrice: '500', taxCode: 'IVA15' },
            { description: 'Arroz (canasta básica)', quantity: 1, unitPrice: '200', taxCode: 'EXENTO' },
          ],
        })
        .expect(201)
    ).body;
    expect(inv).toMatchObject({ subtotal: '1200.00', taxTotal: '150.00', total: '1350.00', withholdingRate: '2.00', withholdingAmount: '24.00' });

    await api.post(`/invoices/${inv.id}/issue`).expect(200);
    expect(await balanceOf(api, 'receivable')).toBe('1350.00');
    expect(await balanceOf(api, 'vatPayable')).toBe('150.00');

    const paid = (await api.post(`/invoices/${inv.id}/payments`).send({ amount: '1350', withheld: '24', date: '2026-10-05' }).expect(201)).body;
    expect(paid.status).toBe('paid');
    expect(await balanceOf(api, 'bank')).toBe('1326.00');
    expect(await balanceOf(api, 'whtReceivable')).toBe('24.00');

    const pdf = await api.get(`/invoices/${inv.id}/pdf`).expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');

    await api.post(`/invoices/${inv.id}/void`).send({ reason: 'Error en datos' }).expect(200);
    expect(await balanceOf(api, 'sales')).toBe('0.00');
    expect(await balanceOf(api, 'whtReceivable')).toBe('0.00');
  });

  it('no aplica retención a consumidores finales ni por debajo del mínimo', async () => {
    const { api } = await setupCompany();
    const person = await customer(api, 'consumidor_final');
    const company = await customer(api, 'general');
    const a = (await api.post('/invoices').send({ contactId: person.id, withholdingType: 'profesional', lines: [{ description: 'x', quantity: 1, unitPrice: 5000 }] }).expect(201)).body;
    expect(a.withholdingAmount).toBe('0.00');
    const b = (await api.post('/invoices').send({ contactId: company.id, withholdingType: 'bienes_servicios', lines: [{ description: 'x', quantity: 1, unitPrice: 999 }] }).expect(201)).body;
    expect(b.withholdingAmount).toBe('0.00');
    const c = (await api.post('/invoices').send({ contactId: company.id, withholdingType: 'profesional', lines: [{ description: 'x', quantity: 1, unitPrice: 10 }] }).expect(201)).body;
    expect(c.withholdingAmount).toBe('1.00');
  });

  it('factura en dólares y registra el diferencial cambiario', async () => {
    const { api } = await setupCompany();
    const client = await customer(api);
    await api.post('/invoices').send({ contactId: client.id, currency: 'USD', lines: [{ description: 'x', quantity: 1, unitPrice: 100 }] }).expect(400);
    await api.post('/companies/current/exchange-rates').send({ currency: 'USD', date: '2026-10-01', rate: '36.6243' }).expect(201);
    await api.post('/companies/current/exchange-rates').send({ currency: 'USD', date: '2026-10-20', rate: '36.7000' }).expect(201);
    const inv = (
      await api.post('/invoices').send({ contactId: client.id, currency: 'USD', issueDate: '2026-10-02', issue: true, lines: [{ description: 'Software', quantity: 1, unitPrice: 100, taxCode: 'IVA0' }] }).expect(201)
    ).body;
    expect(inv).toMatchObject({ currency: 'USD', total: '100.00', exchangeRate: '36.6243' });
    expect(await balanceOf(api, 'receivable')).toBe('3662.43');
    await api.post(`/invoices/${inv.id}/payments`).send({ amount: '100', date: '2026-10-21' }).expect(201);
    expect(await balanceOf(api, 'bank')).toBe('3670.00');
    expect(await balanceOf(api, 'fxGain')).toBe('7.57');
    expect(await balanceOf(api, 'receivable')).toBe('0.00');
  });

  it('acredita el IVA de gastos deducibles y separa los no deducibles', async () => {
    const { api, account } = await setupCompany();
    const e1 = (await api.post('/expenses').send({ accountId: account('6.2.03'), date: '2026-10-02', description: 'Papelería', amount: '115', taxCode: 'IVA15' }).expect(201)).body;
    expect(e1).toMatchObject({ subtotal: '100.00', tax: '15.00', total: '115.00' });
    expect(await balanceOf(api, 'vatReceivable')).toBe('15.00');
    await api.post('/expenses').send({ accountId: account('6.2.05'), date: '2026-10-03', description: 'Taxi sin factura', amount: '200', taxCode: 'EXENTO', deductible: false }).expect(201);
    expect(await balanceOf(api, 'nonDeductible')).toBe('200.00');
    expect(await balanceOf(api, '6.2.05')).toBe('0.00');
  });

  it('calcula IVA, PMD e IMI y liquida el mes', async () => {
    const { api, account } = await setupCompany({ pmdRate: 1, municipality: 'Managua' });
    const client = await customer(api);
    const inv = (await api.post('/invoices').send({ contactId: client.id, issueDate: '2026-10-04', issue: true, withholdingType: 'bienes_servicios', lines: [{ description: 'Venta', quantity: 1, unitPrice: 10000 }] }).expect(201)).body;
    await api.post(`/invoices/${inv.id}/payments`).send({ amount: '11500', withheld: '200', date: '2026-10-10' }).expect(201);
    await api.post('/expenses').send({ accountId: account('6.2.01'), date: '2026-10-05', description: 'Alquiler', amount: '4000', taxIncluded: false, taxCode: 'IVA15' }).expect(201);

    const t = (await api.get('/taxes/summary?month=2026-10').expect(200)).body;
    expect(t.iva).toMatchObject({ output: '1500.00', input: '600.00', net: '900.00', result: 'a_pagar' });
    expect(t.pmd).toMatchObject({ gross: '100.00', withholdingsApplied: '100.00', net: '0.00' });
    expect(t.imi).toBe('100.00');
    expect(t.total).toBe('1000.00');

    await api.post('/taxes/settle').send({ month: '2026-10' }).expect(201);
    await api.post('/taxes/settle').send({ month: '2026-10' }).expect(400);
    expect(await balanceOf(api, 'vatPayable')).toBe('0.00');
    expect(await balanceOf(api, 'taxesPayable')).toBe('1000.00');
    expect(await balanceOf(api, 'whtReceivable')).toBe('100.00');
  });
});

describe('régimen de cuota fija', () => {
  it('no traslada IVA, aplica retenciones a la cuota y avisa los límites', async () => {
    const { api, account } = await setupCompany({ taxRegime: 'cuota_fija', fixedFee: '500' });
    const client = await customer(api, 'general');
    const inv = (
      await api.post('/invoices').send({ contactId: client.id, issueDate: '2026-10-03', issue: true, withholdingType: 'bienes_servicios', lines: [{ description: 'Mercadería', quantity: 1, unitPrice: 20000, taxCode: 'IVA15' }] }).expect(201)
    ).body;
    expect(inv).toMatchObject({ taxTotal: '0.00', total: '20000.00', withholdingAmount: '400.00' });

    // El cliente paga neto de la retención por banco
    const csv = ['Fecha;Concepto;Importe', '05/10/2026;Transferencia cliente;19.600,00'].join('\n');
    await api.post('/bank/import').send({ csv }).expect(201);
    const [tx] = (await api.get('/bank/transactions?status=pending').expect(200)).body;
    expect(tx.suggestions[0]).toMatchObject({ type: 'invoice', id: inv.id });
    await api.post(`/bank/transactions/${tx.id}/match`).send({ type: 'invoice', id: inv.id }).expect(200);
    expect((await api.get(`/invoices/${inv.id}`).expect(200)).body.status).toBe('paid');
    expect(await balanceOf(api, 'whtReceivable')).toBe('400.00');

    // En cuota fija el IVA de las compras no se acredita
    await api.post('/expenses').send({ accountId: account('6.2.03'), date: '2026-10-04', description: 'Papel', amount: '115', taxCode: 'IVA15' }).expect(201);
    expect(await balanceOf(api, 'vatReceivable')).toBe('0.00');
    expect(await balanceOf(api, '6.2.03')).toBe('115.00');

    const t = (await api.get('/taxes/summary?month=2026-10').expect(200)).body;
    expect(t.cuotaFija).toMatchObject({ fee: '500.00', withholdingsApplied: '400.00', net: '100.00' });
    expect(t.imi).toBe('200.00');
    expect(t.iva).toBeNull();

    const state = await customer(api, 'general', { isState: true, name: 'Alcaldía' });
    const big = (await api.post('/invoices').send({ contactId: state.id, lines: [{ description: 'Obra', quantity: 1, unitPrice: 60000 }] }).expect(201)).body;
    expect(big.warnings[0]).toMatch(/excluido del régimen de cuota fija/);

    await api.post('/invoices').send({ contactId: client.id, issueDate: '2026-10-20', issue: true, lines: [{ description: 'Más ventas', quantity: 1, unitPrice: 90000 }] }).expect(201);
    const t2 = (await api.get('/taxes/summary?month=2026-10').expect(200)).body;
    expect(t2.alerts.join(' ')).toMatch(/superan C\$ 100,000/);
  });
});

describe('nómina', () => {
  it('registra la nómina con INSS, INATEC, IR y provisiones', async () => {
    const { api } = await setupCompany();
    await api.post('/payroll/employees').send({ name: 'Ana López', monthlySalary: '10000', startDate: '2026-01-01' }).expect(201);
    await api.post('/payroll/employees').send({ name: 'Luis Pérez', monthlySalary: '30000', startDate: '2026-01-01' }).expect(201);
    const preview = (await api.get('/payroll/preview').expect(200)).body;
    expect(preview.totals).toMatchObject({ gross: '40000.00', inssEmployee: '2800.00', ir: '3641.67', net: '33558.33', inssEmployer: '8600.00', inatec: '800.00', aguinaldo: '3332.00' });
    await api.post('/payroll/runs').send({ month: '2026-10' }).expect(201);
    await api.post('/payroll/runs').send({ month: '2026-10' }).expect(400);
    expect(await balanceOf(api, 'wagesPayable')).toBe('33558.33');
    expect(await balanceOf(api, 'inssPayable')).toBe('11400.00');
    expect(await balanceOf(api, 'provAguinaldo')).toBe('3332.00');
    expect(await balanceOf(api, 'irPayable')).toBe('3641.67');
    const t = (await api.get('/taxes/summary?month=2026-10').expect(200)).body;
    expect(t.items.map((i: any) => i.concept)).toEqual(expect.arrayContaining(['INSS laboral y patronal', 'INATEC 2 %', 'Retenciones IR (salarios)']));
  });
});

describe('inventario y flujo de efectivo', () => {
  it('usa costo promedio, registra costo de ventas y lo revierte al anular', async () => {
    const { api } = await setupCompany();
    const client = await customer(api, 'consumidor_final');
    const p = (await api.post('/products').send({ kind: 'product', name: 'Café 1 lb', price: '150', taxCode: 'IVA15', trackStock: true }).expect(201)).body;
    await api.post(`/products/${p.id}/stock-in`).send({ date: '2026-10-01', quantity: 10, unitCost: '80' }).expect(201);
    const after = (await api.post(`/products/${p.id}/stock-in`).send({ date: '2026-10-02', quantity: 10, unitCost: '100' }).expect(201)).body;
    expect(after).toMatchObject({ stock: '20.000', avgCost: '90.0000' });

    await api.post('/invoices').send({ contactId: client.id, issue: true, issueDate: '2026-10-03', lines: [{ productId: p.id, description: 'Café', quantity: 25, unitPrice: 150 }] }).expect(400);
    const inv = (await api.post('/invoices').send({ contactId: client.id, issue: true, issueDate: '2026-10-03', lines: [{ productId: p.id, description: 'Café', quantity: 5, unitPrice: 150 }] }).expect(201)).body;
    expect(await balanceOf(api, 'costOfSales')).toBe('450.00');
    expect(await balanceOf(api, 'inventory')).toBe('1350.00');
    await api.post(`/invoices/${inv.id}/void`).send({ reason: 'Devolución' }).expect(200);
    expect(await balanceOf(api, 'inventory')).toBe('1800.00');
    expect((await api.get('/products').expect(200)).body[0].stock).toBe('20.000');
  });

  it('el flujo de efectivo cuadra con caja y bancos', async () => {
    const { api, account } = await setupCompany();
    await api.post('/journal').send({ date: '2026-09-30', description: 'Aporte de capital', lines: [{ accountId: account('bank'), debit: '50000' }, { accountId: account('equity'), credit: '50000' }] }).expect(201);
    const client = await customer(api, 'consumidor_final');
    const inv = (await api.post('/invoices').send({ contactId: client.id, issue: true, issueDate: '2026-10-02', lines: [{ description: 'Venta', quantity: 1, unitPrice: 1000 }] }).expect(201)).body;
    await api.post(`/invoices/${inv.id}/payments`).send({ amount: '1150', date: '2026-10-03' }).expect(201);
    await api.post('/expenses').send({ accountId: account('6.2.01'), date: '2026-10-04', description: 'Alquiler', amount: '2300' }).expect(201);
    await api.post('/journal').send({ date: '2026-10-05', description: 'Compra de laptop', lines: [{ accountId: account('1.2.01.02'), debit: '15000' }, { accountId: account('bank'), credit: '15000' }] }).expect(201);
    const cf = (await api.get('/reports/cash-flow?from=2026-10-01&to=2026-10-31').expect(200)).body;
    expect(cf.opening).toBe('50000.00');
    expect(cf.sections.find((s: any) => s.section === 'operacion').total).toBe('-1150.00');
    expect(cf.sections.find((s: any) => s.section === 'inversion').total).toBe('-15000.00');
    expect(cf.closing).toBe(await balanceOf(api, 'bank'));
    const diario = await api.get('/journal?format=csv&from=2026-10-01&to=2026-10-31').expect(200);
    expect(diario.text).toContain('Compra de laptop');
  });
});

describe('controles contables', () => {
  it('exige asientos cuadrados, respeta el cierre y permite revertir', async () => {
    const { api, account } = await setupCompany();
    await api.post('/journal').send({ date: '2026-03-01', description: 'Descuadrado', lines: [{ accountId: account('bank'), debit: '100' }, { accountId: account('equity'), credit: '90' }] }).expect(400);
    const ok = (await api.post('/journal').send({ date: '2026-03-01', description: 'Aporte de capital', lines: [{ accountId: account('bank'), debit: '1000' }, { accountId: account('equity'), credit: '1000' }] }).expect(201)).body;
    const ledger = (await api.get(`/journal/ledger/${account('bank')}`).expect(200)).body;
    expect(ledger.moves.at(-1).balance).toBe('1000.00');
    await api.post('/companies/current/close-period').send({ until: '2026-03-31' }).expect(200);
    await api.post('/journal').send({ date: '2026-03-15', description: 'En período cerrado', lines: [{ accountId: account('bank'), debit: '1' }, { accountId: account('equity'), credit: '1' }] }).expect(400);
    await api.post(`/journal/${ok.id}/reverse`).send({ reason: 'Prueba', date: '2026-04-01' }).expect(201);
    await api.post(`/journal/${ok.id}/reverse`).send({ reason: 'Otra vez', date: '2026-04-01' }).expect(400);
    expect(await balanceOf(api, 'bank')).toBe('0.00');
    const bs = (await api.get('/reports/balance-sheet?date=2026-12-31').expect(200)).body;
    expect(bs.balanced).toBe(true);
  });

  it('impide modificar asientos directamente en la base de datos', async () => {
    const { pool } = await import('../src/db.js');
    await expect(pool.query('UPDATE journal_lines SET debit = debit + 1')).rejects.toThrow(/no se pueden modificar/);
  });

  it('permite al dueño invitar a un usuario con rol de solo lectura', async () => {
    const owner = await setupCompany();
    const viewer = await setupCompany();
    await owner.api.post('/companies/current/members').send({ email: viewer.email, role: 'viewer' }).expect(201);
    const asViewer = (r: request.Test) => r.set('Authorization', `Bearer ${viewer.token}`).set('X-Company-Id', owner.companyId);
    await asViewer(request(app).get('/invoices')).expect(200);
    await asViewer(request(app).post('/contacts')).send({ name: 'No debería' }).expect(403);
    await asViewer(request(app).get('/payroll/employees')).expect(403);
  });
});

describe('soporte', () => {
  it('crea tickets desde la web de ayuda', async () => {
    const r = await request(app)
      .post('/support/tickets')
      .send({ name: 'Carmen', email: 'carmen@ejemplo.test', subject: 'Duda', message: '¿Cómo registro la cuota fija?', category: 'impuestos' })
      .expect(201);
    expect(r.body.number).toHaveLength(8);
  });
});
