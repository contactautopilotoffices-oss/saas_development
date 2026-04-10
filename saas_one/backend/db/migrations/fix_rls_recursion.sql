-- ================================================
-- FIX: Infinite Recursion in organization_memberships Policies
-- ================================================
-- The issue: policies that reference the same table cause infinite loops
-- The solution: use a SECURITY DEFINER function that bypasses RLS
--
-- Run this in Supabase SQL Editor
-- ================================================

-- 1. Create a helper function with SECURITY DEFINER to bypass RLS
-- This function checks if a user belongs to an organization without triggering RLS
CREATE OR REPLACE FUNCTION public.user_is_member_of_org(check_user_id uuid, check_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE user_id = check_user_id
    AND organization_id = check_org_id
  );
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.user_is_member_of_org(uuid, uuid) TO authenticated;

-- 2. Create function to check if user is admin in an org (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.user_is_org_admin(check_user_id uuid, check_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_memberships
    WHERE user_id = check_user_id
    AND organization_id = check_org_id
    AND role IN ('master_admin', 'org_super_admin')
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_is_org_admin(uuid, uuid) TO authenticated;

-- 3. Create function to check if user is master admin (by email)
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT (
    (SELECT email FROM auth.users WHERE id = auth.uid()) 
    = 'ranganathanlohitaksha@gmail.com'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated;

-- 4. Drop ALL existing policies on organization_memberships
DROP POLICY IF EXISTS organization_memberships_select_policy ON organization_memberships;
DROP POLICY IF EXISTS organization_memberships_insert_policy ON organization_memberships;
DROP POLICY IF EXISTS organization_memberships_update_policy ON organization_memberships;
DROP POLICY IF EXISTS organization_memberships_delete_policy ON organization_memberships;
DROP POLICY IF EXISTS organization_members_select_policy ON organization_memberships;
DROP POLICY IF EXISTS organization_members_insert_policy ON organization_memberships;
DROP POLICY IF EXISTS organization_members_update_policy ON organization_memberships;
DROP POLICY IF EXISTS organization_members_delete_policy ON organization_memberships;

-- 5. Create simple, non-recursive SELECT policy
CREATE POLICY organization_memberships_select_policy ON organization_memberships
  FOR SELECT
  TO authenticated
  USING (
    -- User can see their own memberships
    user_id = auth.uid()
    -- OR user is master admin
    OR public.is_master_admin()
    -- OR user is in the same org (SECURITY DEFINER function - no recursion)
    OR public.user_is_member_of_org(auth.uid(), organization_id)
  );

-- 6. Create INSERT policy
CREATE POLICY organization_memberships_insert_policy ON organization_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- User can add themselves
    user_id = auth.uid()
    -- OR user is master admin
    OR public.is_master_admin()
    -- OR user is org admin (SECURITY DEFINER - no recursion)
    OR public.user_is_org_admin(auth.uid(), organization_id)
  );

-- 7. Create UPDATE policy
CREATE POLICY organization_memberships_update_policy ON organization_memberships
  FOR UPDATE
  TO authenticated
  USING (
    public.is_master_admin()
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
  WITH CHECK (
    public.is_master_admin()
    OR public.user_is_org_admin(auth.uid(), organization_id)
  );

-- 8. Create DELETE policy
CREATE POLICY organization_memberships_delete_policy ON organization_memberships
  FOR DELETE
  TO authenticated
  USING (
    public.is_master_admin()
    OR public.user_is_org_admin(auth.uid(), organization_id)
  );

-- ================================================
-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Verification:
-- SELECT polname FROM pg_policy WHERE polrelid = 'organization_memberships'::regclass;
