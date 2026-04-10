-- Fix organizational visibility for Escalation system
-- Allows all organization members to view other memberships within the same organization

-- 1. Ensure RLS is enabled (if it was disabled by mistake or not set)
-- ALTER TABLE organization_memberships ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- 2. Policy: Any member of an organization can view all memberships of that same organization
DROP POLICY IF EXISTS "org_members_view_same_org" ON public.organization_memberships;
CREATE POLICY "org_members_view_same_org" ON public.organization_memberships
FOR SELECT
TO authenticated
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_memberships WHERE user_id = auth.uid()
  )
);

-- 3. Policy: Any member of an organization can view the organization record itself
DROP POLICY IF EXISTS "org_members_view_org" ON public.organizations;
CREATE POLICY "org_members_view_org" ON public.organizations
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT organization_id FROM public.organization_memberships WHERE user_id = auth.uid()
  )
);

-- 4. If the user REALLY wants RLS disabled for these tables (not recommended but they mentioned it):
-- Note: These commands would bypass all policies.
-- ALTER TABLE public.organization_memberships DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.organizations DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
