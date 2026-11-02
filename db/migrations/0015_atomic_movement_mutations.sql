-- Keep movement lines, their account effects, and the owning group consistent.
-- These functions are invoked only by the server-side service-role client.

CREATE OR REPLACE FUNCTION public.update_movement_atomic(
  p_household_id uuid,
  p_group_id uuid,
  p_description text,
  p_expected_lines jsonb,
  p_next_lines jsonb,
  p_account_deltas jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_stored_line_count integer;
  v_payload_line_count integer;
  v_updated_line_count integer;
  v_account_count integer;
  v_payload_account_count integer;
BEGIN
  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'invalid_movement_description';
  END IF;

  IF jsonb_typeof(p_expected_lines) <> 'array'
     OR jsonb_typeof(p_next_lines) <> 'array'
     OR jsonb_typeof(p_account_deltas) <> 'array' THEN
    RAISE EXCEPTION 'invalid_atomic_movement_payload';
  END IF;

  PERFORM 1
  FROM public.transaction_groups
  WHERE id = p_group_id AND household_id = p_household_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'movement_not_found';
  END IF;

  PERFORM 1
  FROM public.transactions
  WHERE group_id = p_group_id
  ORDER BY id
  FOR UPDATE;

  SELECT count(*) INTO v_stored_line_count
  FROM public.transactions
  WHERE group_id = p_group_id;

  SELECT count(*) INTO v_payload_line_count
  FROM jsonb_to_recordset(p_expected_lines)
    AS expected(id uuid, account_id uuid, type text, category text, subcategory text, amount numeric);

  IF v_stored_line_count = 0 OR v_stored_line_count <> v_payload_line_count THEN
    RAISE EXCEPTION 'movement_changed';
  END IF;

  IF EXISTS (
    SELECT expected.id
    FROM jsonb_to_recordset(p_expected_lines)
      AS expected(id uuid, account_id uuid, type text, category text, subcategory text, amount numeric)
    GROUP BY expected.id
    HAVING count(*) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM public.transactions stored
    LEFT JOIN jsonb_to_recordset(p_expected_lines)
      AS expected(id uuid, account_id uuid, type text, category text, subcategory text, amount numeric)
      ON expected.id = stored.id
    WHERE stored.group_id = p_group_id
      AND (
        expected.id IS NULL
        OR stored.account_id IS DISTINCT FROM expected.account_id
        OR stored.type IS DISTINCT FROM expected.type
        OR stored.category IS DISTINCT FROM expected.category
        OR stored.subcategory IS DISTINCT FROM expected.subcategory
        OR stored.amount IS DISTINCT FROM expected.amount
      )
  ) THEN
    RAISE EXCEPTION 'movement_changed';
  END IF;

  IF (SELECT count(*) FROM jsonb_to_recordset(p_next_lines)
        AS next_line(id uuid, account_id uuid, category text, subcategory text, amount numeric)) <> v_stored_line_count
     OR EXISTS (
       SELECT next_line.id
       FROM jsonb_to_recordset(p_next_lines)
         AS next_line(id uuid, account_id uuid, category text, subcategory text, amount numeric)
       GROUP BY next_line.id
       HAVING count(*) <> 1
     )
     OR EXISTS (
       SELECT 1
       FROM jsonb_to_recordset(p_next_lines)
         AS next_line(id uuid, account_id uuid, category text, subcategory text, amount numeric)
       LEFT JOIN public.transactions stored
         ON stored.id = next_line.id AND stored.group_id = p_group_id
       WHERE stored.id IS NULL
          OR next_line.category IS NULL
          OR next_line.amount IS NULL
          OR next_line.amount <= 0
     ) THEN
    RAISE EXCEPTION 'invalid_next_movement_lines';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_next_lines)
      AS next_line(id uuid, account_id uuid, category text, subcategory text, amount numeric)
    LEFT JOIN public.accounts account
      ON account.id = next_line.account_id AND account.household_id = p_household_id
    WHERE next_line.account_id IS NOT NULL AND account.id IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid_movement_account';
  END IF;

  IF EXISTS (
    SELECT delta.account_id
    FROM jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric)
    GROUP BY delta.account_id
    HAVING count(*) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric)
    WHERE delta.account_id IS NULL OR delta.delta IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid_account_deltas';
  END IF;

  SELECT count(*) INTO v_payload_account_count
  FROM jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric);

  PERFORM 1
  FROM public.accounts account
  JOIN jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric)
    ON delta.account_id = account.id
  WHERE account.household_id = p_household_id
  ORDER BY account.id
  FOR UPDATE OF account;

  SELECT count(*) INTO v_account_count
  FROM public.accounts account
  JOIN jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric)
    ON delta.account_id = account.id
  WHERE account.household_id = p_household_id;

  IF v_account_count <> v_payload_account_count THEN
    RAISE EXCEPTION 'invalid_movement_account';
  END IF;

  UPDATE public.accounts account
  SET balance = account.balance + delta.delta
  FROM jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric)
  WHERE account.id = delta.account_id
    AND account.household_id = p_household_id;

  UPDATE public.transactions stored
  SET account_id = next_line.account_id,
      category = next_line.category,
      subcategory = next_line.subcategory,
      amount = next_line.amount
  FROM jsonb_to_recordset(p_next_lines)
    AS next_line(id uuid, account_id uuid, category text, subcategory text, amount numeric)
  WHERE stored.id = next_line.id
    AND stored.group_id = p_group_id;

  GET DIAGNOSTICS v_updated_line_count = ROW_COUNT;
  IF v_updated_line_count <> v_stored_line_count THEN
    RAISE EXCEPTION 'movement_changed';
  END IF;

  UPDATE public.transaction_groups
  SET note = p_description
  WHERE id = p_group_id AND household_id = p_household_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_movement_atomic(
  p_household_id uuid,
  p_group_id uuid,
  p_expected_lines jsonb,
  p_account_deltas jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_stored_line_count integer;
  v_payload_line_count integer;
  v_account_count integer;
  v_payload_account_count integer;
BEGIN
  IF jsonb_typeof(p_expected_lines) <> 'array'
     OR jsonb_typeof(p_account_deltas) <> 'array' THEN
    RAISE EXCEPTION 'invalid_atomic_movement_payload';
  END IF;

  PERFORM 1
  FROM public.transaction_groups
  WHERE id = p_group_id AND household_id = p_household_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'movement_not_found';
  END IF;

  PERFORM 1
  FROM public.transactions
  WHERE group_id = p_group_id
  ORDER BY id
  FOR UPDATE;

  SELECT count(*) INTO v_stored_line_count
  FROM public.transactions
  WHERE group_id = p_group_id;

  SELECT count(*) INTO v_payload_line_count
  FROM jsonb_to_recordset(p_expected_lines)
    AS expected(id uuid, account_id uuid, type text, category text, subcategory text, amount numeric);

  IF v_stored_line_count = 0 OR v_stored_line_count <> v_payload_line_count
     OR EXISTS (
       SELECT expected.id
       FROM jsonb_to_recordset(p_expected_lines)
         AS expected(id uuid, account_id uuid, type text, category text, subcategory text, amount numeric)
       GROUP BY expected.id
       HAVING count(*) <> 1
     )
     OR EXISTS (
       SELECT 1
       FROM public.transactions stored
       LEFT JOIN jsonb_to_recordset(p_expected_lines)
         AS expected(id uuid, account_id uuid, type text, category text, subcategory text, amount numeric)
         ON expected.id = stored.id
       WHERE stored.group_id = p_group_id
         AND (
           expected.id IS NULL
           OR stored.account_id IS DISTINCT FROM expected.account_id
           OR stored.type IS DISTINCT FROM expected.type
           OR stored.category IS DISTINCT FROM expected.category
           OR stored.subcategory IS DISTINCT FROM expected.subcategory
           OR stored.amount IS DISTINCT FROM expected.amount
         )
     ) THEN
    RAISE EXCEPTION 'movement_changed';
  END IF;

  IF EXISTS (
    SELECT delta.account_id
    FROM jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric)
    GROUP BY delta.account_id
    HAVING count(*) <> 1
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric)
    WHERE delta.account_id IS NULL OR delta.delta IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid_account_deltas';
  END IF;

  SELECT count(*) INTO v_payload_account_count
  FROM jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric);

  PERFORM 1
  FROM public.accounts account
  JOIN jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric)
    ON delta.account_id = account.id
  WHERE account.household_id = p_household_id
  ORDER BY account.id
  FOR UPDATE OF account;

  SELECT count(*) INTO v_account_count
  FROM public.accounts account
  JOIN jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric)
    ON delta.account_id = account.id
  WHERE account.household_id = p_household_id;

  IF v_account_count <> v_payload_account_count THEN
    RAISE EXCEPTION 'invalid_movement_account';
  END IF;

  UPDATE public.accounts account
  SET balance = account.balance + delta.delta
  FROM jsonb_to_recordset(p_account_deltas) AS delta(account_id uuid, delta numeric)
  WHERE account.id = delta.account_id
    AND account.household_id = p_household_id;

  DELETE FROM public.transactions WHERE group_id = p_group_id;
  DELETE FROM public.transaction_groups
  WHERE id = p_group_id AND household_id = p_household_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_movement_atomic(uuid, uuid, text, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_movement_atomic(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_movement_atomic(uuid, uuid, text, jsonb, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_movement_atomic(uuid, uuid, jsonb, jsonb) TO service_role;
