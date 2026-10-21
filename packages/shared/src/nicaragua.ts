import { D, money, round2, type MoneyInput } from './money.js';

/**
 * Reglas fiscales y laborales de Nicaragua usadas por la app.
 * Fuente: Ley de Concertación Tributaria (LCT) y sus reformas, Ley de Seguridad Social y Código del Trabajo.
 * Son valores configurables: revísalos con un contador colegiado cuando cambie la ley.
 */

export const NI = {
  currency: 'NIO',
  ivaRate: 15,
  /** Ingresos mensuales máximos para el régimen de cuota fija. */
  cuotaFijaMaxMonthlyIncome: 100_000,
  /** Inventario máximo para el régimen de cuota fija. */
  cuotaFijaMaxInventory: 500_000,
  /** Una venta al Estado mayor a este monto excluye del régimen de cuota fija. */
  cuotaFijaMaxStateSale: 50_000,
  imiRate: 1,
  inssEmployeeRate: 7,
  /** INSS patronal: 21.5 % con menos de 50 trabajadores, 22.5 % con 50 o más. */
  inssEmployerRate: (employees: number) => (employees >= 50 ? 22.5 : 21.5),
  inatecRate: 2,
  /** Aguinaldo, vacaciones e indemnización: un mes por año = 8.33 % mensual. */
  provisionRate: 8.33,
} as const;

export const TAX_CODES = {
  IVA15: { label: 'IVA 15 %', rate: 15 },
  IVA0: { label: 'Tasa cero (exportación)', rate: 0 },
  EXENTO: { label: 'Exento', rate: 0 },
} as const;
export type TaxCode = keyof typeof TAX_CODES;

export const TAX_REGIMES = { cuota_fija: 'Cuota fija', general: 'Régimen general' } as const;
export type TaxRegime = keyof typeof TAX_REGIMES;

export const CONTACT_REGIMES = {
  consumidor_final: 'Persona natural / consumidor final',
  cuota_fija: 'Cuota fija',
  general: 'Régimen general (empresa)',
} as const;
export type ContactRegime = keyof typeof CONTACT_REGIMES;

/** Retenciones del IR en la fuente que un cliente del régimen general aplica a tus ventas. */
export const WITHHOLDINGS = {
  ninguna: { label: 'Sin retención', rate: 0, minimum: 0 },
  bienes_servicios: { label: 'Bienes y servicios generales 2 %', rate: 2, minimum: 1000 },
  agropecuario: { label: 'Productos agropecuarios 3 %', rate: 3, minimum: 1 },
  profesional: { label: 'Servicios profesionales o técnicos 10 %', rate: 10, minimum: 1 },
} as const;
export type WithholdingType = keyof typeof WITHHOLDINGS;

/**
 * Retención esperada sobre una venta. Se calcula sobre la base sin IVA y en córdobas.
 * Solo aplica si el cliente es del régimen general (no a consumidores finales).
 */
export function expectedWithholding(type: WithholdingType, baseNio: MoneyInput, customer: ContactRegime): { rate: number; amount: string } {
  const w = WITHHOLDINGS[type];
  if (customer !== 'general' || w.rate === 0 || D(baseNio).lt(w.minimum)) return { rate: 0, amount: '0.00' };
  return { rate: w.rate, amount: money(D(baseNio).times(w.rate).dividedBy(100)) };
}

/** Tabla progresiva anual del IR sobre salarios (art. 23 LCT). */
const IR_TABLE = [
  { from: 0, to: 100_000, base: 0, rate: 0 },
  { from: 100_000, to: 200_000, base: 0, rate: 15 },
  { from: 200_000, to: 350_000, base: 15_000, rate: 20 },
  { from: 350_000, to: 500_000, base: 45_000, rate: 25 },
  { from: 500_000, to: Infinity, base: 82_500, rate: 30 },
];

/** IR mensual sobre un salario mensual (se proyecta a 12 meses, restando el INSS laboral). */
export function irSalarialMensual(monthlySalary: MoneyInput): string {
  const inss = D(monthlySalary).times(NI.inssEmployeeRate).dividedBy(100);
  const annual = D(monthlySalary).minus(inss).times(12);
  const bracket = IR_TABLE.find((b) => annual.gt(b.from) && annual.lte(b.to)) ?? IR_TABLE[0];
  const tax = D(bracket.base).plus(annual.minus(bracket.from).times(bracket.rate).dividedBy(100));
  return money((tax.isNeg() ? D(0) : tax).dividedBy(12));
}

export interface PayrollLine {
  gross: string;
  inssEmployee: string;
  ir: string;
  net: string;
  inssEmployer: string;
  inatec: string;
  aguinaldo: string;
  vacaciones: string;
  indemnizacion: string;
}

/** Cálculo de la nómina mensual de un trabajador con sus aportes y provisiones. */
export function calcPayroll(monthlySalary: MoneyInput, totalEmployees: number): PayrollLine {
  const gross = round2(monthlySalary);
  const pct = (r: number) => money(gross.times(r).dividedBy(100));
  const inssEmployee = pct(NI.inssEmployeeRate);
  const ir = irSalarialMensual(gross);
  return {
    gross: money(gross),
    inssEmployee,
    ir,
    net: money(gross.minus(inssEmployee).minus(ir)),
    inssEmployer: pct(NI.inssEmployerRate(totalEmployees)),
    inatec: pct(NI.inatecRate),
    aguinaldo: pct(NI.provisionRate),
    vacaciones: pct(NI.provisionRate),
    indemnizacion: pct(NI.provisionRate),
  };
}
