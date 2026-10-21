import { describe, expect, it } from 'vitest';
import { calcPayroll, expectedWithholding, irSalarialMensual } from './nicaragua.js';
import { calcLine, splitTaxIncluded } from './invoice.js';

describe('Nicaragua', () => {
  it('aplica el IVA del 15 %', () => {
    expect(calcLine({ quantity: 1, unitPrice: 1000, taxRate: 15 })).toEqual({ subtotal: '1000.00', tax: '150.00', total: '1150.00' });
    expect(splitTaxIncluded('1150', 15)).toEqual({ subtotal: '1000.00', tax: '150.00', total: '1150.00' });
  });

  it('calcula retenciones del IR según tipo y mínimo', () => {
    expect(expectedWithholding('bienes_servicios', 999, 'general')).toEqual({ rate: 0, amount: '0.00' });
    expect(expectedWithholding('bienes_servicios', 1000, 'general')).toEqual({ rate: 2, amount: '20.00' });
    expect(expectedWithholding('agropecuario', 500, 'general')).toEqual({ rate: 3, amount: '15.00' });
    expect(expectedWithholding('profesional', 5000, 'general')).toEqual({ rate: 10, amount: '500.00' });
    expect(expectedWithholding('profesional', 5000, 'consumidor_final').amount).toBe('0.00');
  });

  it('calcula el IR salarial con la tabla progresiva', () => {
    // 10,000 mensuales: (10,000 − 700) × 12 = 111,600 → 15 % sobre 11,600 = 1,740 al año = 145 al mes
    expect(irSalarialMensual(10000)).toBe('145.00');
    expect(irSalarialMensual(8000)).toBe('0.00');
    // 30,000: (30,000 − 2,100) × 12 = 334,800 → 15,000 + 20 % × 134,800 = 41,960 → 3,496.67
    expect(irSalarialMensual(30000)).toBe('3496.67');
  });

  it('calcula la nómina con aportes y provisiones', () => {
    expect(calcPayroll(10000, 3)).toEqual({
      gross: '10000.00', inssEmployee: '700.00', ir: '145.00', net: '9155.00', inssEmployer: '2150.00', inatec: '200.00',
      aguinaldo: '833.00', vacaciones: '833.00', indemnizacion: '833.00',
    });
    expect(calcPayroll(10000, 60).inssEmployer).toBe('2250.00');
  });
});
