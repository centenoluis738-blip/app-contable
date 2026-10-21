import { Decimal } from 'decimal.js';

// Los importes se manejan siempre como Decimal o como texto ("123.45"),
// nunca como número de coma flotante, para evitar errores de redondeo.
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = string | number | Decimal;

export const D = (v: MoneyInput | null | undefined): Decimal => new Decimal(v ?? 0);

/** Redondea a 2 decimales (céntimos) con redondeo comercial (mitad hacia arriba). */
export const round2 = (v: MoneyInput): Decimal => D(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Devuelve el importe como texto con 2 decimales, listo para guardar en la base de datos. */
export const money = (v: MoneyInput): string => round2(v).toFixed(2);

export const sum = (values: MoneyInput[]): Decimal => values.reduce<Decimal>((acc, v) => acc.plus(D(v)), D(0));

export const isZero = (v: MoneyInput): boolean => round2(v).isZero();

export function formatMoney(v: MoneyInput, currency = 'NIO', locale = 'es-NI'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(money(v)));
}

export { Decimal };
