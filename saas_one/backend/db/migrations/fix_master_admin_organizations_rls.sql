-- ================================================
-- FIX: Master Admin Cannot See Organizations
-- ================================================
-- Problem: RLS policies prevent master admins from seeing organizations
-- they create because they're not added as members.
--
-- Solution: Update organizations table policies to allow master admins
-- to see all organizations.
--
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. Update the is_master_admin() function to check JWT email
-- This is faster and safer than querying the auth.users table
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT (
    COALESCE(auth.jwt() ->> 'email', '')
    = 'ranganathanlohitaksha@gmail.com'
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated;

-- 2. Drop ALL existing policies on organizations table
DROP POLICY IF EXISTS organizations_select_policy ON organizations;
DROP POLICY IF EXISTS organizations_insert_policy ON organizations;
DROP POLICY IF EXISTS organizations_update_policy ON organizations;
DROP POLICY IF EXISTS organizations_delete_policy ON organizations;
DROP POLICY IF EXISTS org_read_policy ON organizations;
DROP POLICY IF EXISTS master_admin_org_all ON organizations;

-- 3. Create new SELECT policy that allows:
--    - Users who are members of the organization
--    - Master admins (via is_master_admin() function)
CREATE POLICY organizations_select_policy ON organizations
  FOR SELECT
  TO authenticated
  USING (
    -- User is a member of this organization
    EXISTS (
      SELECT 1 FROM organization_memberships om 
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
    -- OR user is a master admin
    OR public.is_master_admin()
  );

-- 4. Create INSERT policy - master admins and org members can create
CREATE POLICY organizations_insert_policy ON organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_master_admin()
    OR true  -- Allow any authenticated user to create (they'll be added as owner)
  );

-- 5. Create UPDATE policy - only master admins and org admins
CREATE POLICY organizations_update_policy ON organizations
  FOR UPDATE
  TO authenticated
  USING (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.role IN ('org_super_admin', 'master_admin')
    )
  )
  WITH CHECK (
    public.is_master_admin()
    OR EXISTS (
      SELECT 1 FROM organization_memberships om
      WHERE om.organization_id = organizations.id
      AND om.user_id = auth.uid()
      AND om.role IN ('org_super_admin', 'master_admin')
    )
  );

-- 6. Create DELETE policy - only master admins
CREATE POLICY organizations_delete_policy ON organizations
  FOR DELETE
  TO authenticated
  USING (
    public.is_master_admin()
  );

-- ================================================
-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Verification:
-- Run this to see all policies on organizations table:
-- SELECT polname, polcmd FROM pg_policy WHERE polrelid = 'organizations'::regclass;

-- Test query as master admin:
-- SELECT * FROM organizations;
-- ================================================
