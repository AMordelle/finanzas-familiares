CREATE TABLE IF NOT EXISTS financial_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  opening_total numeric(14, 2) NOT NULL,
  closing_total numeric(14, 2) NOT NULL,
  net_change numeric(14, 2) NOT NULL,
  income_total numeric(14, 2) NOT NULL,
  expense_total numeric(14, 2) NOT NULL,
  net_flow numeric(14, 2) NOT NULL,
  account_snapshots jsonb NOT NULL,
  movement_summary jsonb,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT financial_closures_type_check CHECK (type IN ('weekly', 'monthly')),
  CONSTRAINT financial_closures_period_range_check CHECK (period_start <= period_end)
);

CREATE INDEX IF NOT EXISTS financial_closures_household_period_idx
  ON financial_closures (household_id, period_end DESC, created_at DESC);
