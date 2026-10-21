import pg from 'pg';

/** Deja la base de datos de pruebas vacía y con el esquema al día antes de correr las pruebas. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgres://contable:contable@localhost:5432/contable_test';
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();
  process.env.DATABASE_URL = url;
  const { migrate } = await import('../src/migrate.js');
  const { pool } = await import('../src/db.js');
  await migrate();
  await pool.end();
}
