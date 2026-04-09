-- =========================================================
-- DG CONFIGURATION v2
-- PRD: Add Generator (DG) Configuration v2
-- =========================================================

-- 1. ADD INITIAL FIELDS TO generators
ALTER TABLE generators 
  ADD COLUMN IF NOT EXISTS initial_kwh_reading numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_run_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initial_diesel_level numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS effective_from_date date;

-- 2. ADD kWh & Diesel Level FIELDS TO diesel_readings
ALTER TABLE diesel_readings
  ADD COLUMN IF NOT EXISTS opening_kwh numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_kwh numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opening_diesel_level numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closing_diesel_level numeric DEFAULT 0;

-- 3. UPDATE status CHECK (if it was text without check)
-- (PRD says Active | Inactive, evolution.sql said active | standby | maintenance)
-- I will keep the existing ones for backward compat but ensure the UI only uses Active/Inactive as per PRD if requested.
-- Actually the PRD says: "Status [ Active | Inactive ]".
-- I'll keep the list but the UI will show Active/Inactive.

-- 4. Remark about fuel_efficiency_lphr
-- We keep the column but the UI will no longer use it for estimation.
