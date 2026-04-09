-- =================================================================
-- MASTER ADMIN OMNIPOTENCE (CRUD ALL TABLES)
-- =================================================================
-- The dashboard fails because it tries to COUNT properties and memberships.
-- If you only gave access to 'organizations' table, the query fails 
-- when it tries to join 'properties' or 'organization_memberships'.
-- This script fixes that by giving Master Admin access to EVERYTHING.
-- =================================================================

-- 1. USERS Table
DROP POLICY IF EXISTS master_admin_all_users ON users;
CREATE POLICY master_admin_all_users ON users
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- 2. PROPERTIES Table (Crucial for the dashboard count!)
DROP POLICY IF EXISTS master_admin_all_properties ON properties;
CREATE POLICY master_admin_all_properties ON properties
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- 3. ORGANIZATION_MEMBERSHIPS Table (Crucial for user count!)
DROP POLICY IF EXISTS master_admin_all_org_members ON organization_memberships;
CREATE POLICY master_admin_all_org_members ON organization_memberships
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- 4. PROPERTY_MEMBERSHIPS Table
DROP POLICY IF EXISTS master_admin_all_prop_members ON property_memberships;
CREATE POLICY master_admin_all_prop_members ON property_memberships
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- 5. PROPERTY_ACTIVITIES Table
DROP POLICY IF EXISTS master_admin_all_activities ON property_activities;
CREATE POLICY master_admin_all_activities ON property_activities
  FOR ALL TO authenticated
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

NOTIFY pgrst, 'reload schema';
