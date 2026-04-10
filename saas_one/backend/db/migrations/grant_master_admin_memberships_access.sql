-- ================================================
-- Grant Master Admin Full Access to Membership Tables
-- ================================================

-- 1. Ensure the safe check function exists (from previous step)
-- If it doesn't exist yet, we recreate it here to be safe.
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

-- 2. Organization Memberships Policies
-- Drop to avoid conflicts
DROP POLICY IF EXISTS "Master Admin can view all org memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "Master Admin can manage all org memberships" ON public.organization_memberships;

CREATE POLICY "Master Admin can view all org memberships" 
ON public.organization_memberships FOR SELECT 
USING ( public.check_is_master_admin_safe() );

CREATE POLICY "Master Admin can manage all org memberships" 
ON public.organization_memberships FOR ALL 
USING ( public.check_is_master_admin_safe() );

-- 3. Property Memberships Policies
DROP POLICY IF EXISTS "Master Admin can view all prop memberships" ON public.property_memberships;
DROP POLICY IF EXISTS "Master Admin can manage all prop memberships" ON public.property_memberships;

CREATE POLICY "Master Admin can view all prop memberships" 
ON public.property_memberships FOR SELECT 
USING ( public.check_is_master_admin_safe() );

CREATE POLICY "Master Admin can manage all prop memberships" 
ON public.property_memberships FOR ALL 
USING ( public.check_is_master_admin_safe() );

-- 4. Properties Policies
DROP POLICY IF EXISTS "Master Admin can view all properties" ON public.properties;
DROP POLICY IF EXISTS "Master Admin can manage all properties" ON public.properties;

CREATE POLICY "Master Admin can view all properties" 
ON public.properties FOR SELECT 
USING ( public.check_is_master_admin_safe() );

CREATE POLICY "Master Admin can manage all properties" 
ON public.properties FOR ALL 
USING ( public.check_is_master_admin_safe() );
