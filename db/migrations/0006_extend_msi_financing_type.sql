-- Extend MSI control to cover both interest-free and interest-bearing purchases.
-- Compatibility decision: keep the legacy total_amount column as the canonical
-- total financed amount. For existing MSI rows this equals the original amount.
ALTER TABLE msi_purchases
  ADD COLUMN IF NOT EXISTS financing_type text,
  ADD COLUMN IF NOT EXISTS original_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS total_financed_amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS interest_cost numeric(14,2);

UPDATE msi_purchases
SET
  financing_type = COALESCE(financing_type, 'interest_free'),
  original_amount = COALESCE(original_amount, total_amount),
  total_financed_amount = COALESCE(total_financed_amount, total_amount),
  interest_cost = COALESCE(interest_cost, 0)
WHERE financing_type IS NULL
   OR original_amount IS NULL
   OR total_financed_amount IS NULL
   OR interest_cost IS NULL;

ALTER TABLE msi_purchases
  ALTER COLUMN financing_type SET DEFAULT 'interest_free',
  ALTER COLUMN financing_type SET NOT NULL,
  ALTER COLUMN original_amount SET NOT NULL,
  ALTER COLUMN total_financed_amount SET NOT NULL,
  ALTER COLUMN interest_cost SET NOT NULL;

ALTER TABLE msi_purchases
  ADD CONSTRAINT msi_purchases_financing_type_check CHECK (financing_type IN ('interest_free', 'interest_bearing')),
  ADD CONSTRAINT msi_purchases_original_amount_check CHECK (original_amount > 0),
  ADD CONSTRAINT msi_purchases_total_financed_amount_check CHECK (total_financed_amount > 0),
  ADD CONSTRAINT msi_purchases_interest_cost_check CHECK (interest_cost >= 0);

COMMENT ON COLUMN msi_purchases.total_amount IS 'Legacy compatibility column; stores the total financed amount. Use total_financed_amount for new code.';
