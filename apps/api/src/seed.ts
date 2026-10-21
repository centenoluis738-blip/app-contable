import bcrypt from 'bcryptjs';
import { one, pool, tx } from './db.js';
import { createDefaultChart, createEntry, systemAccount } from './lib/journal.js';

/**
 * Datos de demostración: usuario demo@contable.app / Demo1234, una empresa con clientes,
 * productos y un aporte de capital inicial. Las facturas y gastos se crean desde la app.
 */
async function seed() {
  const email = 'demo@contable.app';
  if (await one(pool, 'SELECT 1 FROM users WHERE email = $1', [email])) {
    console.log('Los datos de demostración ya existen (demo@contable.app / Demo1234)');
    return;
  }
  await tx(async (client) => {
    const user = await one(client, 'INSERT INTO users(email, name, password_hash) VALUES ($1,$2,$3) RETURNING id', [
      email, 'Usuario Demo', await bcrypt.hash('Demo1234', 12),
    ]);
    const company = await one(
      client,
      `INSERT INTO companies(name, tax_id, country, currency, default_tax_rate, tax_regime, fixed_fee, municipality, address, email)
       VALUES ('Mi Negocio Demo', '0010101800000X', 'NI', 'NIO', 15, 'cuota_fija', 600, 'Managua', 'De la rotonda 2 c. al lago, Managua', 'hola@minegocio.demo')
       RETURNING id`,
    );
    await client.query(`INSERT INTO memberships(user_id, company_id, role) VALUES ($1,$2,'owner')`, [user.id, company.id]);
    await createDefaultChart(client, company.id);
    for (const [kind, name, taxId, mail, regime] of [
      ['customer', 'Distribuidora Ejemplo S.A.', 'J0310000000001', 'compras@distribuidora.demo', 'general'],
      ['customer', 'Ana Gómez', null, 'ana@correo.demo', 'consumidor_final'],
      ['supplier', 'Librería y Papelería Central', 'J0310000000002', 'ventas@papeleria.demo', 'general'],
    ]) {
      await client.query('INSERT INTO contacts(company_id, kind, name, tax_id, email, tax_regime) VALUES ($1,$2,$3,$4,$5,$6)', [
        company.id, kind, name, taxId, mail, regime,
      ]);
    }
    for (const [kind, name, price, code] of [
      ['service', 'Reparación de equipo (hora)', '450.00', 'IVA15'],
      ['service', 'Mantenimiento mensual', '2500.00', 'IVA15'],
      ['product', 'Café molido 1 lb', '180.00', 'IVA15'],
      ['product', 'Arroz 1 lb (canasta básica)', '22.00', 'EXENTO'],
    ]) {
      await client.query('INSERT INTO products(company_id, kind, name, price, tax_code, tax_rate) VALUES ($1,$2,$3,$4,$5,$6)', [
        company.id, kind, name, price, code, code === 'IVA15' ? 15 : 0,
      ]);
    }
    // Tipo de cambio de ejemplo: actualízalo con el oficial publicado por el BCN
    await client.query(`INSERT INTO exchange_rates(company_id, currency, date, rate) VALUES ($1, 'USD', $2, 36.6243)`, [company.id, `${new Date().getFullYear()}-01-01`]);
    await client.query(
      `INSERT INTO employees(company_id, name, position, monthly_salary, start_date) VALUES ($1,'María Rodríguez','Vendedora',9500,'2025-01-15')`,
      [company.id],
    );
    const today = new Date().toISOString().slice(0, 10);
    await createEntry(client, {
      companyId: company.id, userId: user.id, date: `${today.slice(0, 4)}-01-01`, description: 'Aporte inicial de capital',
      lines: [
        { accountId: await systemAccount(client, company.id, 'bank'), debit: '50000.00' },
        { accountId: await systemAccount(client, company.id, 'equity'), credit: '50000.00' },
      ],
    });
  });
  console.log('Datos de demostración creados: demo@contable.app / Demo1234');
}

seed()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
