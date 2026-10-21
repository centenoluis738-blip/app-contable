import type { Db } from '../db.js';

export async function audit(
  db: Db,
  entry: { companyId?: string | null; userId?: string | null; action: string; entity: string; entityId?: string; data?: unknown },
) {
  await db.query(
    'INSERT INTO audit_log(company_id, user_id, action, entity, entity_id, data) VALUES ($1,$2,$3,$4,$5,$6)',
    [entry.companyId ?? null, entry.userId ?? null, entry.action, entry.entity, entry.entityId ?? null, entry.data ? JSON.stringify(entry.data) : null],
  );
}
