import { Router } from 'express';
import { z } from 'zod';
import { one, pool } from '../db.js';
import { HttpError } from '../middleware/errors.js';

export const supportRouter = Router();

// Límite sencillo por IP para evitar spam en el formulario público (5 tickets por hora).
const hits = new Map<string, number[]>();
const LIMIT = 5;
const WINDOW_MS = 60 * 60 * 1000;

/** Crea un ticket de soporte desde la web de ayuda. Es público (no requiere sesión). */
supportRouter.post('/tickets', async (req, res) => {
  const ip = req.ip ?? 'desconocida';
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= LIMIT) throw new HttpError(429, 'Has enviado demasiadas solicitudes; inténtalo más tarde');
  hits.set(ip, [...recent, now]);

  const b = z
    .object({
      name: z.string().trim().min(2, 'Escribe tu nombre'),
      email: z.string().trim().email('Correo no válido'),
      subject: z.string().trim().min(3, 'Escribe el asunto').max(200),
      message: z.string().trim().min(10, 'Cuéntanos un poco más (mínimo 10 caracteres)').max(5000),
      category: z.enum(['cuenta', 'facturacion', 'contabilidad', 'impuestos', 'bancos', 'app_movil', 'otro']).default('otro'),
      // Campo trampa: los humanos lo dejan vacío, los bots suelen rellenarlo
      website: z.string().max(0).optional(),
    })
    .parse(req.body);
  const t = await one(
    pool,
    'INSERT INTO support_tickets(name, email, subject, message, category) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at',
    [b.name, b.email, b.subject, b.message, b.category],
  );
  // Aquí se puede enviar el ticket a Freshdesk/Zendesk o por correo al equipo de soporte.
  res.status(201).json({ id: t.id, number: t.id.slice(0, 8).toUpperCase(), createdAt: t.created_at });
});
