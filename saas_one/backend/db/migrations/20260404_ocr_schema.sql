-- =========================================================
-- ELECTRICITY OCR MODULE SCHEMA
-- =========================================================

-- 1. EXTEND ELECTRICITY READINGS TABLE
ALTER TABLE electricity_readings 
ADD COLUMN IF NOT EXISTS photo_url text,
ADD COLUMN IF NOT EXISTS ocr_reading numeric,
ADD COLUMN IF NOT EXISTS ocr_confidence numeric,
ADD COLUMN IF NOT EXISTS ocr_status text DEFAULT 'verified', -- 'pending' | 'verified' | 'mismatch' | 'review' | 'retake'
ADD COLUMN IF NOT EXISTS ocr_unit_detected text, -- 'kWh' | 'kVAh'
ADD COLUMN IF NOT EXISTS ocr_raw_response jsonb;

-- 1.1. ADD DEFAULT POWER FACTOR TO METERS
ALTER TABLE electricity_meters
ADD COLUMN IF NOT EXISTS default_power_factor numeric DEFAULT 0.95;

-- 2. CREATE OCR AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS ocr_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
    reading_id uuid REFERENCES electricity_readings(id) ON DELETE CASCADE,
    event_type text NOT NULL, -- 'process_start' | 'process_success' | 'process_failure' | 'manual_override'
    payload jsonb,
    created_at timestamptz DEFAULT now()
);

-- 3. STORAGE SETUP
INSERT INTO storage.buckets (id, name, public)
VALUES ('meter-readings', 'meter-readings', true)
ON CONFLICT (id) DO NOTHING;

-- 3.1. allow authenticated users to upload photos to 'meter-readings' bucket
DROP POLICY IF EXISTS "Allow authenticated uploads to meter-readings" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to meter-readings" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'meter-readings');

-- 3.2. allow public viewing of photos in 'meter-readings' bucket
DROP POLICY IF EXISTS "Allow public viewing of meter-readings" ON storage.objects;
CREATE POLICY "Allow public viewing of meter-readings" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'meter-readings');

-- 4. RLS FOR OCR AUDIT LOGS
ALTER TABLE ocr_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ocr_audit_logs_read ON ocr_audit_logs;
CREATE POLICY ocr_audit_logs_read ON ocr_audit_logs FOR SELECT USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = ocr_audit_logs.property_id AND pm.is_active)
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = ocr_audit_logs.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS ocr_audit_logs_insert ON ocr_audit_logs;
CREATE POLICY ocr_audit_logs_insert ON ocr_audit_logs FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = ocr_audit_logs.property_id AND pm.is_active)
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- 5. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_ocr_audit_logs_reading ON ocr_audit_logs(reading_id);
CREATE INDEX IF NOT EXISTS idx_electricity_readings_ocr_status ON electricity_readings(ocr_status);

-- 6. UNIQUE CONSTRAINT FOR UPSERT (OCR -> MANUAL SYNC)
-- This facilitates the transition from OCR shadow readings to final manual entries
ALTER TABLE electricity_readings 
DROP CONSTRAINT IF EXISTS unique_meter_reading_date;

-- Cleanup duplicates if any exist before adding constraint
-- (Keeps the newest record for each meter/day pair)
DELETE FROM electricity_readings a USING (
  SELECT MIN(ctid) as ctid, meter_id, reading_date
  FROM electricity_readings 
  GROUP BY meter_id, reading_date HAVING COUNT(*) > 1
) b
WHERE a.meter_id = b.meter_id 
AND a.reading_date = b.reading_date 
AND a.ctid <> b.ctid;

ALTER TABLE electricity_readings 
ADD CONSTRAINT unique_meter_reading_date UNIQUE (meter_id, reading_date);
