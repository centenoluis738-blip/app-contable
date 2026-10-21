import pg from 'pg';
import { config } from './config.js';

// Devolver los NUMERIC como texto (no como número) para no perder precisión.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => v);
// Las fechas (sin hora) se devuelven tal cual, "2026-10-21", sin conversión de zona horaria.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

export type Db = pg.Pool | pg.PoolClient;

export async function query<T extends pg.QueryResultRow = any>(db: Db, text: string, params: unknown[] = []): Promise<T[]> {
  const res = await db.query<T>(text, params);
  return res.rows;
}

export async function one<T extends pg.QueryResultRow = any>(db: Db, text: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await query<T>(db, text, params);
  return rows[0];
}

/** Ejecuta fn dentro de una transacción; si algo falla se deshace todo. */
export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
