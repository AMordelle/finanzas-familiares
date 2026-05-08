CREATE TABLE IF NOT EXISTS extra_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  work_date date NOT NULL,
  type text NOT NULL CHECK (type IN ('overtime', 'piecework', 'meals')),
  quantity numeric(10, 2) NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at timestamp,
  notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extra_work_entries_household_status_work_date_idx
  ON extra_work_entries (household_id, status, work_date DESC, created_at DESC);
