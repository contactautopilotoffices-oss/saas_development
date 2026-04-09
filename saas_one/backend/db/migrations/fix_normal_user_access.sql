-- =================================================================
-- NORMAL USER ACCESS FIX
-- =================================================================
-- This migration ensures that non-master-admins can still 
-- read their own profiles and memberships.
-- =================================================================

-- 1. USERS Table: Allow users to see their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT TO authenticated
  USING (
    id = auth.uid() 
    OR public.check_is_master_admin_safe()
  );

-- 2. ORGANIZATION_MEMBERSHIPS Table: Allow users to see their own memberships
DROP POLICY IF EXISTS "Users can view own memberships" ON public.organization_memberships;
CREATE POLICY "Users can view own memberships" ON public.organization_memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid() 
    OR public.check_is_master_admin_safe()
  );

-- 3. ORGANIZATIONS Table: Allow members to see their organization
DROP POLICY IF EXISTS "Members can view their organization" ON public.organizations;
CREATE POLICY "Members can view their organization" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.check_is_master_admin_safe()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships 
      WHERE organization_id = public.organizations.id 
      AND user_id = auth.uid()
    )
  );

-- 4. PROPERTIES Table: Allow members to see their properties
DROP POLICY IF EXISTS "Members can view their properties" ON public.properties;
CREATE POLICY "Members can view their properties" ON public.properties
  FOR SELECT TO authenticated
  USING (
    public.check_is_master_admin_safe()
    OR EXISTS (
      SELECT 1 FROM public.organization_memberships 
      WHERE organization_id = public.properties.organization_id 
      AND user_id = auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
