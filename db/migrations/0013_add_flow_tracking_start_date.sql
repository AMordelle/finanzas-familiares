ALTER TABLE flow_funds ADD COLUMN IF NOT EXISTS tracking_start_date date;
-- Existing flows begin tracking today; this prevents synthetic obligations before formal adoption.
UPDATE flow_funds SET tracking_start_date = current_date WHERE tracking_start_date IS NULL;
ALTER TABLE flow_funds ALTER COLUMN tracking_start_date SET NOT NULL;
ALTER TABLE flow_funds ALTER COLUMN tracking_start_date SET DEFAULT current_date;
-- Safe development reset: only period histories without any reserve allocation are discarded.
DELETE FROM flow_periods p WHERE NOT EXISTS (SELECT 1 FROM flow_allocations a WHERE a.fund_id = p.fund_id);
