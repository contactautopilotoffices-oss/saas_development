-- =============================================================
-- Vendor Property Scoping Migration
-- Allows vendors to be assigned to one or multiple properties
-- =============================================================

-- 1. Create junction table: vendor ↔ property (many-to-many)
CREATE TABLE IF NOT EXISTS vendor_property_assignments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id   uuid NOT NULL REFERENCES maintenance_vendors(id) ON DELETE CASCADE,
    property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    created_at  timestamptz DEFAULT now(),
    UNIQUE (vendor_id, property_id)
);

-- Index for fast lookups both ways
CREATE INDEX IF NOT EXISTS idx_vpa_vendor    ON vendor_property_assignments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vpa_property  ON vendor_property_assignments(property_id);

-- 2. Enable RLS (admin + service role bypass)
ALTER TABLE vendor_property_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON vendor_property_assignments
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3. Migrate existing vendors: if ppm_schedules have a property_id for that vendor, auto-assign
-- (best-effort; only works if vendor_id column already exists on ppm_schedules)
INSERT INTO vendor_property_assignments (vendor_id, property_id)
SELECT DISTINCT s.vendor_id, s.property_id
FROM ppm_schedules s
WHERE s.vendor_id IS NOT NULL
  AND s.property_id IS NOT NULL
ON CONFLICT (vendor_id, property_id) DO NOTHING;

-- 4. Add property_id to ppm_schedules if not present (already in earlier migration but safe to repeat)
ALTER TABLE ppm_schedules
    ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES properties(id);

-- 5. Add attachments jsonb to ppm_schedules (if not already done)
ALTER TABLE ppm_schedules
    ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '{}';

-- 6. Add verification_status to ppm_schedules (if not already done)
ALTER TABLE ppm_schedules
    ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'submitted', 'verified', 'rejected'));
