-- Configuration only: targets are derived at read time and are never persisted.
ALTER TABLE flow_funds
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'calculated'
    CHECK (target_type IN ('calculated', 'manual')),
  ADD COLUMN IF NOT EXISTS manual_target_amount numeric(14, 2)
    CHECK (manual_target_amount IS NULL OR manual_target_amount >= 0);

ALTER TABLE financial_subcategories
  ADD COLUMN IF NOT EXISTS planned_amount numeric(14, 2)
    CHECK (planned_amount IS NULL OR planned_amount >= 0),
  ADD COLUMN IF NOT EXISTS planned_period_type text
    CHECK (planned_period_type IN ('weekly', 'monthly', 'bimonthly', 'semiannual', 'annual')),
  ADD COLUMN IF NOT EXISTS flow_fund_id uuid REFERENCES flow_funds(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS financial_subcategories_flow_fund_idx
  ON financial_subcategories(flow_fund_id);
