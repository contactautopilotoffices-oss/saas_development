-- =================================================================
-- FIX: Force Master Admin to use Database Column (Not Emails)
-- =================================================================

-- 1. Ensure the column exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_master_admin boolean DEFAULT false;

-- 2. CRITICAL: Redefine the function to prioritize the DB column
CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER -- IMPORTANT: Bypasses RLS to read the user's status
SET search_path = public
STABLE
AS c:\Users\harsh\OneDrive\Desktop\autopilot\saas_one
  SELECT COALESCE(
    (SELECT is_master_admin FROM users WHERE id = auth.uid()),
    false
  );
c:\Users\harsh\OneDrive\Desktop\autopilot\saas_one;

GRANT EXECUTE ON FUNCTION public.is_master_admin() TO authenticated;

-- 3. Just to be safe, grant select on users table so the function doesn't fail
GRANT SELECT ON TABLE users TO authenticated;

-- 4. Reload Schema to apply changes immediately
NOTIFY pgrst, 'reload schema';

-- 5. Verification Hint
-- After running this, any user with is_master_admin=true in the 'users' table 
-- will immediately be able to see the organizations.
