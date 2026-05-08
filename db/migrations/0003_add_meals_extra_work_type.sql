ALTER TABLE extra_work_entries
  DROP CONSTRAINT IF EXISTS extra_work_entries_type_check;

ALTER TABLE extra_work_entries
  ADD CONSTRAINT extra_work_entries_type_check
  CHECK (type IN ('overtime', 'piecework', 'meals'));
