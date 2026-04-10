-- Migration: Update Stock RLS for Soft Service Roles
-- Created: 2026-02-20
-- Description: Ensure soft_service_staff and soft_service_supervisor have full CRUD access to stock tables

-- Update stock_items read policy to include soft service roles
DROP POLICY IF EXISTS stock_items_read ON stock_items;
CREATE POLICY stock_items_read ON stock_items FOR SELECT USING (
  public.is_master_admin_v2()
  OR public.is_org_admin_v2(organization_id)
  OR public.is_property_member_v2(property_id)
  OR EXISTS (
    SELECT 1 FROM property_memberships pm
    WHERE pm.user_id = auth.uid()
      AND pm.property_id = stock_items.property_id
      AND pm.role IN ('soft_service_staff', 'soft_service_supervisor')
      AND pm.is_active = true
  )
);

-- Update stock_items write policy to include soft service roles
DROP POLICY IF EXISTS stock_items_write ON stock_items;
CREATE POLICY stock_items_write ON stock_items FOR ALL USING (
  public.is_master_admin_v2()
  OR public.is_org_admin_v2(organization_id)
  OR public.is_property_member_v2(property_id)
  OR EXISTS (
    SELECT 1 FROM property_memberships pm
    WHERE pm.user_id = auth.uid()
      AND pm.property_id = stock_items.property_id
      AND pm.role IN ('soft_service_staff', 'soft_service_supervisor', 'staff')
      AND pm.is_active = true
  )
);

-- Update stock_movements read policy
DROP POLICY IF EXISTS stock_movements_read ON stock_movements;
CREATE POLICY stock_movements_read ON stock_movements FOR SELECT USING (
  public.is_master_admin_v2()
  OR public.is_org_admin_v2(organization_id)
  OR public.is_property_member_v2(property_id)
  OR EXISTS (
    SELECT 1 FROM property_memberships pm
    WHERE pm.user_id = auth.uid()
      AND pm.property_id = stock_movements.property_id
      AND pm.role IN ('soft_service_staff', 'soft_service_supervisor', 'staff')
      AND pm.is_active = true
  )
);

-- Update stock_movements insert policy
DROP POLICY IF EXISTS stock_movements_insert ON stock_movements;
CREATE POLICY stock_movements_insert ON stock_movements FOR INSERT WITH CHECK (
  public.is_master_admin_v2()
  OR public.is_org_admin_v2(organization_id)
  OR public.is_property_member_v2(property_id)
  OR EXISTS (
    SELECT 1 FROM property_memberships pm
    WHERE pm.user_id = auth.uid()
      AND pm.property_id = stock_movements.property_id
      AND pm.role IN ('soft_service_staff', 'soft_service_supervisor', 'staff')
      AND pm.is_active = true
  )
);

-- Update stock_reports read policy
DROP POLICY IF EXISTS stock_reports_read ON stock_reports;
CREATE POLICY stock_reports_read ON stock_reports FOR SELECT USING (
  public.is_master_admin_v2()
  OR public.is_org_admin_v2(organization_id)
  OR public.is_property_member_v2(property_id)
  OR EXISTS (
    SELECT 1 FROM property_memberships pm
    WHERE pm.user_id = auth.uid()
      AND pm.property_id = stock_reports.property_id
      AND pm.role IN ('soft_service_staff', 'soft_service_supervisor', 'staff')
      AND pm.is_active = true
  )
);

-- Update stock_reports write policy (admins only)
DROP POLICY IF EXISTS stock_reports_write ON stock_reports;
CREATE POLICY stock_reports_write ON stock_reports FOR ALL USING (
  public.is_master_admin_v2()
  OR public.is_org_admin_v2(organization_id)
);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
