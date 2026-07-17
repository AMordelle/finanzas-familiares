CREATE TABLE IF NOT EXISTS flow_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  fund_id uuid NOT NULL REFERENCES flow_funds(id) ON DELETE CASCADE,
  cycle_start date NOT NULL,
  cycle_end date NOT NULL,
  cycle_label text NOT NULL,
  target_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (target_amount >= 0 AND target_amount <> 'NaN'::numeric),
  consumed_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (consumed_amount >= 0 AND consumed_amount <> 'NaN'::numeric),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'covered', 'consuming', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cycle_end >= cycle_start),
  UNIQUE (household_id, fund_id, cycle_start, cycle_end),
  UNIQUE (id, household_id, fund_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS flow_cycles_one_active_per_fund_idx ON flow_cycles(fund_id) WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS flow_cycles_household_idx ON flow_cycles(household_id);

-- Crea deterministicamente el ciclo actual de cada fondo. Además de instalaciones nuevas,
-- esto permite migrar bases locales que ya aplicaron 0008 y tienen asignaciones sin ciclo.
INSERT INTO flow_cycles (household_id, fund_id, cycle_start, cycle_end, cycle_label)
SELECT f.household_id, f.id, bounds.cycle_start, bounds.cycle_end,
       to_char(bounds.cycle_start, 'YYYY-MM-DD') || ' – ' || to_char(bounds.cycle_end, 'YYYY-MM-DD')
FROM flow_funds f
CROSS JOIN LATERAL (
  SELECT
    CASE f.period_type
      WHEN 'weekly' THEN current_date - (extract(isodow FROM current_date)::integer - 1)
      WHEN 'bimonthly' THEN make_date(extract(year FROM current_date)::integer, (extract(month FROM current_date)::integer - 1) / 2 * 2 + 1, 1)
      WHEN 'semiannual' THEN make_date(extract(year FROM current_date)::integer, (extract(month FROM current_date)::integer - 1) / 6 * 6 + 1, 1)
      WHEN 'annual' THEN make_date(extract(year FROM current_date)::integer, 1, 1)
      ELSE date_trunc('month', current_date)::date
    END AS cycle_start,
    CASE f.period_type
      WHEN 'weekly' THEN current_date - (extract(isodow FROM current_date)::integer - 1) + 6
      WHEN 'bimonthly' THEN (make_date(extract(year FROM current_date)::integer, (extract(month FROM current_date)::integer - 1) / 2 * 2 + 1, 1) + interval '2 months - 1 day')::date
      WHEN 'semiannual' THEN (make_date(extract(year FROM current_date)::integer, (extract(month FROM current_date)::integer - 1) / 6 * 6 + 1, 1) + interval '6 months - 1 day')::date
      WHEN 'annual' THEN make_date(extract(year FROM current_date)::integer, 12, 31)
      ELSE (date_trunc('month', current_date) + interval '1 month - 1 day')::date
    END AS cycle_end
) bounds
WHERE NOT EXISTS (SELECT 1 FROM flow_cycles c WHERE c.fund_id = f.id AND c.status <> 'closed')
ON CONFLICT (household_id, fund_id, cycle_start, cycle_end) DO NOTHING;

ALTER TABLE flow_allocations ADD COLUMN IF NOT EXISTS cycle_id uuid;
UPDATE flow_allocations a
SET cycle_id = c.id
FROM flow_cycles c
WHERE a.cycle_id IS NULL AND c.household_id = a.household_id AND c.fund_id = a.fund_id AND c.status <> 'closed';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM flow_allocations WHERE cycle_id IS NULL) THEN
    RAISE EXCEPTION 'No fue posible vincular todas las asignaciones con un ciclo activo';
  END IF;
END $$;

ALTER TABLE flow_allocations ALTER COLUMN cycle_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS flow_allocations_cycle_idx ON flow_allocations(cycle_id);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_id_household_unique ON accounts(id, household_id);
CREATE UNIQUE INDEX IF NOT EXISTS flow_funds_id_household_unique ON flow_funds(id, household_id);
ALTER TABLE flow_cycles
  ADD CONSTRAINT flow_cycles_fund_household_fk
  FOREIGN KEY (fund_id, household_id) REFERENCES flow_funds(id, household_id) ON DELETE CASCADE;
ALTER TABLE flow_allocations
  ADD CONSTRAINT flow_allocations_cycle_household_fund_fk
  FOREIGN KEY (cycle_id, household_id, fund_id) REFERENCES flow_cycles(id, household_id, fund_id) ON DELETE RESTRICT;
ALTER TABLE flow_allocations
  ADD CONSTRAINT flow_allocations_account_household_fk
  FOREIGN KEY (account_id, household_id) REFERENCES accounts(id, household_id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION validate_flow_allocation_cycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM flow_cycles WHERE id = NEW.cycle_id AND household_id = NEW.household_id AND fund_id = NEW.fund_id AND status <> 'closed') THEN
    RAISE EXCEPTION 'invalid_active_flow_cycle';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER flow_allocation_cycle_guard BEFORE INSERT OR UPDATE OF cycle_id, household_id, fund_id ON flow_allocations
  FOR EACH ROW EXECUTE FUNCTION validate_flow_allocation_cycle();

