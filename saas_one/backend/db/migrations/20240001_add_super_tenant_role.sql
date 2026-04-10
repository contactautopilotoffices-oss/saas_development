-- =========================================================
-- MIGRATION: Add super_tenant role
-- Run this in your Supabase SQL editor
-- =========================================================

-- 1. Add 'super_tenant' to app_role enum (safe, idempotent)
DO $$
BEGIN
  BEGIN
    ALTER TYPE app_role ADD VALUE 'super_tenant';
  EXCEPTION
    WHEN duplicate_object THEN
      RAISE NOTICE 'super_tenant already exists in app_role enum, skipping.';
  END;
END $$;

-- 2. Create super_tenant_properties table
--    Tracks which properties a super_tenant account has explicit access to.
--    property_memberships is still used for auth/RLS, but this table holds
--    the "assigned portfolio" metadata (assigned_by, org linkage, etc.)
CREATE TABLE IF NOT EXISTS super_tenant_properties (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id     uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id uuid        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    assigned_by     uuid        REFERENCES users(id) ON DELETE SET NULL,
    created_at      timestamptz DEFAULT now(),
    UNIQUE(user_id, property_id)
);

-- 3. Enable RLS on the new table
ALTER TABLE super_tenant_properties ENABLE ROW LEVEL SECURITY;

-- Super tenants can see their own assignments
DROP POLICY IF EXISTS stp_self_read ON super_tenant_properties;
CREATE POLICY stp_self_read ON super_tenant_properties
    FOR SELECT
    USING (user_id = auth.uid());

-- Master admins and org_super_admins can read all assignments in their org
DROP POLICY IF EXISTS stp_admin_read ON super_tenant_properties;
CREATE POLICY stp_admin_read ON super_tenant_properties
    FOR SELECT
    USING (
        EXISTS(
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.is_master_admin = true
        )
        OR EXISTS(
            SELECT 1 FROM organization_memberships om
            WHERE om.user_id = auth.uid()
              AND om.organization_id = super_tenant_properties.organization_id
              AND om.role IN ('master_admin', 'org_super_admin')
              AND om.is_active = true
        )
    );

-- Only master admins can write to this table (via service role / admin API)
DROP POLICY IF EXISTS stp_admin_write ON super_tenant_properties;
CREATE POLICY stp_admin_write ON super_tenant_properties
    FOR ALL
    USING (
        EXISTS(
            SELECT 1 FROM users u
            WHERE u.id = auth.uid() AND u.is_master_admin = true
        )
    );

-- 4. Update tickets RLS policy to allow super_tenant to read tickets
--    across all their assigned properties
DROP POLICY IF EXISTS tickets_super_tenant_read ON tickets;
CREATE POLICY tickets_super_tenant_read ON tickets
    FOR SELECT
    USING (
        EXISTS(
            SELECT 1 FROM super_tenant_properties stp
            WHERE stp.user_id = auth.uid()
              AND stp.property_id = tickets.property_id
        )
    );

-- 5. Allow super_tenants to read property info for their assigned properties
DROP POLICY IF EXISTS prop_super_tenant_read ON properties;
CREATE POLICY prop_super_tenant_read ON properties
    FOR SELECT
    USING (
        EXISTS(
            SELECT 1 FROM super_tenant_properties stp
            WHERE stp.user_id = auth.uid()
              AND stp.property_id = properties.id
        )
    );

-- =========================================================
-- DONE. Verify with:
-- SELECT enum_range(NULL::app_role);
-- SELECT * FROM super_tenant_properties LIMIT 5;
-- =========================================================
