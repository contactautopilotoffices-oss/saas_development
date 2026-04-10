-- =========================================================
-- UTILITIES LOGGING & ANALYTICS v2
-- Database Schema Migration (For Existing Tables)
-- PRD: Utilities Logging & Analytics v2 (FINAL)
-- =========================================================

-- ---------------------------------------------------------
-- 1. METER MULTIPLIERS TABLE (Time-Versioned)
-- References existing electricity_meters table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS meter_multipliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meter_id uuid NOT NULL REFERENCES electricity_meters(id) ON DELETE CASCADE,
  
  -- Factor Components
  ct_ratio_primary numeric NOT NULL DEFAULT 200,
  ct_ratio_secondary numeric NOT NULL DEFAULT 5,
  pt_ratio_primary numeric NOT NULL DEFAULT 11000,
  pt_ratio_secondary numeric NOT NULL DEFAULT 110,
  meter_constant numeric NOT NULL DEFAULT 1.0,
  
  -- Computed Multiplier Value
  multiplier_value numeric GENERATED ALWAYS AS (
    (ct_ratio_primary / NULLIF(ct_ratio_secondary, 0)) *
    (pt_ratio_primary / NULLIF(pt_ratio_secondary, 0)) *
    meter_constant
  ) STORED,
  
  -- Time Versioning
  effective_from date NOT NULL,
  effective_to date,
  reason text,
  
  -- Audit
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_meter_multipliers_lookup 
  ON meter_multipliers(meter_id, effective_from DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_meter_multipliers_unique_start
  ON meter_multipliers(meter_id, effective_from);

-- ---------------------------------------------------------
-- 2. GRID TARIFFS TABLE (Time-Versioned)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS grid_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  
  utility_provider text,
  rate_per_unit numeric NOT NULL,
  unit_type text DEFAULT 'kVAh' CHECK (unit_type = 'kVAh'),
  
  effective_from date NOT NULL,
  effective_to date,
  
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grid_tariffs_lookup 
  ON grid_tariffs(property_id, effective_from DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_grid_tariffs_unique_start
  ON grid_tariffs(property_id, effective_from);

-- ---------------------------------------------------------
-- 3. DG TARIFFS TABLE (References 'generators' table)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dg_tariffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generator_id uuid NOT NULL REFERENCES generators(id) ON DELETE CASCADE,
  
  cost_per_litre numeric NOT NULL,
  
  effective_from date NOT NULL,
  effective_to date,
  
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dg_tariffs_lookup 
  ON dg_tariffs(generator_id, effective_from DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dg_tariffs_unique_start
  ON dg_tariffs(generator_id, effective_from);

-- ---------------------------------------------------------
-- 4. OVERLAP PREVENTION TRIGGERS
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION check_multiplier_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM meter_multipliers
    WHERE meter_id = NEW.meter_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND NEW.effective_from <= COALESCE(effective_to, '9999-12-31'::date)
    AND COALESCE(NEW.effective_to, '9999-12-31'::date) >= effective_from
  ) THEN
    RAISE EXCEPTION 'Overlapping multiplier periods not allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_multiplier_overlap ON meter_multipliers;
CREATE TRIGGER trg_check_multiplier_overlap
  BEFORE INSERT OR UPDATE ON meter_multipliers
  FOR EACH ROW EXECUTE FUNCTION check_multiplier_overlap();

CREATE OR REPLACE FUNCTION check_grid_tariff_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM grid_tariffs
    WHERE property_id = NEW.property_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND NEW.effective_from <= COALESCE(effective_to, '9999-12-31'::date)
    AND COALESCE(NEW.effective_to, '9999-12-31'::date) >= effective_from
  ) THEN
    RAISE EXCEPTION 'Overlapping tariff periods not allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_grid_tariff_overlap ON grid_tariffs;
CREATE TRIGGER trg_check_grid_tariff_overlap
  BEFORE INSERT OR UPDATE ON grid_tariffs
  FOR EACH ROW EXECUTE FUNCTION check_grid_tariff_overlap();

CREATE OR REPLACE FUNCTION check_dg_tariff_overlap()
RETURNS TRIGGER AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM dg_tariffs
    WHERE generator_id = NEW.generator_id
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND NEW.effective_from <= COALESCE(effective_to, '9999-12-31'::date)
    AND COALESCE(NEW.effective_to, '9999-12-31'::date) >= effective_from
  ) THEN
    RAISE EXCEPTION 'Overlapping tariff periods not allowed';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_dg_tariff_overlap ON dg_tariffs;
CREATE TRIGGER trg_check_dg_tariff_overlap
  BEFORE INSERT OR UPDATE ON dg_tariffs
  FOR EACH ROW EXECUTE FUNCTION check_dg_tariff_overlap();

-- ---------------------------------------------------------
-- 5. ADD COLUMNS TO electricity_readings
-- ---------------------------------------------------------
ALTER TABLE electricity_readings 
  ADD COLUMN IF NOT EXISTS multiplier_id uuid REFERENCES meter_multipliers(id);

ALTER TABLE electricity_readings 
  ADD COLUMN IF NOT EXISTS multiplier_value_used numeric;

ALTER TABLE electricity_readings 
  ADD COLUMN IF NOT EXISTS tariff_id uuid REFERENCES grid_tariffs(id);

ALTER TABLE electricity_readings 
  ADD COLUMN IF NOT EXISTS tariff_rate_used numeric;

