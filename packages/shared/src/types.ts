export const ROLES = ['owner', 'accountant', 'employee', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const INVOICE_STATUSES = ['draft', 'issued', 'partial', 'paid', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Dueño',
  accountant: 'Contador',
  employee: 'Empleado',
  viewer: 'Solo lectura',
};

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Activo',
  liability: 'Pasivo',
  equity: 'Patrimonio',
  income: 'Ingresos',
  expense: 'Gastos',
};

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Borrador',
  issued: 'Emitida',
  partial: 'Cobro parcial',
  paid: 'Cobrada',
  void: 'Anulada',
};

/** Cuentas que el sistema usa para generar asientos automáticos. */
export const SYSTEM_ACCOUNTS = {
  cash: 'Caja general',
  bank: 'Bancos moneda nacional',
  receivable: 'Clientes',
  vatReceivable: 'IVA acreditable',
  whtReceivable: 'Retenciones IR por acreditar',
  irAdvances: 'Anticipos de IR (PMD)',
  inventory: 'Inventario de mercadería',
  payable: 'Proveedores',
  vatPayable: 'IVA por pagar',
  irPayable: 'Retenciones IR por pagar',
  taxesPayable: 'Impuestos por pagar (cuota fija, IMI, PMD)',
  wagesPayable: 'Sueldos por pagar',
  inssPayable: 'INSS por pagar',
  inatecPayable: 'INATEC por pagar',
  provAguinaldo: 'Provisión de aguinaldo',
  provVacaciones: 'Provisión de vacaciones',
  provIndemnizacion: 'Provisión de indemnización',
  equity: 'Capital social',
  retainedEarnings: 'Utilidades retenidas',
  sales: 'Ventas',
  otherIncome: 'Otros ingresos',
  fxGain: 'Ganancia por diferencial cambiario',
  costOfSales: 'Costo de ventas',
  salaries: 'Sueldos y salarios',
  expAguinaldo: 'Aguinaldo',
  expVacaciones: 'Vacaciones',
  expIndemnizacion: 'Indemnización',
  expInss: 'INSS patronal',
  expInatec: 'INATEC',
  taxesExpense: 'Impuestos municipales y cuota fija',
  fxLoss: 'Pérdida por diferencial cambiario',
  generalExpense: 'Gastos generales',
  nonDeductible: 'Gastos no deducibles',
} as const;
export type SystemAccountKey = keyof typeof SYSTEM_ACCOUNTS;
