import { z } from 'zod';

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');
export const amount = z.union([z.string(), z.number()]).transform(String).refine((v) => /^-?\d+(\.\d+)?$/.test(v), 'Importe no válido');
export const positiveAmount = amount.refine((v) => Number(v) > 0, 'Debe ser mayor que cero');
export const rate = z.union([z.string(), z.number()]).transform(Number).refine((v) => v >= 0 && v <= 100, 'Porcentaje entre 0 y 100');
export const uuid = z.string().uuid('Identificador no válido');
export const today = () => new Date().toISOString().slice(0, 10);

export const pagination = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
