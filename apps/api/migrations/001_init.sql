-- Esquema inicial de la app contable
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE companies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  tax_id              text,
  country             char(2) NOT NULL DEFAULT 'MX',
  currency            char(3) NOT NULL DEFAULT 'MXN',
  tax_regime          text,
  default_tax_rate    numeric(5,2) NOT NULL DEFAULT 16,
  address             text,
  email               text,
  phone               text,
  invoice_series      text NOT NULL DEFAULT 'A',
  next_invoice_number integer NOT NULL DEFAULT 1,
  -- Ningún asiento puede tener fecha igual o anterior a esta (período cerrado)
  locked_until        date,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('owner','accountant','employee','viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE accounts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code       text NOT NULL,
  name       text NOT NULL,
  type       text NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
  parent_id  uuid REFERENCES accounts(id),
  system_key text,
  is_active  boolean NOT NULL DEFAULT true,
  UNIQUE (company_id, code),
  UNIQUE (company_id, system_key)
);

CREATE TABLE contacts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('customer','supplier','both')),
  name       text NOT NULL,
  tax_id     text,
  email      text,
  phone      text,
  address    text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_company_idx ON contacts(company_id, name);

CREATE TABLE products (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind       text NOT NULL DEFAULT 'service' CHECK (kind IN ('product','service')),
  name       text NOT NULL,
  sku        text,
  price      numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate   numeric(5,2) NOT NULL DEFAULT 0,
  track_stock boolean NOT NULL DEFAULT false,
  stock      numeric(14,3) NOT NULL DEFAULT 0,
  income_account_id uuid REFERENCES accounts(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE journal_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  number      integer NOT NULL,
  date        date NOT NULL,
  description text NOT NULL,
  source_type text NOT NULL DEFAULT 'manual',
  source_id   uuid,
  reverses_id uuid REFERENCES journal_entries(id),
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, number)
);
CREATE INDEX journal_entries_company_date_idx ON journal_entries(company_id, date);

CREATE TABLE journal_lines (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id   uuid NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES accounts(id),
  description text,
  debit      numeric(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit     numeric(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK (debit = 0 OR credit = 0)
);
CREATE INDEX journal_lines_account_idx ON journal_lines(account_id);

-- Los asientos son inalterables: se corrigen con contraasientos.
CREATE FUNCTION forbid_journal_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Los asientos contables no se pueden modificar ni borrar; registra un contraasiento';
END $$ LANGUAGE plpgsql;
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON journal_entries
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION forbid_journal_change();
CREATE TRIGGER journal_lines_immutable BEFORE UPDATE OR DELETE ON journal_lines
  FOR EACH ROW WHEN (pg_trigger_depth() = 0) EXECUTE FUNCTION forbid_journal_change();

CREATE TABLE invoices (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id   uuid NOT NULL REFERENCES contacts(id),
  series       text NOT NULL,
  number       integer,
  issue_date   date NOT NULL,
  due_date     date,
  status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partial','paid','void')),
  currency     char(3) NOT NULL,
  subtotal     numeric(14,2) NOT NULL DEFAULT 0,
  tax_total    numeric(14,2) NOT NULL DEFAULT 0,
  total        numeric(14,2) NOT NULL DEFAULT 0,
  amount_paid  numeric(14,2) NOT NULL DEFAULT 0,
  notes        text,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_by   uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, series, number)
);

CREATE TABLE invoice_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  position    integer NOT NULL,
  product_id  uuid REFERENCES products(id),
  description text NOT NULL,
  quantity    numeric(14,3) NOT NULL,
  unit_price  numeric(14,2) NOT NULL,
  discount    numeric(5,2) NOT NULL DEFAULT 0,
  tax_rate    numeric(5,2) NOT NULL DEFAULT 0,
  subtotal    numeric(14,2) NOT NULL,
  tax         numeric(14,2) NOT NULL,
  total       numeric(14,2) NOT NULL
);

CREATE TABLE payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id  uuid NOT NULL REFERENCES invoices(id),
  date        date NOT NULL,
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  method      text NOT NULL DEFAULT 'transfer',
  reference   text,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expenses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES contacts(id),
  account_id  uuid NOT NULL REFERENCES accounts(id),
  date        date NOT NULL,
  description text NOT NULL,
  reference   text,
  subtotal    numeric(14,2) NOT NULL,
  tax_rate    numeric(5,2) NOT NULL DEFAULT 0,
  tax         numeric(14,2) NOT NULL DEFAULT 0,
  total       numeric(14,2) NOT NULL,
  status      text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid','void')),
  paid_date   date,
  receipt_path text,
  journal_entry_id uuid REFERENCES journal_entries(id),
  payment_entry_id uuid REFERENCES journal_entries(id),
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bank_transactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  date         date NOT NULL,
  description  text NOT NULL,
  amount       numeric(14,2) NOT NULL,
  reference    text,
  import_batch uuid NOT NULL,
  matched_type text CHECK (matched_type IN ('invoice','expense','account')),
  matched_id   uuid,
  journal_entry_id uuid REFERENCES journal_entries(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bank_tx_company_idx ON bank_transactions(company_id, date);

CREATE TABLE audit_log (
  id         bigserial PRIMARY KEY,
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
  user_id    uuid REFERENCES users(id),
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  data       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE support_tickets (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text NOT NULL,
  subject    text NOT NULL,
  message    text NOT NULL,
  category   text,
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  user_id    uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
