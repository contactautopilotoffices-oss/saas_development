-- =================================================================
-- DEFINITIVE RLS FIX: MASTER ADMIN ENABLED
-- =================================================================

-- 0. Master Admin Check (Security Definer)
-- Allows reading public.users inside RLS policies
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

-- 1. Helper for Org Admin (Write Access)
CREATE OR REPLACE FUNCTION public.is_org_admin_safe_v2(org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships 
    WHERE user_id = auth.uid() 
    AND organization_id = org_id 
    AND role IN ('org_super_admin', 'owner')
  );
END;
$$;

-- 2. Organization Memberships
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view own memberships" ON public.organization_memberships;
CREATE POLICY "Users view own memberships" ON public.organization_memberships
FOR SELECT USING ( 
    public.check_is_master_admin_safe() -- Master Admin sees all
    OR user_id = auth.uid() 
);

-- 3. Organizations
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_can_read_org" ON public.organizations;
CREATE POLICY "org_members_can_read_org"
ON public.organizations
FOR SELECT
USING (
  public.check_is_master_admin_safe() -- Master Admin sees all orgs
  OR
  EXISTS (
    SELECT 1
    FROM public.organization_memberships om
    WHERE om.organization_id = public.organizations.id
      AND om.user_id = auth.uid()
      -- Safest approach: removed is_active check to match schema provided in screenshot
  )
);

-- 4. Properties
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users view org properties" ON public.properties;
CREATE POLICY "Users view org properties" ON public.properties
FOR SELECT USING (
    public.check_is_master_admin_safe() -- Master Admin sees all properties
    OR
    organization_id IN (
        SELECT organization_id FROM public.organization_memberships 
        WHERE user_id = auth.uid()
    )
);

-- Write permissions (Admins only)
DROP POLICY IF EXISTS "Admins manage properties" ON public.properties;
CREATE POLICY "Admins manage properties" ON public.properties
FOR ALL 
USING ( public.is_org_admin_safe_v2(organization_id) )
WITH CHECK ( public.is_org_admin_safe_v2(organization_id) );


