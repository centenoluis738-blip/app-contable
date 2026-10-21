import { D, money, round2, sum, type MoneyInput } from './money.js';

export interface LineInput {
  quantity: MoneyInput;
  unitPrice: MoneyInput;
  /** Porcentaje de impuesto, por ejemplo 16 para 16 %. */
  taxRate: MoneyInput;
  /** Porcentaje de descuento sobre la línea. */
  discount?: MoneyInput;
}

export interface LineTotals {
  subtotal: string;
  tax: string;
  total: string;
}

export interface DocumentTotals {
  lines: LineTotals[];
  subtotal: string;
  taxTotal: string;
  total: string;
  /** Base e impuesto agrupados por tasa, para el desglose de la factura y la declaración. */
  taxBreakdown: { rate: string; base: string; tax: string }[];
}

/** Calcula importes por línea (redondeando cada línea) y totales del documento. */
export function calcLine(line: LineInput): LineTotals {
  const gross = D(line.quantity).times(D(line.unitPrice));
  const discount = gross.times(D(line.discount ?? 0)).dividedBy(100);
  const subtotal = round2(gross.minus(discount));
  const tax = round2(subtotal.times(D(line.taxRate)).dividedBy(100));
  return { subtotal: money(subtotal), tax: money(tax), total: money(subtotal.plus(tax)) };
}

export function calcDocument(lines: LineInput[]): DocumentTotals {
  const computed = lines.map(calcLine);
  const byRate = new Map<string, { base: string[]; tax: string[] }>();
  lines.forEach((l, i) => {
    const rate = D(l.taxRate).toFixed(2);
    const entry = byRate.get(rate) ?? { base: [], tax: [] };
    entry.base.push(computed[i].subtotal);
    entry.tax.push(computed[i].tax);
    byRate.set(rate, entry);
  });
  const subtotal = sum(computed.map((c) => c.subtotal));
  const taxTotal = sum(computed.map((c) => c.tax));
  return {
    lines: computed,
    subtotal: money(subtotal),
    taxTotal: money(taxTotal),
    total: money(subtotal.plus(taxTotal)),
    taxBreakdown: [...byRate.entries()]
      .sort(([a], [b]) => Number(b) - Number(a))
      .map(([rate, v]) => ({ rate, base: money(sum(v.base)), tax: money(sum(v.tax)) })),
  };
}

/** Separa un importe con impuesto incluido en base e impuesto (útil para tickets de gastos). */
export function splitTaxIncluded(total: MoneyInput, taxRate: MoneyInput): LineTotals {
  const t = round2(total);
  const subtotal = round2(t.dividedBy(D(1).plus(D(taxRate).dividedBy(100))));
  return { subtotal: money(subtotal), tax: money(t.minus(subtotal)), total: money(t) };
}
