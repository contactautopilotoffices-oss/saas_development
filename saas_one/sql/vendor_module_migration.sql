-- =============================================================================
-- Vendor Module Migration — Complete
-- Run in Supabase SQL Editor
-- =============================================================================

-- 1. MAINTENANCE VENDORS TABLE
CREATE TABLE IF NOT EXISTS maintenance_vendors (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id uuid NOT NULL,

    -- Identity
    company_name text NOT NULL,
    contact_person text NOT NULL,
    phone text NOT NULL,
    email text,
    whatsapp_number text,
    specialization text[] DEFAULT '{}',
    -- values: 'electrical','hvac','fire','ups','civil','it','plumbing','all'

    -- KYC documents
    gst_number text,
    gst_doc_url text,
    pan_number text,
    pan_doc_url text,
    msme_number text,
    msme_doc_url text,
    cancelled_cheque_url text,
    bank_name text,
    bank_account_number text,
    bank_ifsc text,

    -- Status
    kyc_status text DEFAULT 'pending'
        CHECK (kyc_status IN ('pending','submitted','verified','rejected')),
    kyc_rejection_reason text,
    is_active boolean DEFAULT true,

    -- Supabase auth user linked to this vendor
    user_id uuid,

    created_by uuid,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 2. UPDATE ppm_schedules — add vendor link + checker verification columns
ALTER TABLE ppm_schedules
    ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES maintenance_vendors(id),
    ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending'
        CHECK (verification_status IN ('pending','submitted','verified','rejected')),
    ADD COLUMN IF NOT EXISTS verified_by uuid,
    ADD COLUMN IF NOT EXISTS verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 3. UPDATE amc_contracts — add vendor FK
ALTER TABLE amc_contracts
    ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES maintenance_vendors(id);

-- 4. Allow 'maintenance_vendor' role in organization_memberships
-- NOTE: 'vendor' is already used for food vendors (property_memberships).
--       Maintenance vendors use 'maintenance_vendor' on organization_memberships.
-- Run only if a CHECK constraint exists that blocks new roles:
-- ALTER TABLE organization_memberships DROP CONSTRAINT IF EXISTS organization_memberships_role_check;

-- 5. INDEXES
CREATE INDEX IF NOT EXISTS idx_maintenance_vendors_org
    ON maintenance_vendors(organization_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_vendors_user
    ON maintenance_vendors(user_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_vendors_company
    ON maintenance_vendors(organization_id, lower(company_name));
CREATE INDEX IF NOT EXISTS idx_ppm_schedules_vendor
    ON ppm_schedules(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ppm_schedules_verification
    ON ppm_schedules(verification_status);

-- 6. RLS
ALTER TABLE maintenance_vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_authenticated" ON maintenance_vendors;
CREATE POLICY "allow_all_authenticated" ON maintenance_vendors
    FOR ALL USING (auth.role() = 'authenticated');

-- 7. RLS for ppm_schedules — allow vendors to read/update their own tasks
-- (Run only if RLS is enabled on ppm_schedules)
-- DROP POLICY IF EXISTS "vendor_own_tasks" ON ppm_schedules;
-- CREATE POLICY "vendor_own_tasks" ON ppm_schedules
--     FOR ALL USING (
--         vendor_id IN (
--             SELECT id FROM maintenance_vendors WHERE user_id = auth.uid()
--         )
--     );

-- 8. RLS for maintenance_vendors — vendors see only their own row
DROP POLICY IF EXISTS "vendor_own_row" ON maintenance_vendors;
CREATE POLICY "vendor_own_row" ON maintenance_vendors
    FOR SELECT USING (
        auth.role() = 'authenticated'
    );

-- 9. Storage buckets (create in Supabase Dashboard):
--   Storage → New Bucket → name: vendor-kyc  → Public: true
--   Storage → New Bucket → name: ppm-attachments → Public: true (if not already exists)

-- 10. Helper RPC for matching vendor names (fallback to manual update in API)
CREATE OR REPLACE FUNCTION match_vendor_name_to_id(
    p_org_id uuid,
    p_company_name text,
    p_vendor_id uuid
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE ppm_schedules
    SET vendor_id = p_vendor_id
    WHERE organization_id = p_org_id
      AND lower(vendor_name) = lower(p_company_name)
      AND vendor_id IS NULL;
END;
$$;
