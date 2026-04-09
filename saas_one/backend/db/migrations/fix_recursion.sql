-- =================================================================
-- FIX: BREAK INFINITE RECURSION (Error 500)
-- =================================================================
-- The policy on the 'users' table calls is_master_admin(), 
-- which queries the 'users' table. This causes an infinite loop.
-- We must fix the 'users' table policy to be non-recursive.
-- =================================================================

-- 1. Drop the problematic recursive policy
DROP POLICY IF EXISTS master_admin_all_users ON users;

-- 2. Create a safe, iterative policy for users
-- Rule A: Users can always see/edit themselves (No recursion)
CREATE POLICY self_access_users ON users
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Rule B: Master Admins can see everyone
-- BUT we must avoid using the function that queries the table we are checking.
-- We use a direct check that hopefully optimizes better, OR
-- we accept that for the 'users' table specifically, we rely on the function 
-- being SECURITY DEFINER and trusted.

-- Let's try trusting the SECURITY DEFINER function again but ONLY for SELECT
-- and ensure the function is defined correctly to strictly bypass RLS.
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER -- Must be ON
SET search_path = public
STABLE
AS c:\Users\harsh\OneDrive\Desktop\autopilot\saas_one
  -- Direct query that should bypass RLS due to SECURITY DEFINER
  SELECT COALESCE(
    (SELECT is_master_admin FROM users WHERE id = auth.uid()),
    false
  );
c:\Users\harsh\OneDrive\Desktop\autopilot\saas_one;

-- 3. Re-add policy for 'users' but safer
CREATE POLICY master_admin_read_all_users ON users
  FOR SELECT TO authenticated
  USING (
    public.is_master_admin()
  );
  
-- 4. Ensure other tables are still accessible
-- (The other policies on organizations/properties are fine 
--  because they query 'users', not themselves).

NOTIFY pgrst, 'reload schema';
