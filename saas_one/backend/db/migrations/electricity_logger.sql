-- =========================================================
-- ELECTRICITY LOGGER MODULE
-- Follows the diesel logger pattern
-- =========================================================

-- ---------------------------------------------------------
-- 1. ELECTRICITY METERS TABLE
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS electricity_meters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,                      -- e.g., "Main Meter", "DG Meter"
  meter_number text,                       -- Physical meter number
  meter_type text DEFAULT 'main',          -- 'main' | 'dg' | 'solar' | 'backup'
  max_load_kw numeric,                     -- Maximum load capacity
  status text DEFAULT 'active',            -- 'active' | 'inactive' | 'faulty'
  last_reading numeric DEFAULT 0,          -- Last recorded reading (kWh)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------
-- 2. ELECTRICITY READINGS TABLE (Daily Logs)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS electricity_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  meter_id uuid NOT NULL REFERENCES electricity_meters(id) ON DELETE CASCADE,
  reading_date date NOT NULL DEFAULT CURRENT_DATE,
  opening_reading numeric NOT NULL,        -- kWh reading at start
  closing_reading numeric NOT NULL,        -- kWh reading at end
  computed_units numeric GENERATED ALWAYS AS (closing_reading - opening_reading) STORED,
  peak_load_kw numeric,                    -- Peak load recorded (optional)
  notes text,
  alert_status text DEFAULT 'normal',      -- 'normal' | 'warning' | 'critical'
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------
-- 3. PERFORMANCE INDEXES
-- ---------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_electricity_meters_property ON electricity_meters(property_id);
CREATE INDEX IF NOT EXISTS idx_electricity_readings_property ON electricity_readings(property_id);
CREATE INDEX IF NOT EXISTS idx_electricity_readings_date ON electricity_readings(reading_date);
CREATE INDEX IF NOT EXISTS idx_electricity_readings_meter ON electricity_readings(meter_id);

-- ---------------------------------------------------------
-- 4. RLS FOR ELECTRICITY METERS
-- ---------------------------------------------------------
ALTER TABLE electricity_meters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS electricity_meters_property_read ON electricity_meters;
CREATE POLICY electricity_meters_property_read ON electricity_meters FOR SELECT USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = electricity_meters.property_id AND pm.is_active)
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = electricity_meters.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS electricity_meters_admin_write ON electricity_meters;
CREATE POLICY electricity_meters_admin_write ON electricity_meters FOR ALL USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = electricity_meters.property_id AND pm.is_active)
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = electricity_meters.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- ---------------------------------------------------------
-- 5. RLS FOR ELECTRICITY READINGS
-- ---------------------------------------------------------
ALTER TABLE electricity_readings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS electricity_readings_property_read ON electricity_readings;
CREATE POLICY electricity_readings_property_read ON electricity_readings FOR SELECT USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = electricity_readings.property_id AND pm.is_active)
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = electricity_readings.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS electricity_readings_staff_insert ON electricity_readings;
CREATE POLICY electricity_readings_staff_insert ON electricity_readings FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = electricity_readings.property_id AND pm.is_active)
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS electricity_readings_admin_update ON electricity_readings;
CREATE POLICY electricity_readings_admin_update ON electricity_readings FOR UPDATE USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = electricity_readings.property_id AND pm.role IN ('property_admin', 'staff', 'mst'))
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = electricity_readings.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);
