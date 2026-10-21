import { describe, expect, it } from 'vitest';
import { calcDocument, calcLine, splitTaxIncluded } from './invoice.js';
import { money } from './money.js';

describe('cálculos de factura', () => {
  it('calcula una línea con impuesto', () => {
    expect(calcLine({ quantity: 3, unitPrice: '19.99', taxRate: 16 })).toEqual({
      subtotal: '59.97',
      tax: '9.60',
      total: '69.57',
    });
  });

  it('evita errores de coma flotante', () => {
    expect(money('0.1')).toBe('0.10');
    expect(calcLine({ quantity: '0.1', unitPrice: '0.2', taxRate: 0 }).subtotal).toBe('0.02');
    expect(calcLine({ quantity: 1, unitPrice: '1.005', taxRate: 0 }).subtotal).toBe('1.01');
  });

  it('aplica descuento y agrupa por tasa', () => {
    const doc = calcDocument([
      { quantity: 2, unitPrice: 100, taxRate: 21, discount: 10 },
      { quantity: 1, unitPrice: 50, taxRate: 10 },
      { quantity: 1, unitPrice: 20, taxRate: 21 },
    ]);
    expect(doc.subtotal).toBe('250.00');
    expect(doc.taxTotal).toBe('47.00');
    expect(doc.total).toBe('297.00');
    expect(doc.taxBreakdown).toEqual([
      { rate: '21.00', base: '200.00', tax: '42.00' },
      { rate: '10.00', base: '50.00', tax: '5.00' },
    ]);
  });

  it('separa impuesto incluido', () => {
    expect(splitTaxIncluded('116.00', 16)).toEqual({ subtotal: '100.00', tax: '16.00', total: '116.00' });
  });
});
