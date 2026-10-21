import type { AccountType, SystemAccountKey } from '@contable/shared';

export interface TemplateAccount {
  code: string;
  name: string;
  type: AccountType;
  parent?: string;
  systemKey?: SystemAccountKey;
}

/**
 * Catálogo de cuentas base para MIPYMES de Nicaragua, ordenado según la presentación
 * de estados financieros de las NIIF para PYMES. El contador puede ampliarlo por empresa.
 */
export const DEFAULT_CHART: TemplateAccount[] = [
  { code: '1', name: 'Activo', type: 'asset' },
  { code: '1.1', name: 'Activo corriente', type: 'asset', parent: '1' },
  { code: '1.1.01', name: 'Efectivo y equivalentes de efectivo', type: 'asset', parent: '1.1' },
  { code: '1.1.01.01', name: 'Caja general', type: 'asset', parent: '1.1.01', systemKey: 'cash' },
  { code: '1.1.01.02', name: 'Caja chica', type: 'asset', parent: '1.1.01' },
  { code: '1.1.01.03', name: 'Bancos moneda nacional', type: 'asset', parent: '1.1.01', systemKey: 'bank' },
  { code: '1.1.01.04', name: 'Bancos moneda extranjera (USD)', type: 'asset', parent: '1.1.01' },
  { code: '1.1.02', name: 'Clientes', type: 'asset', parent: '1.1', systemKey: 'receivable' },
  { code: '1.1.03', name: 'Impuestos pagados por anticipado', type: 'asset', parent: '1.1' },
  { code: '1.1.03.01', name: 'IVA acreditable', type: 'asset', parent: '1.1.03', systemKey: 'vatReceivable' },
  { code: '1.1.03.02', name: 'Retenciones IR por acreditar', type: 'asset', parent: '1.1.03', systemKey: 'whtReceivable' },
  { code: '1.1.03.03', name: 'Anticipos de IR (PMD)', type: 'asset', parent: '1.1.03', systemKey: 'irAdvances' },
  { code: '1.1.04', name: 'Inventario de mercadería', type: 'asset', parent: '1.1', systemKey: 'inventory' },
  { code: '1.1.05', name: 'Anticipos a proveedores', type: 'asset', parent: '1.1' },
  { code: '1.2', name: 'Activo no corriente', type: 'asset', parent: '1' },
  { code: '1.2.01', name: 'Propiedad, planta y equipo', type: 'asset', parent: '1.2' },
  { code: '1.2.01.01', name: 'Mobiliario y equipo de oficina', type: 'asset', parent: '1.2.01' },
  { code: '1.2.01.02', name: 'Equipo de cómputo', type: 'asset', parent: '1.2.01' },
  { code: '1.2.01.03', name: 'Vehículos', type: 'asset', parent: '1.2.01' },
  { code: '1.2.01.04', name: 'Depreciación acumulada', type: 'asset', parent: '1.2.01' },

  { code: '2', name: 'Pasivo', type: 'liability' },
  { code: '2.1', name: 'Pasivo corriente', type: 'liability', parent: '2' },
  { code: '2.1.01', name: 'Proveedores', type: 'liability', parent: '2.1', systemKey: 'payable' },
  { code: '2.1.02', name: 'Impuestos por pagar', type: 'liability', parent: '2.1' },
  { code: '2.1.02.01', name: 'IVA por pagar', type: 'liability', parent: '2.1.02', systemKey: 'vatPayable' },
  { code: '2.1.02.02', name: 'Retenciones IR por pagar', type: 'liability', parent: '2.1.02', systemKey: 'irPayable' },
  { code: '2.1.02.03', name: 'Cuota fija, IMI y PMD por pagar', type: 'liability', parent: '2.1.02', systemKey: 'taxesPayable' },
  { code: '2.1.03', name: 'Obligaciones laborales', type: 'liability', parent: '2.1' },
  { code: '2.1.03.01', name: 'Sueldos por pagar', type: 'liability', parent: '2.1.03', systemKey: 'wagesPayable' },
  { code: '2.1.03.02', name: 'INSS por pagar (laboral y patronal)', type: 'liability', parent: '2.1.03', systemKey: 'inssPayable' },
  { code: '2.1.03.03', name: 'INATEC por pagar', type: 'liability', parent: '2.1.03', systemKey: 'inatecPayable' },
  { code: '2.1.03.04', name: 'Provisión de aguinaldo', type: 'liability', parent: '2.1.03', systemKey: 'provAguinaldo' },
  { code: '2.1.03.05', name: 'Provisión de vacaciones', type: 'liability', parent: '2.1.03', systemKey: 'provVacaciones' },
  { code: '2.1.03.06', name: 'Provisión de indemnización', type: 'liability', parent: '2.1.03', systemKey: 'provIndemnizacion' },
  { code: '2.1.04', name: 'Préstamos bancarios a corto plazo', type: 'liability', parent: '2.1' },
  { code: '2.2', name: 'Pasivo no corriente', type: 'liability', parent: '2' },
  { code: '2.2.01', name: 'Préstamos bancarios a largo plazo', type: 'liability', parent: '2.2' },

  { code: '3', name: 'Patrimonio', type: 'equity' },
  { code: '3.1', name: 'Capital social', type: 'equity', parent: '3', systemKey: 'equity' },
  { code: '3.2', name: 'Utilidades retenidas', type: 'equity', parent: '3', systemKey: 'retainedEarnings' },

  { code: '4', name: 'Ingresos', type: 'income' },
  { code: '4.1', name: 'Ventas', type: 'income', parent: '4', systemKey: 'sales' },
  { code: '4.2', name: 'Otros ingresos', type: 'income', parent: '4', systemKey: 'otherIncome' },
  { code: '4.3', name: 'Ganancia por diferencial cambiario', type: 'income', parent: '4', systemKey: 'fxGain' },

  { code: '5', name: 'Costos', type: 'expense' },
  { code: '5.1', name: 'Costo de ventas', type: 'expense', parent: '5', systemKey: 'costOfSales' },

  { code: '6', name: 'Gastos de operación', type: 'expense' },
  { code: '6.1', name: 'Gastos de personal', type: 'expense', parent: '6' },
  { code: '6.1.01', name: 'Sueldos y salarios', type: 'expense', parent: '6.1', systemKey: 'salaries' },
  { code: '6.1.02', name: 'Aguinaldo', type: 'expense', parent: '6.1', systemKey: 'expAguinaldo' },
  { code: '6.1.03', name: 'Vacaciones', type: 'expense', parent: '6.1', systemKey: 'expVacaciones' },
  { code: '6.1.04', name: 'Indemnización', type: 'expense', parent: '6.1', systemKey: 'expIndemnizacion' },
  { code: '6.1.05', name: 'INSS patronal', type: 'expense', parent: '6.1', systemKey: 'expInss' },
  { code: '6.1.06', name: 'INATEC', type: 'expense', parent: '6.1', systemKey: 'expInatec' },
  { code: '6.2', name: 'Gastos generales', type: 'expense', parent: '6' },
  { code: '6.2.01', name: 'Alquiler del local', type: 'expense', parent: '6.2' },
  { code: '6.2.02', name: 'Energía, agua, teléfono e internet', type: 'expense', parent: '6.2' },
  { code: '6.2.03', name: 'Papelería y útiles de oficina', type: 'expense', parent: '6.2' },
  { code: '6.2.04', name: 'Publicidad y propaganda', type: 'expense', parent: '6.2' },
  { code: '6.2.05', name: 'Transporte y combustible', type: 'expense', parent: '6.2' },
  { code: '6.2.06', name: 'Mantenimiento y reparaciones', type: 'expense', parent: '6.2' },
  { code: '6.2.07', name: 'Honorarios profesionales', type: 'expense', parent: '6.2' },
  { code: '6.2.08', name: 'Depreciación', type: 'expense', parent: '6.2' },
  { code: '6.2.09', name: 'Impuestos municipales y cuota fija', type: 'expense', parent: '6.2', systemKey: 'taxesExpense' },
  { code: '6.2.10', name: 'Otros gastos generales', type: 'expense', parent: '6.2', systemKey: 'generalExpense' },
  { code: '6.3', name: 'Gastos financieros', type: 'expense', parent: '6' },
  { code: '6.3.01', name: 'Intereses bancarios', type: 'expense', parent: '6.3' },
  { code: '6.3.02', name: 'Comisiones bancarias', type: 'expense', parent: '6.3' },
  { code: '6.3.03', name: 'Pérdida por diferencial cambiario', type: 'expense', parent: '6.3', systemKey: 'fxLoss' },
  { code: '6.4', name: 'Gastos no deducibles', type: 'expense', parent: '6', systemKey: 'nonDeductible' },
];
