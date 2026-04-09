-- Migration: Fix ALL missing RLS policies for SOP module
-- Date: 2026-02-24
-- Issues found:
--   1. sop_checklist_items: Only SELECT policy, no INSERT/UPDATE/DELETE
--   2. sop_completions: No DELETE policy (admin delete button fails silently)

-- ============================================================
-- FIX 1: sop_checklist_items — add full manage policy
-- Allows admins to INSERT/UPDATE/DELETE checklist items
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'sop_items_manage' AND tablename = 'sop_checklist_items'
    ) THEN
        CREATE POLICY "sop_items_manage" ON sop_checklist_items FOR ALL USING (
            EXISTS (
                SELECT 1 FROM sop_templates t
                WHERE t.id = sop_checklist_items.template_id
                AND (
                    public.is_master_admin_v2()
                    OR public.is_org_admin_v2(t.organization_id)
                    OR EXISTS (
                        SELECT 1 FROM property_memberships
                        WHERE user_id = auth.uid()
                        AND property_id = t.property_id
                        AND role IN ('property_admin')
                    )
                )
            )
        );
    END IF;
END $$;

-- ============================================================
-- FIX 2: sop_completions — add DELETE policy for admins
-- Allows admins to delete audit records
-- ============================================================
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'sop_completions_delete' AND tablename = 'sop_completions'
    ) THEN
        CREATE POLICY "sop_completions_delete" ON sop_completions FOR DELETE USING (
            completed_by = auth.uid()
            OR public.is_master_admin_v2()
            OR public.is_org_admin_v2(organization_id)
            OR EXISTS (
                SELECT 1 FROM property_memberships
                WHERE user_id = auth.uid()
                AND property_id = sop_completions.property_id
                AND role IN ('property_admin')
            )
        );
    END IF;
END $$;
