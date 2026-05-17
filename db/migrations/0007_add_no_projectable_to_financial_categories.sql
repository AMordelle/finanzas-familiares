ALTER TABLE financial_categories
  ADD COLUMN IF NOT EXISTS no_projectable boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS financial_categories_household_no_projectable_idx ON financial_categories (household_id, no_projectable);

CREATE OR REPLACE FUNCTION prevent_no_projectable_projection_assignment()
RETURNS trigger AS $$
DECLARE
  blocked boolean;
BEGIN
  SELECT COALESCE(category.no_projectable, false) INTO blocked
  FROM financial_categories category
  WHERE category.id = NEW.financial_category_id
    AND category.household_id = NEW.household_id;

  IF blocked THEN
    RAISE EXCEPTION 'Las categorías excluidas de Proyección no pueden asignarse a columnas activas.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projection_column_categories_no_projectable_trigger ON projection_column_categories;
CREATE TRIGGER projection_column_categories_no_projectable_trigger
BEFORE INSERT OR UPDATE ON projection_column_categories
FOR EACH ROW EXECUTE FUNCTION prevent_no_projectable_projection_assignment();
