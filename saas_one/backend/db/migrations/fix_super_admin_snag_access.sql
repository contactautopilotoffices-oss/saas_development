-- =========================================================
-- FIX: SUPER ADMIN SNAG ACCESS
-- Allows Org Super Admins to perform bulk imports across properties
-- =========================================================

-- 1. Create a helper function if not exists (to avoid redundancy)
CREATE OR REPLACE FUNCTION public.is_org_admin_for_property(p_property_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_memberships om
    JOIN public.properties p ON p.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
    AND p.id = p_property_id
    AND om.role IN ('org_super_admin', 'org_admin', 'owner')
    AND om.is_active = true
  ) OR public.check_is_master_admin_safe();
END;
$$;

-- 2. Update Tickets INSERT Policy
DROP POLICY IF EXISTS "tickets_insert_policy" ON tickets;
CREATE POLICY "tickets_insert_policy" ON tickets FOR INSERT WITH CHECK (
  -- Users can create tickets in properties they are members of
  EXISTS (
    SELECT 1 FROM property_memberships pm 
    WHERE pm.user_id = auth.uid() 
    AND pm.property_id = tickets.property_id
    AND pm.is_active = true
  )
  -- Org Admins can create tickets for any property in their org
  OR public.is_org_admin_for_property(tickets.property_id)
  -- Fallback for super admin email
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  -- Master Admin
  OR public.check_is_master_admin_safe()
);

-- 3. Update Tickets UPDATE Policy (Super Admins should be able to manage all tickets in their org)
DROP POLICY IF EXISTS "tickets_update_policy" ON tickets;
CREATE POLICY "tickets_update_policy" ON tickets FOR UPDATE USING (
  -- Staff/Admins can update tickets
  EXISTS (
    SELECT 1 FROM property_memberships pm 
    WHERE pm.user_id = auth.uid() 
    AND pm.property_id = tickets.property_id 
    AND pm.is_active = true
    AND pm.role IN ('property_admin', 'staff', 'mst', 'security')
  )
  OR assigned_to = auth.uid()
  OR public.is_org_admin_for_property(tickets.property_id)
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  OR public.check_is_master_admin_safe()
);

-- 4. Update Snag Imports Policies (just in case)
DROP POLICY IF EXISTS snag_imports_insert ON snag_imports;
CREATE POLICY snag_imports_insert ON snag_imports FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = snag_imports.property_id AND pm.role IN ('property_admin'))
  OR public.is_org_admin_for_property(snag_imports.property_id)
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  OR public.check_is_master_admin_safe()
);

DROP POLICY IF EXISTS snag_imports_read ON snag_imports;
CREATE POLICY snag_imports_read ON snag_imports FOR SELECT USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = snag_imports.property_id AND pm.is_active)
  OR public.is_org_admin_for_property(snag_imports.property_id)
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  OR public.check_is_master_admin_safe()
);

-- Reload Schema
NOTIFY pgrst, 'reload schema';
