-- =========================================================
-- V2 RLS ARCHITECTURE: NON-RECURSIVE & SCALABLE
-- Implementation of Secure Identity & Membership Lookup
-- =========================================================

-- 1. SECURITY DEFINER FUNCTIONS (The "Safe Pipes")
-- These bypass RLS to perform specific lookups, breaking recursion loops.

-- A. Master Admin Check
CREATE OR REPLACE FUNCTION public.is_master_admin_v2()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (SELECT is_master_admin FROM public.users WHERE id = auth.uid()),
    false
  );
END;
$$;

-- B. Org Admin Check
CREATE OR REPLACE FUNCTION public.is_org_admin_v2(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = auth.uid()
    AND organization_id = p_org_id
    AND role IN ('org_super_admin', 'owner')
  );
END;
$$;

-- C. General Membership Check (Organization)
CREATE OR REPLACE FUNCTION public.is_org_member_v2(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = auth.uid()
    AND organization_id = p_org_id
  );
END;
$$;

-- D. Property Membership Check
CREATE OR REPLACE FUNCTION public.is_property_member_v2(p_prop_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.property_memberships
    WHERE user_id = auth.uid()
    AND property_id = p_prop_id
  );
END;
$$;


-- 2. APPLY POLICIES (CLEAN SLATE)

-- --- USERS TABLE ---
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_read_self" ON public.users;
DROP POLICY IF EXISTS "users_read_master" ON public.users;

-- Logic: Users can see themselves. Master Admins can see everyone.
CREATE POLICY "users_read_self" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_read_master" ON public.users FOR SELECT USING (public.is_master_admin_v2());


-- --- ORGANIZATIONS TABLE ---
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_read_member" ON public.organizations;
DROP POLICY IF EXISTS "org_read_master" ON public.organizations;

-- Logic: Org members see their org. Master Admin sees all.
CREATE POLICY "org_read_member" ON public.organizations FOR SELECT 
USING ( public.is_org_member_v2(id) );

CREATE POLICY "org_read_master" ON public.organizations FOR ALL 
USING ( public.is_master_admin_v2() );


-- --- PROPERTIES TABLE ---
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "prop_read_member" ON public.properties;
DROP POLICY IF EXISTS "prop_read_org_admin" ON public.properties;
DROP POLICY IF EXISTS "prop_read_master" ON public.properties;

-- Logic: Property members see their property. Org Admins see all properties in their org. Master Admin sees all.
CREATE POLICY "prop_read_member" ON public.properties FOR SELECT 
USING ( public.is_property_member_v2(id) );

CREATE POLICY "prop_read_org_admin" ON public.properties FOR SELECT 
USING ( public.is_org_admin_v2(organization_id) );

CREATE POLICY "prop_read_master" ON public.properties FOR ALL 
USING ( public.is_master_admin_v2() );


-- --- MEMBERSHIPS TABLES ---
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_mem_read_self" ON public.organization_memberships;
DROP POLICY IF EXISTS "org_mem_read_master" ON public.organization_memberships;
DROP POLICY IF EXISTS "prop_mem_read_self" ON public.property_memberships;
DROP POLICY IF EXISTS "prop_mem_read_master" ON public.property_memberships;

CREATE POLICY "org_mem_read_self" ON public.organization_memberships FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "org_mem_read_master" ON public.organization_memberships FOR ALL USING (public.is_master_admin_v2());

CREATE POLICY "prop_mem_read_self" ON public.property_memberships FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "prop_mem_read_master" ON public.property_memberships FOR ALL USING (public.is_master_admin_v2());

-- --- BOOTSTRAP ---
NOTIFY pgrst, 'reload schema';
