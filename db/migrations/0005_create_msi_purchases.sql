CREATE TABLE IF NOT EXISTS msi_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  description text NOT NULL,
  category text NOT NULL,
  total_amount numeric(14,2) NOT NULL,
  months integer NOT NULL,
  monthly_amount numeric(14,2) NOT NULL,
  purchase_date timestamp NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT msi_purchases_total_amount_check CHECK (total_amount > 0),
  CONSTRAINT msi_purchases_months_check CHECK (months > 1),
  CONSTRAINT msi_purchases_monthly_amount_check CHECK (monthly_amount > 0),
  CONSTRAINT msi_purchases_status_check CHECK (status IN ('active', 'completed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS msi_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  msi_purchase_id uuid NOT NULL REFERENCES msi_purchases(id) ON DELETE CASCADE,
  installment_number integer NOT NULL,
  amount numeric(14,2) NOT NULL,
  due_date date,
  status text NOT NULL DEFAULT 'pending',
  paid_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT msi_installments_installment_number_check CHECK (installment_number > 0),
  CONSTRAINT msi_installments_amount_check CHECK (amount > 0),
  CONSTRAINT msi_installments_status_check CHECK (status IN ('pending', 'paid')),
  CONSTRAINT msi_installments_purchase_number_unique UNIQUE (msi_purchase_id, installment_number)
);

CREATE INDEX IF NOT EXISTS msi_purchases_household_status_idx ON msi_purchases (household_id, status);
CREATE INDEX IF NOT EXISTS msi_installments_purchase_status_idx ON msi_installments (msi_purchase_id, status);
