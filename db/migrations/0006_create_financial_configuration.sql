ALTER TABLE transactions ADD COLUMN IF NOT EXISTS subcategory text;

CREATE TABLE IF NOT EXISTS financial_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  name text NOT NULL,
  key text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense', 'both')),
  no_projectable boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT financial_categories_household_key_unique UNIQUE (household_id, key),
  CONSTRAINT financial_categories_key_safe CHECK (key ~ '^[a-z0-9_]+$')
);

CREATE TABLE IF NOT EXISTS financial_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  financial_category_id uuid NOT NULL REFERENCES financial_categories(id),
  name text NOT NULL,
  key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT financial_subcategories_category_key_unique UNIQUE (household_id, financial_category_id, key),
  CONSTRAINT financial_subcategories_key_safe CHECK (key ~ '^[a-z0-9_]+$')
);

CREATE TABLE IF NOT EXISTS projection_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  name text NOT NULL,
  key text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT projection_columns_household_key_unique UNIQUE (household_id, key),
  CONSTRAINT projection_columns_key_safe CHECK (key ~ '^[a-z0-9_]+$')
);

CREATE TABLE IF NOT EXISTS projection_column_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES households(id),
  projection_column_id uuid NOT NULL REFERENCES projection_columns(id),
  financial_category_id uuid NOT NULL REFERENCES financial_categories(id),
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT projection_column_categories_assignment_unique UNIQUE (household_id, projection_column_id, financial_category_id)
);

CREATE INDEX IF NOT EXISTS financial_categories_household_active_idx ON financial_categories (household_id, is_active);
CREATE INDEX IF NOT EXISTS financial_categories_household_no_projectable_idx ON financial_categories (household_id, no_projectable);
CREATE INDEX IF NOT EXISTS financial_subcategories_household_category_idx ON financial_subcategories (household_id, financial_category_id, is_active);
CREATE INDEX IF NOT EXISTS projection_columns_household_active_order_idx ON projection_columns (household_id, is_active, display_order);
CREATE INDEX IF NOT EXISTS projection_column_categories_household_category_idx ON projection_column_categories (household_id, financial_category_id);


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

CREATE OR REPLACE FUNCTION prevent_category_multiple_active_projection_columns()
RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM projection_column_categories existing
    JOIN projection_columns existing_column ON existing_column.id = existing.projection_column_id
    JOIN projection_columns new_column ON new_column.id = NEW.projection_column_id
    WHERE existing.household_id = NEW.household_id
      AND existing.financial_category_id = NEW.financial_category_id
      AND existing.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND existing_column.is_active = true
      AND new_column.is_active = true
  ) THEN
    RAISE EXCEPTION 'Esta categoría principal ya alimenta otra columna activa.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projection_column_categories_one_active_column_per_category_trigger ON projection_column_categories;
CREATE TRIGGER projection_column_categories_one_active_column_per_category_trigger
BEFORE INSERT OR UPDATE ON projection_column_categories
FOR EACH ROW EXECUTE FUNCTION prevent_category_multiple_active_projection_columns();


CREATE OR REPLACE FUNCTION prevent_projection_column_activation_duplicates()
RETURNS trigger AS $$
BEGIN
  IF NEW.is_active = true AND (TG_OP = 'INSERT' OR OLD.is_active IS DISTINCT FROM NEW.is_active) THEN
    IF EXISTS (
      SELECT 1
      FROM projection_column_categories own_assignment
      JOIN projection_column_categories other_assignment
        ON other_assignment.household_id = own_assignment.household_id
       AND other_assignment.financial_category_id = own_assignment.financial_category_id
       AND other_assignment.projection_column_id <> own_assignment.projection_column_id
      JOIN projection_columns other_column ON other_column.id = other_assignment.projection_column_id
      WHERE own_assignment.projection_column_id = NEW.id
        AND own_assignment.household_id = NEW.household_id
        AND other_column.is_active = true
    ) THEN
      RAISE EXCEPTION 'Una categoría principal de esta columna ya alimenta otra columna activa.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS projection_columns_activation_duplicates_trigger ON projection_columns;
CREATE TRIGGER projection_columns_activation_duplicates_trigger
BEFORE INSERT OR UPDATE OF is_active ON projection_columns
FOR EACH ROW EXECUTE FUNCTION prevent_projection_column_activation_duplicates();
