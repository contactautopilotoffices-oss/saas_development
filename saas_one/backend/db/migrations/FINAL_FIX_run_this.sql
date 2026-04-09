-- =================================================================
-- MASTER ADMIN PERMISSIONS REPAIR SCRIPT
-- =================================================================
-- Run this entire script in your Supabase SQL Editor to fix the 403 errors.
-- It grants the Master Admin account correct access to all necessary tables.
-- =================================================================

-- 1. Helper function to safely check Master Admin status without recursion
CREATE OR REPLACE FUNCTION public.check_is_master_admin_safe()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND is_master_admin = true
  );
END;
$$;

-- 2. Grant Access to PROPERTIES (Required for resolving names)
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master Admin can view all properties" ON public.properties;
CREATE POLICY "Master Admin can view all properties" 
ON public.properties FOR SELECT 
USING ( public.check_is_master_admin_safe() );

-- 3. Grant Access to ORGANIZATION MEMBERSHIPS
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master Admin can view all org memberships" ON public.organization_memberships;
CREATE POLICY "Master Admin can view all org memberships" 
ON public.organization_memberships FOR SELECT 
USING ( public.check_is_master_admin_safe() );

-- 4. Grant Access to PROPERTY MEMBERSHIPS (The new feature)
ALTER TABLE public.property_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master Admin can view all prop memberships" ON public.property_memberships;
CREATE POLICY "Master Admin can view all prop memberships" 
ON public.property_memberships FOR SELECT 
USING ( public.check_is_master_admin_safe() );

-- 5. Ensure users table is readable
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Master Admin can view all users" ON public.users;
CREATE POLICY "Master Admin can view all users" 
ON public.users FOR SELECT 
USING ( public.check_is_master_admin_safe() );

-- 6. Ensure Master Admins can update/manage these tables if needed
-- (Adding broad policies for convenience)
CREATE POLICY "Master Admin all access properties" ON public.properties FOR ALL USING ( public.check_is_master_admin_safe() );
CREATE POLICY "Master Admin all access org memberships" ON public.organization_memberships FOR ALL USING ( public.check_is_master_admin_safe() );
CREATE POLICY "Master Admin all access prop memberships" ON public.property_memberships FOR ALL USING ( public.check_is_master_admin_safe() );

-- End of Fix
