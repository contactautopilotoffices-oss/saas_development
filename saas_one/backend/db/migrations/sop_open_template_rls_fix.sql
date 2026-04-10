-- Migration: Fix RLS policies to allow open templates (empty assigned_to) for all property members
-- Date: 2026-03-18
--
-- Problem:
--   sop_templates_read and sop_items_read both require:
--     assigned_to @> ARRAY[auth.uid()::text]
--   This fails when assigned_to is empty (open template) because an empty array
--   contains nothing, so the operator always returns false for non-admins.
--
-- Fix:
--   Add `cardinality(assigned_to) = 0` check — if the array is empty the template
--   is open to all property members, so any property member should pass.

-- 1. Drop old policies
DROP POLICY IF EXISTS "sop_templates_read" ON sop_templates;
DROP POLICY IF EXISTS "sop_items_read" ON sop_checklist_items;

-- 2. Recreate sop_templates_read with open-template support
CREATE POLICY "sop_templates_read" ON sop_templates FOR SELECT USING (
    public.is_master_admin_v2() OR
    public.is_org_admin_v2(organization_id) OR
    (public.is_property_member_v2(property_id) AND (
        cardinality(assigned_to) = 0 OR
        assigned_to @> ARRAY[auth.uid()::text] OR
        EXISTS (
            SELECT 1 FROM property_memberships pm
            WHERE pm.user_id = auth.uid()
            AND pm.property_id = sop_templates.property_id
            AND pm.role IN ('property_admin')
        )
    ))
);

-- 3. Recreate sop_items_read with open-template support
CREATE POLICY "sop_items_read" ON sop_checklist_items FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM sop_templates t
        WHERE t.id = sop_checklist_items.template_id
        AND (
            public.is_master_admin_v2() OR
            public.is_org_admin_v2(t.organization_id) OR
            (public.is_property_member_v2(t.property_id) AND (
                cardinality(t.assigned_to) = 0 OR
                t.assigned_to @> ARRAY[auth.uid()::text] OR
                EXISTS (
                    SELECT 1 FROM property_memberships pm
                    WHERE pm.user_id = auth.uid()
                    AND pm.property_id = t.property_id
                    AND pm.role IN ('property_admin')
                )
            ))
        )
    )
);
