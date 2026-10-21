import bcrypt from 'bcryptjs';
import { one, pool, tx } from './db.js';
import { createDefaultChart, createEntry, systemAccount } from './lib/journal.js';

/**
 * Datos de demostración: usuario demo@contable.app / Demo1234 con un tramo del Mercado de Artesanías de Masaya
 * (cuota fija, modo sencillo), su inventario de piezas, clientes y un aporte inicial. Las ventas se registran desde la app.
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
       VALUES ('Artesanías El Güegüense (demo)', '4010101800000X', 'NI', 'NIO', 15, 'cuota_fija', 400, 'Masaya', 'Mercado de Artesanías, tramo 12, Masaya', 'hola@tramo.demo')
       RETURNING id`,
    );
    await client.query(`INSERT INTO memberships(user_id, company_id, role) VALUES ($1,$2,'owner')`, [user.id, company.id]);
    await createDefaultChart(client, company.id);
    for (const [kind, name, taxId, mail, regime] of [
      ['customer', 'Hotel Ejemplo S.A.', 'J0310000000001', 'compras@hotel.demo', 'general'],
      ['customer', 'Ana Gómez', null, 'ana@correo.demo', 'consumidor_final'],
      ['supplier', 'Taller de hamacas (proveedor)', '4010101800001A', 'taller@hamacas.demo', 'cuota_fija'],
    ]) {
      await client.query('INSERT INTO contacts(company_id, kind, name, tax_id, email, tax_regime) VALUES ($1,$2,$3,$4,$5,$6)', [
        company.id, kind, name, taxId, mail, regime,
      ]);
    }
    const bank = await systemAccount(client, company.id, 'bank');
    const inventory = await systemAccount(client, company.id, 'inventory');
    const start = `${new Date().getFullYear()}-01-01`;
    // [nombre, precio de venta C$, existencias iniciales, costo unitario C$]
    for (const [name, price, stock, cost] of [
      ['Hamaca matrimonial de algodón', '1500.00', 8, '900.00'],
      ['Hamaca sencilla', '900.00', 10, '500.00'],
      ['Jarrón de cerámica de San Juan de Oriente', '450.00', 15, '220.00'],
      ['Mecedora en miniatura', '350.00', 12, '180.00'],
      ['Bolso de cuero', '1200.00', 6, '700.00'],
      ['Pulsera tejida', '80.00', 40, '30.00'],
    ] as const) {
      const p = await one(
        client,
        `INSERT INTO products(company_id, kind, name, price, tax_code, tax_rate, track_stock, stock, avg_cost) VALUES ($1,'product',$2,$3,'IVA15',15,true,$4,$5) RETURNING id`,
        [company.id, name, price, stock, cost],
      );
      const total = (stock * Number(cost)).toFixed(2);
      const entryId = await createEntry(client, {
        companyId: company.id, userId: user.id, date: start, sourceType: 'inventory', sourceId: p.id,
        description: `Inventario inicial: ${stock} × ${name}`,
        lines: [{ accountId: inventory, debit: total }, { accountId: bank, credit: total }],
      });
      await client.query(
        `INSERT INTO inventory_moves(company_id, product_id, date, kind, quantity, unit_cost, source_type, journal_entry_id) VALUES ($1,$2,$3,'in',$4,$5,'purchase',$6)`,
        [company.id, p.id, start, stock, cost, entryId],
      );
    }
    // Tipo de cambio de ejemplo: actualízalo con el oficial publicado por el BCN
    await client.query(`INSERT INTO exchange_rates(company_id, currency, date, rate) VALUES ($1, 'USD', $2, 36.6243)`, [company.id, `${new Date().getFullYear()}-01-01`]);
    await client.query(
      `INSERT INTO employees(company_id, name, position, monthly_salary, start_date) VALUES ($1,'María Rodríguez','Ayudante de tramo',9500,'2025-01-15')`,
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
