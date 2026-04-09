-- COMPREHENSIVE RLS FIX
-- Targeted to resolve 500 Internal Server Error (Recursion/Crash) and 404 Not Found (Access Denied)

-- 1. Ensure Low-Level Permissions (Basis for everything)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- 2. RE-DEFINE SECURITY FUNCTIONS (Root of Trust)
-- Must be SECURITY DEFINER and OWNED BY POSTGRES to bypass RLS loops

CREATE OR REPLACE FUNCTION public.is_master_admin_v2()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Direct check on users table (bypassing RLS due to SECURITY DEFINER)
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND is_master_admin = true
  );
END;
$$;
ALTER FUNCTION public.is_master_admin_v2 OWNER TO postgres;

CREATE OR REPLACE FUNCTION public.is_org_member_v2(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check direct org membership
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE user_id = auth.uid() AND organization_id = p_org_id) THEN
    RETURN true;
  END IF;
  -- Check indirect property membership (Safe join)
  IF EXISTS (SELECT 1 FROM public.property_memberships pm JOIN public.properties p ON p.id = pm.property_id WHERE pm.user_id = auth.uid() AND p.organization_id = p_org_id) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;
ALTER FUNCTION public.is_org_member_v2 OWNER TO postgres;

-- 3. RESET & APPLY POLICIES

-- === USERS ===
-- Drop problematic policies to avoid recursion
DROP POLICY IF EXISTS "users_read_master" ON public.users; 
DROP POLICY IF EXISTS "users_read_self" ON public.users;
-- Only allow reading own profile (Master admin status is checked via function above, internal only)
CREATE POLICY "users_read_self" ON public.users FOR SELECT USING (auth.uid() = id);


-- === ORGANIZATIONS ===
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_access_master" ON public.organizations;
DROP POLICY IF EXISTS "org_access_member" ON public.organizations;
DROP POLICY IF EXISTS "org_read_master" ON public.organizations;
DROP POLICY IF EXISTS "org_read_member" ON public.organizations;

CREATE POLICY "org_access_master" ON public.organizations 
FOR ALL USING ( public.is_master_admin_v2() );

CREATE POLICY "org_access_member" ON public.organizations 
FOR SELECT USING ( public.is_org_member_v2(id) );


-- === PROPERTIES ===
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prop_access_master" ON public.properties;
DROP POLICY IF EXISTS "prop_access_member" ON public.properties;

CREATE POLICY "prop_access_master" ON public.properties 
FOR ALL USING ( public.is_master_admin_v2() );

-- Verify Organization Membership to see properties
-- (Users can see properties of organizations they belong to)
CREATE POLICY "prop_access_member" ON public.properties 
FOR SELECT USING ( public.is_org_member_v2(organization_id) );


-- === MEMBERSHIPS (Critical for is_org_member_v2 to work if not using SECUIRTY DEFINER, but safely defined here) ===
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "om_read_own" ON public.organization_memberships;
DROP POLICY IF EXISTS "om_read_master" ON public.organization_memberships;

CREATE POLICY "om_read_own" ON public.organization_memberships 
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "om_read_master" ON public.organization_memberships 
FOR ALL USING ( public.is_master_admin_v2() );


ALTER TABLE public.property_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pm_read_own" ON public.property_memberships;
DROP POLICY IF EXISTS "pm_read_master" ON public.property_memberships;

CREATE POLICY "pm_read_own" ON public.property_memberships 
FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "pm_read_master" ON public.property_memberships 
FOR ALL USING ( public.is_master_admin_v2() );

-- 4. Reload Schema
NOTIFY pgrst, 'reload schema';
