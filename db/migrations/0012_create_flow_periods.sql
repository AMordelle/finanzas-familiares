-- Immutable obligation snapshots. Derived balances and statuses are deliberately not persisted.
CREATE TABLE IF NOT EXISTS flow_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES flow_funds(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_label text NOT NULL,
  target_amount numeric(14, 2) NOT NULL CHECK (target_amount >= 0 AND target_amount <> 'NaN'::numeric),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  UNIQUE (household_id, fund_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS flow_periods_fund_start_idx ON flow_periods(fund_id, period_start);
ALTER TABLE flow_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY flow_periods_household_members ON flow_periods FOR ALL
  USING (EXISTS (SELECT 1 FROM household_members hm WHERE hm.household_id = flow_periods.household_id AND hm.profile_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM household_members hm WHERE hm.household_id = flow_periods.household_id AND hm.profile_id = auth.uid()));
