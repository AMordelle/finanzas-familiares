ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS projection_type text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_projection_type_check'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_projection_type_check
      CHECK (projection_type IS NULL OR projection_type IN ('recurrent', 'extraordinary', 'internal', 'ignore', 'debt_payment'));
  END IF;
END $$;
