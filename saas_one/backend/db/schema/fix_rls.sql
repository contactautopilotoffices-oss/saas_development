-- =================================================================
-- UNIVERSAL RLS & RECURSION FIX (Run this in Supabase SQL Editor)
-- =================================================================
-- This script fixes the 500 Internal Server Errors by eliminating
-- the infinite recursion in the 'users' and 'memberships' tables.
-- =================================================================

-- 1. Create a truly safe, non-recursive Master Admin check
-- Using SECURITY DEFINER so it bypasses RLS on the table it queries.
CREATE OR REPLACE FUNCTION public.check_is_master_admin_safe()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- We query the table directly. Since this is SECURITY DEFINER,
  -- it will not trigger the RLS policies ON the users table.
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND is_master_admin = true
  );
END;
$$;

-- 2. Repair USERS Table Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Master Admin can view all users" ON public.users;
DROP POLICY IF EXISTS "master_admin_all_users" ON public.users;

-- Essential: Every user must be able to see themselves to log in!
CREATE POLICY "Users can view their own profile" 
ON public.users FOR SELECT 
USING ( auth.uid() = id );

-- Essential: Master admins can see everything
CREATE POLICY "Master Admin can view all users" 
ON public.users FOR SELECT 
USING ( public.check_is_master_admin_safe() );

-- 3. Repair PROPERTIES Table
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master Admin can view all properties" ON public.properties;
DROP POLICY IF EXISTS "master_admin_all_properties" ON public.properties;

CREATE POLICY "Master Admin can view all properties" 
ON public.properties FOR ALL 
USING ( public.check_is_master_admin_safe() );

-- 4. Repair ORGANIZATION MEMBERSHIPS Table
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master Admin can view all org memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "master_admin_all_org_members" ON public.organization_memberships;

CREATE POLICY "Master Admin all access org memberships" 
ON public.organization_memberships FOR ALL 
USING ( public.check_is_master_admin_safe() );

-- ALSO: Allow users to see their own memberships (Required for login)
DROP POLICY IF EXISTS "Users can view own memberships" ON public.organization_memberships;
CREATE POLICY "Users can view own memberships" 
ON public.organization_memberships FOR SELECT 
USING ( auth.uid() = user_id );

-- 5. Repair PROPERTY MEMBERSHIPS Table
ALTER TABLE public.property_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master Admin can view all prop memberships" ON public.property_memberships;
DROP POLICY IF EXISTS "master_admin_all_prop_members" ON public.property_memberships;

CREATE POLICY "Master Admin all access prop memberships" 
ON public.property_memberships FOR ALL 
USING ( public.check_is_master_admin_safe() );

-- ALSO: Allow users to see their own property memberships (Required for login)
DROP POLICY IF EXISTS "Users can view own prop memberships" ON public.property_memberships;
CREATE POLICY "Users can view own prop memberships" 
ON public.property_memberships FOR SELECT 
USING ( auth.uid() = user_id );

-- 6. Boostrap Master Admin (Double check)
-- Ensure your account is actually marked as master admin
UPDATE public.users 
SET is_master_admin = true 
WHERE email = 'ranganathanlohitaksha@gmail.com';

-- Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';

-- Verify: The following should return TRUE for you
-- SELECT public.check_is_master_admin_safe();
