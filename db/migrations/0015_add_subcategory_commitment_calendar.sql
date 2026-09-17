-- A financial subcategory is the commitment.  Calendar data intentionally lives
-- here; no duplicate commitments table is introduced.
ALTER TABLE financial_subcategories
  ADD COLUMN IF NOT EXISTS calendar_day integer,
  ADD COLUMN IF NOT EXISTS calendar_month integer;

ALTER TABLE financial_subcategories
  DROP CONSTRAINT IF EXISTS financial_subcategories_calendar_day_check,
  ADD CONSTRAINT financial_subcategories_calendar_day_check
    CHECK (calendar_day IS NULL OR calendar_day BETWEEN 1 AND 31);
ALTER TABLE financial_subcategories
  DROP CONSTRAINT IF EXISTS financial_subcategories_calendar_month_check,
  ADD CONSTRAINT financial_subcategories_calendar_month_check
    CHECK (calendar_month IS NULL OR calendar_month BETWEEN 1 AND 12);

-- A period can now be the immutable snapshot of one subcategory's scheduled
-- commitment. Existing aggregate snapshots remain valid and keep NULL here.
ALTER TABLE flow_periods ADD COLUMN IF NOT EXISTS financial_subcategory_id uuid
  REFERENCES financial_subcategories(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS flow_periods_subcategory_due_idx
  ON flow_periods (household_id, financial_subcategory_id, period_start);
CREATE UNIQUE INDEX IF NOT EXISTS flow_periods_subcategory_due_unique
  ON flow_periods (household_id, financial_subcategory_id, period_start)
  WHERE financial_subcategory_id IS NOT NULL;