ALTER TABLE electricity_readings 
  ADD COLUMN IF NOT EXISTS final_units numeric;

ALTER TABLE electricity_readings 
  ADD COLUMN IF NOT EXISTS computed_cost numeric;

-- ---------------------------------------------------------
-- 6. ADD COLUMNS TO diesel_readings
-- ---------------------------------------------------------
ALTER TABLE diesel_readings 
  ADD COLUMN IF NOT EXISTS tariff_id uuid REFERENCES dg_tariffs(id);

ALTER TABLE diesel_readings 
  ADD COLUMN IF NOT EXISTS tariff_rate_used numeric;

ALTER TABLE diesel_readings 
  ADD COLUMN IF NOT EXISTS computed_cost numeric;

-- ---------------------------------------------------------
-- 7. RLS POLICIES
-- ---------------------------------------------------------
ALTER TABLE meter_multipliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE grid_tariffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE dg_tariffs ENABLE ROW LEVEL SECURITY;

-- Meter Multipliers: All property members can read/write
DROP POLICY IF EXISTS meter_multipliers_policy ON meter_multipliers;
CREATE POLICY meter_multipliers_policy ON meter_multipliers FOR ALL USING (
  EXISTS(
    SELECT 1 FROM electricity_meters em
    JOIN property_memberships pm ON pm.property_id = em.property_id
    WHERE em.id = meter_multipliers.meter_id 
    AND pm.user_id = auth.uid() 
    AND pm.is_active
  )
);

-- Grid Tariffs: Property members can read, admins can write
DROP POLICY IF EXISTS grid_tariffs_read ON grid_tariffs;
CREATE POLICY grid_tariffs_read ON grid_tariffs FOR SELECT USING (
  EXISTS(
    SELECT 1 FROM property_memberships pm 
    WHERE pm.property_id = grid_tariffs.property_id 
    AND pm.user_id = auth.uid() 
    AND pm.is_active
  )
);

DROP POLICY IF EXISTS grid_tariffs_write ON grid_tariffs;
CREATE POLICY grid_tariffs_write ON grid_tariffs FOR ALL USING (
  EXISTS(
    SELECT 1 FROM property_memberships pm 
    WHERE pm.property_id = grid_tariffs.property_id 
    AND pm.user_id = auth.uid() 
    AND pm.is_active
    AND pm.role IN ('property_admin', 'staff')
  )
);

-- DG Tariffs: Property members can read, admins can write
DROP POLICY IF EXISTS dg_tariffs_read ON dg_tariffs;
CREATE POLICY dg_tariffs_read ON dg_tariffs FOR SELECT USING (
  EXISTS(
    SELECT 1 FROM generators g
    JOIN property_memberships pm ON pm.property_id = g.property_id
    WHERE g.id = dg_tariffs.generator_id 
    AND pm.user_id = auth.uid() 
    AND pm.is_active
  )
);

DROP POLICY IF EXISTS dg_tariffs_write ON dg_tariffs;
CREATE POLICY dg_tariffs_write ON dg_tariffs FOR ALL USING (
  EXISTS(
    SELECT 1 FROM generators g
    JOIN property_memberships pm ON pm.property_id = g.property_id
    WHERE g.id = dg_tariffs.generator_id 
    AND pm.user_id = auth.uid() 
    AND pm.is_active
    AND pm.role IN ('property_admin', 'staff')
  )
);

-- ---------------------------------------------------------
-- 8. HELPER FUNCTIONS
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION get_active_multiplier(
  p_meter_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  id uuid,
  multiplier_value numeric,
  ct_ratio_primary numeric,
  ct_ratio_secondary numeric,
  pt_ratio_primary numeric,
  pt_ratio_secondary numeric,
  meter_constant numeric,
  effective_from date
)
LANGUAGE sql STABLE
AS $$
  SELECT 
    mm.id,
    mm.multiplier_value,
    mm.ct_ratio_primary,
    mm.ct_ratio_secondary,
    mm.pt_ratio_primary,
    mm.pt_ratio_secondary,
    mm.meter_constant,
    mm.effective_from
  FROM meter_multipliers mm
  WHERE mm.meter_id = p_meter_id
    AND mm.effective_from <= p_date
    AND (mm.effective_to IS NULL OR mm.effective_to >= p_date)
  ORDER BY mm.effective_from DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_active_grid_tariff(
  p_property_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  id uuid,
  rate_per_unit numeric,
  utility_provider text,
  effective_from date
)
LANGUAGE sql STABLE
AS $$
  SELECT 
    gt.id,
    gt.rate_per_unit,
    gt.utility_provider,
    gt.effective_from
  FROM grid_tariffs gt
  WHERE gt.property_id = p_property_id
    AND gt.effective_from <= p_date
    AND (gt.effective_to IS NULL OR gt.effective_to >= p_date)
  ORDER BY gt.effective_from DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_active_dg_tariff(
  p_generator_id uuid,
  p_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  id uuid,
  cost_per_litre numeric,
  effective_from date
)
LANGUAGE sql STABLE
AS $$
  SELECT 
    dt.id,
    dt.cost_per_litre,
    dt.effective_from
  FROM dg_tariffs dt
  WHERE dt.generator_id = p_generator_id
    AND dt.effective_from <= p_date
    AND (dt.effective_to IS NULL OR dt.effective_to >= p_date)
  ORDER BY dt.effective_from DESC
  LIMIT 1;
$$;

-- =========================================================
-- END OF MIGRATION
-- =========================================================
