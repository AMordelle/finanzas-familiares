CREATE TABLE IF NOT EXISTS flow_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  period_type text NOT NULL,
  priority integer NOT NULL CHECK (priority > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, code)
);

CREATE TABLE IF NOT EXISTS flow_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES flow_funds(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  amount numeric(14, 2) NOT NULL CHECK (amount > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX flow_funds_household_idx ON flow_funds(household_id);
CREATE INDEX flow_allocations_household_idx ON flow_allocations(household_id);
CREATE INDEX flow_allocations_fund_idx ON flow_allocations(fund_id);
CREATE INDEX flow_allocations_account_idx ON flow_allocations(account_id);

ALTER TABLE flow_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY flow_funds_household_members ON flow_funds FOR ALL
  USING (EXISTS (SELECT 1 FROM household_members hm WHERE hm.household_id = flow_funds.household_id AND hm.profile_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM household_members hm WHERE hm.household_id = flow_funds.household_id AND hm.profile_id = auth.uid()));
CREATE POLICY flow_allocations_household_members ON flow_allocations FOR ALL
  USING (EXISTS (SELECT 1 FROM household_members hm WHERE hm.household_id = flow_allocations.household_id AND hm.profile_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM household_members hm WHERE hm.household_id = flow_allocations.household_id AND hm.profile_id = auth.uid()));

-- Serializa asignaciones por cuenta para que dos solicitudes concurrentes no puedan sobregirar el saldo virtual.
CREATE OR REPLACE FUNCTION create_flow_allocation(p_household_id uuid, p_fund_id uuid, p_account_id uuid, p_amount numeric, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_balance numeric; v_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;
  SELECT balance INTO v_balance FROM accounts
    WHERE id = p_account_id AND household_id = p_household_id AND is_active = true
      AND type IN ('operativa', 'operational_cash') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_liquid_account'; END IF;
  IF NOT EXISTS (SELECT 1 FROM flow_funds WHERE id = p_fund_id AND household_id = p_household_id AND is_active = true) THEN
    RAISE EXCEPTION 'invalid_flow_fund';
  END IF;
  IF COALESCE((SELECT SUM(amount) FROM flow_allocations WHERE household_id = p_household_id AND account_id = p_account_id), 0) + p_amount > v_balance THEN
    RAISE EXCEPTION 'insufficient_unallocated_balance';
  END IF;
  INSERT INTO flow_allocations(household_id, fund_id, account_id, amount, notes)
    VALUES (p_household_id, p_fund_id, p_account_id, p_amount, NULLIF(trim(p_notes), '')) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
