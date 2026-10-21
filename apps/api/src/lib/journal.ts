import type { PoolClient } from 'pg';
import { D, money, sum, type SystemAccountKey } from '@contable/shared';
import { one, query } from '../db.js';
import { badRequest } from '../middleware/errors.js';
import { DEFAULT_CHART } from './chart-template.js';

export interface EntryLine {
  accountId: string;
  debit?: string;
  credit?: string;
  description?: string;
}

export interface NewEntry {
  companyId: string;
  userId?: string;
  date: string;
  description: string;
  sourceType?: string;
  sourceId?: string;
  reversesId?: string;
  lines: EntryLine[];
}

/** Crea el plan de cuentas inicial de una empresa. */
export async function createDefaultChart(client: PoolClient, companyId: string) {
  const ids = new Map<string, string>();
  for (const acc of DEFAULT_CHART) {
    const row = await one(
      client,
      `INSERT INTO accounts(company_id, code, name, type, parent_id, system_key) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [companyId, acc.code, acc.name, acc.type, acc.parent ? ids.get(acc.parent) : null, acc.systemKey ?? null],
    );
    ids.set(acc.code, row.id);
  }
}

export async function systemAccount(client: PoolClient, companyId: string, key: SystemAccountKey): Promise<string> {
  const row = await one(client, 'SELECT id FROM accounts WHERE company_id = $1 AND system_key = $2', [companyId, key]);
  if (!row) throw badRequest(`Falta la cuenta del sistema "${key}" en el plan de cuentas`);
  return row.id;
}

/** Comprueba que la fecha no caiga en un período cerrado. */
export async function assertOpenPeriod(client: PoolClient, companyId: string, date: string) {
  const row = await one(client, 'SELECT locked_until FROM companies WHERE id = $1 FOR SHARE', [companyId]);
  if (row?.locked_until && date <= row.locked_until) {
    throw badRequest(`El período está cerrado hasta el ${row.locked_until}; usa una fecha posterior`);
  }
}

/**
 * Registra un asiento contable. Valida que cuadre (debe = haber), que tenga al menos
 * dos líneas, que las cuentas sean de la empresa y que el período esté abierto.
 */
export async function createEntry(client: PoolClient, entry: NewEntry): Promise<string> {
  const lines = entry.lines
    .map((l) => ({ ...l, debit: money(l.debit ?? 0), credit: money(l.credit ?? 0) }))
    .filter((l) => !D(l.debit).isZero() || !D(l.credit).isZero());

  if (lines.length < 2) throw badRequest('Un asiento necesita al menos dos líneas con importe');
  for (const l of lines) {
    if (D(l.debit).isNeg() || D(l.credit).isNeg()) throw badRequest('Los importes del asiento no pueden ser negativos');
    if (!D(l.debit).isZero() && !D(l.credit).isZero()) throw badRequest('Cada línea va al debe o al haber, no a ambos');
  }
  const debit = sum(lines.map((l) => l.debit));
  const credit = sum(lines.map((l) => l.credit));
  if (!debit.equals(credit)) {
    throw badRequest(`El asiento no cuadra: debe ${money(debit)} y haber ${money(credit)}`);
  }

  const accountIds = [...new Set(lines.map((l) => l.accountId))];
  const valid = await query(client, 'SELECT id FROM accounts WHERE company_id = $1 AND id = ANY($2::uuid[]) AND is_active', [
    entry.companyId,
    accountIds,
  ]);
  if (valid.length !== accountIds.length) throw badRequest('Alguna cuenta no existe o está inactiva');

  await assertOpenPeriod(client, entry.companyId, entry.date);

  // Numeración correlativa por empresa (bloqueo para evitar números duplicados)
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`journal:${entry.companyId}`]);
  const next = await one(client, 'SELECT COALESCE(MAX(number), 0) + 1 AS n FROM journal_entries WHERE company_id = $1', [entry.companyId]);

  const created = await one(
    client,
    `INSERT INTO journal_entries(company_id, number, date, description, source_type, source_id, reverses_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [entry.companyId, next.n, entry.date, entry.description, entry.sourceType ?? 'manual', entry.sourceId ?? null, entry.reversesId ?? null, entry.userId ?? null],
  );
  for (const l of lines) {
    await client.query('INSERT INTO journal_lines(entry_id, account_id, description, debit, credit) VALUES ($1,$2,$3,$4,$5)', [
      created.id,
      l.accountId,
      l.description ?? null,
      l.debit,
      l.credit,
    ]);
  }
  return created.id;
}

/** Registra un contraasiento que anula el asiento indicado (intercambia debe y haber). */
export async function reverseEntry(
  client: PoolClient,
  opts: { companyId: string; entryId: string; date: string; description: string; userId?: string; sourceType?: string; sourceId?: string },
): Promise<string> {
  const original = await one(client, 'SELECT * FROM journal_entries WHERE id = $1 AND company_id = $2', [opts.entryId, opts.companyId]);
  if (!original) throw badRequest('El asiento a revertir no existe');
  const already = await one(client, 'SELECT id FROM journal_entries WHERE reverses_id = $1', [opts.entryId]);
  if (already) throw badRequest('Este asiento ya fue revertido');
  const lines = await query(client, 'SELECT account_id, debit, credit, description FROM journal_lines WHERE entry_id = $1', [opts.entryId]);
  return createEntry(client, {
    companyId: opts.companyId,
    userId: opts.userId,
    date: opts.date,
    description: opts.description,
    sourceType: opts.sourceType ?? original.source_type,
    sourceId: opts.sourceId ?? original.source_id,
    reversesId: opts.entryId,
    lines: lines.map((l) => ({ accountId: l.account_id, debit: l.credit, credit: l.debit, description: l.description })),
  });
}
