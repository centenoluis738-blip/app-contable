import type { PoolClient } from 'pg';
import { one, type Db } from '../db.js';
import { badRequest } from '../middleware/errors.js';

/**
 * Tipo de cambio (córdobas por unidad) para una moneda en una fecha: el último registrado
 * en esa fecha o antes. La moneda de la empresa siempre vale 1.
 */
export async function getRate(db: Db | PoolClient, companyId: string, currency: string, date: string): Promise<string> {
  const company = await one(db, 'SELECT currency FROM companies WHERE id = $1', [companyId]);
  if (!company || currency === company.currency) return '1';
  const row = await one(
    db,
    'SELECT rate FROM exchange_rates WHERE company_id = $1 AND currency = $2 AND date <= $3 ORDER BY date DESC LIMIT 1',
    [companyId, currency, date],
  );
  if (!row) throw badRequest(`Registra el tipo de cambio de ${currency} (Configuración → Tipo de cambio) para el ${date}`);
  return row.rate;
}
