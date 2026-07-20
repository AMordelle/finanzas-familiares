-- Atomically resets only generated obligations for a flow without financial activity.
CREATE OR REPLACE FUNCTION reset_empty_flow_tracking(p_household_id uuid, p_flow_id uuid, p_tracking_start_date date)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF p_tracking_start_date IS NULL THEN RAISE EXCEPTION 'invalid_tracking_start_date'; END IF;
  PERFORM 1 FROM flow_funds WHERE id = p_flow_id AND household_id = p_household_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid_flow_fund'; END IF;
  -- Allocations are reserves/activity. A consumed legacy cycle is activity even if allocations were later removed.
  IF EXISTS (SELECT 1 FROM flow_allocations WHERE household_id = p_household_id AND fund_id = p_flow_id)
     OR EXISTS (SELECT 1 FROM flow_cycles WHERE household_id = p_household_id AND fund_id = p_flow_id AND consumed_amount > 0) THEN
    RAISE EXCEPTION 'flow_has_financial_activity';
  END IF;
  UPDATE flow_funds SET tracking_start_date = p_tracking_start_date, updated_at = now()
    WHERE id = p_flow_id AND household_id = p_household_id;
  DELETE FROM flow_periods WHERE household_id = p_household_id AND fund_id = p_flow_id;
END $$;
