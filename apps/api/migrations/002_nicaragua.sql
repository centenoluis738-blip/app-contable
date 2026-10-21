-- Adaptación a Nicaragua: córdobas y dólares, IVA 15 %, cuota fija, retenciones IR, nómina e inventario

ALTER TABLE companies
  ALTER COLUMN country SET DEFAULT 'NI',
  ALTER COLUMN currency SET DEFAULT 'NIO',
  ALTER COLUMN default_tax_rate SET DEFAULT 15,
  ALTER COLUMN tax_regime SET DEFAULT 'cuota_fija',
  ADD COLUMN fixed_fee numeric(14,2) NOT NULL DEFAULT 0,          -- cuota fija mensual asignada por la DGI
  ADD COLUMN imi_rate numeric(5,2) NOT NULL DEFAULT 1,            -- Impuesto Municipal sobre Ingresos
  ADD COLUMN pmd_rate numeric(5,2) NOT NULL DEFAULT 1,            -- Pago mínimo definitivo / anticipo IR (régimen general)
  ADD COLUMN municipality text,
  ADD COLUMN invoice_authorization text;                          -- autorización de la DGI / pie de imprenta
UPDATE companies SET tax_regime = 'general' WHERE tax_regime IS NULL OR tax_regime NOT IN ('cuota_fija','general');
ALTER TABLE companies ADD CONSTRAINT companies_tax_regime_chk CHECK (tax_regime IN ('cuota_fija','general'));

-- Tipo de cambio oficial (BCN) por empresa y fecha: córdobas por unidad de moneda extranjera
CREATE TABLE exchange_rates (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  currency   char(3) NOT NULL,
  date       date NOT NULL,
  rate       numeric(14,4) NOT NULL CHECK (rate > 0),
  PRIMARY KEY (company_id, currency, date)
);

ALTER TABLE contacts
  ADD COLUMN tax_regime text NOT NULL DEFAULT 'consumidor_final' CHECK (tax_regime IN ('consumidor_final','cuota_fija','general')),
  ADD COLUMN is_state boolean NOT NULL DEFAULT false;

ALTER TABLE products
  ADD COLUMN tax_code text NOT NULL DEFAULT 'IVA15' CHECK (tax_code IN ('IVA15','IVA0','EXENTO')),
  ADD COLUMN avg_cost numeric(14,4) NOT NULL DEFAULT 0;

ALTER TABLE invoices
  ADD COLUMN exchange_rate numeric(14,4) NOT NULL DEFAULT 1,
  ADD COLUMN withholding_type text NOT NULL DEFAULT 'ninguna',
  ADD COLUMN withholding_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN withholding_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE invoice_lines
  ADD COLUMN tax_code text NOT NULL DEFAULT 'IVA15' CHECK (tax_code IN ('IVA15','IVA0','EXENTO')),
  ADD COLUMN unit_cost numeric(14,4) NOT NULL DEFAULT 0;

ALTER TABLE payments
  ADD COLUMN withheld numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN exchange_rate numeric(14,4) NOT NULL DEFAULT 1;
ALTER TABLE payments DROP CONSTRAINT payments_amount_check;
ALTER TABLE payments ADD CONSTRAINT payments_amount_check CHECK (amount > 0 AND withheld >= 0 AND withheld < amount);

ALTER TABLE expenses
  ADD COLUMN tax_code text NOT NULL DEFAULT 'IVA15' CHECK (tax_code IN ('IVA15','IVA0','EXENTO')),
  ADD COLUMN currency char(3) NOT NULL DEFAULT 'NIO',
  ADD COLUMN exchange_rate numeric(14,4) NOT NULL DEFAULT 1,
  ADD COLUMN deductible boolean NOT NULL DEFAULT true;

-- Entradas de inventario (compras de mercadería) para el costo promedio
CREATE TABLE inventory_moves (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  date       date NOT NULL,
  kind       text NOT NULL CHECK (kind IN ('in','out','void')),
  quantity   numeric(14,3) NOT NULL,
  unit_cost  numeric(14,4) NOT NULL,
  source_type text NOT NULL,
  source_id  uuid,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Nómina
CREATE TABLE employees (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name           text NOT NULL,
  id_number      text,            -- cédula
  inss_number    text,
  position       text,
  monthly_salary numeric(14,2) NOT NULL CHECK (monthly_salary > 0),
  start_date     date NOT NULL,
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payroll_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  month       char(7) NOT NULL,
  date        date NOT NULL,
  employees   integer NOT NULL,
  totals      jsonb NOT NULL,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, month)
);

CREATE TABLE payroll_lines (
  run_id         uuid NOT NULL REFERENCES payroll_runs(id) ON DELETE CASCADE,
  employee_id    uuid NOT NULL REFERENCES employees(id),
  gross          numeric(14,2) NOT NULL,
  inss_employee  numeric(14,2) NOT NULL,
  ir             numeric(14,2) NOT NULL,
  net            numeric(14,2) NOT NULL,
  inss_employer  numeric(14,2) NOT NULL,
  inatec         numeric(14,2) NOT NULL,
  aguinaldo      numeric(14,2) NOT NULL,
  vacaciones     numeric(14,2) NOT NULL,
  indemnizacion  numeric(14,2) NOT NULL,
  PRIMARY KEY (run_id, employee_id)
);

-- Liquidación mensual de impuestos (una por empresa y mes)
CREATE TABLE tax_settlements (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  month      char(7) NOT NULL,
  summary    jsonb NOT NULL,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, month)
);
