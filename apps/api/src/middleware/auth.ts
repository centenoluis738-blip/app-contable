import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@contable/shared';
import { config } from '../config.js';
import { one, pool } from '../db.js';
import { HttpError, forbidden } from './errors.js';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface CompanyContext {
  id: string;
  role: Role;
  currency: string;
  lockedUntil: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      company?: CompanyContext;
    }
  }
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
  });
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : undefined;
  if (!token) throw new HttpError(401, 'Inicia sesión para continuar');
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    req.user = { id: payload.sub as string, email: payload.email, name: payload.name };
  } catch {
    throw new HttpError(401, 'La sesión expiró o no es válida');
  }
  next();
};

/**
 * Exige que el usuario pertenezca a la empresa indicada en la cabecera X-Company-Id
 * y, opcionalmente, que tenga uno de los roles indicados.
 */
export const requireCompany =
  (...roles: Role[]): RequestHandler =>
  async (req, _res, next) => {
    const companyId = req.header('x-company-id');
    if (!companyId) throw new HttpError(400, 'Falta la cabecera X-Company-Id');
    const row = await one(
      pool,
      `SELECT m.role, c.currency, c.locked_until FROM memberships m JOIN companies c ON c.id = m.company_id
       WHERE m.user_id = $1 AND m.company_id = $2`,
      [req.user!.id, companyId],
    ).catch(() => undefined);
    if (!row) throw forbidden('No perteneces a esta empresa');
    if (roles.length && !roles.includes(row.role)) throw forbidden();
    req.company = { id: companyId, role: row.role, currency: row.currency, lockedUntil: row.locked_until };
    next();
  };

/** Roles que pueden registrar operaciones (todos menos solo lectura). */
export const WRITERS: Role[] = ['owner', 'accountant', 'employee'];
/** Roles que pueden hacer operaciones contables sensibles. */
export const ACCOUNTANTS: Role[] = ['owner', 'accountant'];

export const ctx = (req: Request) => ({ companyId: req.company!.id, userId: req.user!.id });