CREATE OR REPLACE FUNCTION validate_flow_allocation_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_consumed numeric; v_assigned_after numeric;
BEGIN
  SELECT consumed_amount INTO v_consumed FROM flow_cycles WHERE id = OLD.cycle_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) - OLD.amount INTO v_assigned_after FROM flow_allocations WHERE cycle_id = OLD.cycle_id;
  IF v_assigned_after < v_consumed THEN RAISE EXCEPTION 'allocation_is_already_consumed'; END IF;
  RETURN OLD;
END $$;
CREATE TRIGGER flow_allocation_delete_guard BEFORE DELETE ON flow_allocations
  FOR EACH ROW EXECUTE FUNCTION validate_flow_allocation_delete();

ALTER TABLE flow_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY flow_cycles_household_members ON flow_cycles FOR ALL
  USING (EXISTS (SELECT 1 FROM household_members hm WHERE hm.household_id = flow_cycles.household_id AND hm.profile_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM household_members hm WHERE hm.household_id = flow_cycles.household_id AND hm.profile_id = auth.uid()));

-- Sustituye la función de 0008: serializa por fondo/cuenta, resuelve el ciclo activo en servidor
-- y nunca acepta cycle_id desde la interfaz.
CREATE OR REPLACE FUNCTION ensure_active_flow_cycle(p_household_id uuid, p_fund_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_cycle_id uuid; v_period text; v_start date; v_end date;
BEGIN
  SELECT period_type INTO v_period FROM flow_funds
    WHERE id = p_fund_id AND household_id = p_household_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_flow_fund'; END IF;
  SELECT id INTO v_cycle_id FROM flow_cycles
    WHERE fund_id = p_fund_id AND household_id = p_household_id AND status <> 'closed' FOR UPDATE;
  IF FOUND THEN RETURN v_cycle_id; END IF;
  v_start := CASE v_period
    WHEN 'weekly' THEN current_date - (extract(isodow FROM current_date)::integer - 1)
    WHEN 'bimonthly' THEN make_date(extract(year FROM current_date)::integer, (extract(month FROM current_date)::integer - 1) / 2 * 2 + 1, 1)
    WHEN 'semiannual' THEN make_date(extract(year FROM current_date)::integer, (extract(month FROM current_date)::integer - 1) / 6 * 6 + 1, 1)
    WHEN 'annual' THEN make_date(extract(year FROM current_date)::integer, 1, 1)
    ELSE date_trunc('month', current_date)::date END;
  v_end := CASE v_period
    WHEN 'weekly' THEN v_start + 6
    WHEN 'bimonthly' THEN (v_start + interval '2 months - 1 day')::date
    WHEN 'semiannual' THEN (v_start + interval '6 months - 1 day')::date
    WHEN 'annual' THEN make_date(extract(year FROM current_date)::integer, 12, 31)
    ELSE (v_start + interval '1 month - 1 day')::date END;
  INSERT INTO flow_cycles(household_id, fund_id, cycle_start, cycle_end, cycle_label)
    VALUES (p_household_id, p_fund_id, v_start, v_end, to_char(v_start, 'YYYY-MM-DD') || ' – ' || to_char(v_end, 'YYYY-MM-DD'))
    RETURNING id INTO v_cycle_id;
  RETURN v_cycle_id;
END $$;

CREATE OR REPLACE FUNCTION create_flow_allocation(p_household_id uuid, p_fund_id uuid, p_account_id uuid, p_amount numeric, p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_balance numeric; v_id uuid; v_cycle_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount = 'NaN'::numeric THEN RAISE EXCEPTION 'amount_must_be_positive'; END IF;
  v_cycle_id := ensure_active_flow_cycle(p_household_id, p_fund_id);
  SELECT balance INTO v_balance FROM accounts
    WHERE id = p_account_id AND household_id = p_household_id AND is_active = true
      AND type IN ('operativa', 'operational_cash') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_liquid_account'; END IF;
  IF COALESCE((SELECT SUM(amount) FROM flow_allocations WHERE household_id = p_household_id AND account_id = p_account_id), 0) + p_amount > v_balance THEN
    RAISE EXCEPTION 'insufficient_unallocated_balance';
  END IF;
  INSERT INTO flow_allocations(household_id, fund_id, cycle_id, account_id, amount, notes)
    VALUES (p_household_id, p_fund_id, v_cycle_id, p_account_id, p_amount, NULLIF(trim(p_notes), '')) RETURNING id INTO v_id;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION update_flow_cycle_consumed(p_household_id uuid, p_cycle_id uuid, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_assigned numeric;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 OR p_amount = 'NaN'::numeric THEN RAISE EXCEPTION 'invalid_consumed_amount'; END IF;
  PERFORM 1 FROM flow_cycles WHERE id = p_cycle_id AND household_id = p_household_id AND status <> 'closed' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_active_flow_cycle'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_assigned FROM flow_allocations
    WHERE household_id = p_household_id AND cycle_id = p_cycle_id;
  IF p_amount > v_assigned THEN RAISE EXCEPTION 'consumed_exceeds_assigned'; END IF;
  UPDATE flow_cycles SET consumed_amount = p_amount, updated_at = now()
    WHERE id = p_cycle_id AND household_id = p_household_id;
END $$;
