import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const notFound = (what = 'Recurso') => new HttpError(404, `${what} no encontrado`);
export const forbidden = (msg = 'No tienes permiso para esta acción') => new HttpError(403, msg);

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Datos no válidos',
      details: err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  // Errores de PostgreSQL conocidos
  if (err?.code === '23505') {
    res.status(409).json({ error: 'Ya existe un registro con esos datos' });
    return;
  }
  if (err?.code === '23503') {
    res.status(409).json({ error: 'El registro está en uso o hace referencia a otro que no existe' });
    return;
  }
  if (err?.code === '22P02') {
    res.status(400).json({ error: 'Identificador o valor no válido' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
};
