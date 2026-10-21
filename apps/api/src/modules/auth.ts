import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { one, pool, query } from '../db.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { HttpError } from '../middleware/errors.js';
import { audit } from '../lib/audit.js';

export const authRouter = Router();

const password = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .regex(/[A-Za-z]/, 'Incluye al menos una letra')
  .regex(/\d/, 'Incluye al menos un número');

authRouter.post('/register', async (req, res) => {
  const body = z
    .object({ name: z.string().trim().min(2), email: z.string().trim().toLowerCase().email('Correo no válido'), password })
    .parse(req.body);
  const exists = await one(pool, 'SELECT 1 FROM users WHERE email = $1', [body.email]);
  if (exists) throw new HttpError(409, 'Ya existe una cuenta con ese correo');
  const hash = await bcrypt.hash(body.password, 12);
  const user = await one(pool, 'INSERT INTO users(email, name, password_hash) VALUES ($1,$2,$3) RETURNING id, email, name', [
    body.email,
    body.name,
    hash,
  ]);
  await audit(pool, { userId: user.id, action: 'register', entity: 'user', entityId: user.id });
  res.status(201).json({ token: signToken(user), user });
});

authRouter.post('/login', async (req, res) => {
  const body = z.object({ email: z.string().trim().toLowerCase(), password: z.string() }).parse(req.body);
  const user = await one(pool, 'SELECT id, email, name, password_hash FROM users WHERE email = $1', [body.email]);
  // Mismo mensaje si el correo no existe o la contraseña es incorrecta, para no revelar cuentas
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) {
    throw new HttpError(401, 'Correo o contraseña incorrectos');
  }
  const { password_hash: _, ...safe } = user;
  await audit(pool, { userId: user.id, action: 'login', entity: 'user', entityId: user.id });
  res.json({ token: signToken(safe), user: safe });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const companies = await query(
    pool,
    `SELECT c.id, c.name, c.currency, c.country, m.role FROM memberships m JOIN companies c ON c.id = m.company_id
     WHERE m.user_id = $1 ORDER BY c.name`,
    [req.user!.id],
  );
  res.json({ user: req.user, companies });
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const body = z.object({ currentPassword: z.string(), newPassword: password }).parse(req.body);
  const user = await one(pool, 'SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
  if (!user || !(await bcrypt.compare(body.currentPassword, user.password_hash))) {
    throw new HttpError(400, 'La contraseña actual no es correcta');
  }
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(body.newPassword, 12), req.user!.id]);
  await audit(pool, { userId: req.user!.id, action: 'change_password', entity: 'user', entityId: req.user!.id });
  res.json({ ok: true });
});
