-- =================================================================
-- PROPER MASTER ADMIN SETUP (Database-Driven)
-- =================================================================

-- 1. Add the identifying column to the users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_master_admin boolean DEFAULT false;

-- 2. Bootstrap the initial Master Admins
-- We explicitly set the flag for your accounts so you don't lose access
UPDATE users 
SET is_master_admin = true 
WHERE email = 'ranganathanlohitaksha@gmail.com';

-- 3. Update the check function to use the DATABASE COLUMN
-- SECURITY DEFINER is critical here: it allows this function to bypass RLS
-- to read the 'is_master_admin' status even if the user can't see other data.
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER -- Runs with owner privileges (bypasses RLS)
SET search_path = public
STABLE
AS c:\Users\harsh\OneDrive\Desktop\autopilot\saas_one
  SELECT COALESCE(
    (SELECT is_master_admin FROM users WHERE id = auth.uid()),
    false
  );
c:\Users\harsh\OneDrive\Desktop\autopilot\saas_one;

GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated;

-- 4. Re-verify/Apply Policies (Just to ensure they use the function)

-- Organizations Table
DROP POLICY IF EXISTS organizations_select_policy ON organizations;
CREATE POLICY organizations_select_policy ON organizations
  FOR SELECT TO authenticated
  USING (
    public.is_master_admin() 
    OR EXISTS (
      SELECT 1 FROM organization_memberships om 
      WHERE om.organization_id = organizations.id 
      AND om.user_id = auth.uid()
    )
  );

-- Master admins can delete
DROP POLICY IF EXISTS organizations_delete_policy ON organizations;
CREATE POLICY organizations_delete_policy ON organizations
  FOR DELETE TO authenticated
  USING (public.is_master_admin());

-- (Optional) Make sure users table is readable by self so the dashboard works
DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own ON users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid() 
    OR public.is_master_admin() -- Master admin can see all users
  );

NOTIFY pgrst, 'reload schema';
