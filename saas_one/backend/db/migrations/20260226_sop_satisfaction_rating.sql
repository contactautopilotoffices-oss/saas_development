-- ============================================================
-- SOP Checklist: Per-item satisfaction rating by admins
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Add satisfaction columns to sop_completion_items
ALTER TABLE sop_completion_items
    ADD COLUMN IF NOT EXISTS satisfaction_rating SMALLINT CHECK (satisfaction_rating BETWEEN 1 AND 3),
    ADD COLUMN IF NOT EXISTS satisfaction_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS satisfaction_at     TIMESTAMPTZ;

-- 2. Allow admins (property_admin / org_admin / org_super_admin) to UPDATE
--    the satisfaction columns on any completion item within their org/property.
--    The existing RLS policy for sop_completion_items allows SELECT/INSERT/UPDATE
--    only for the completing user or admins. We add an explicit admin update policy.

-- Drop if re-running
DROP POLICY IF EXISTS "Admins can rate sop completion items" ON sop_completion_items;

CREATE POLICY "Admins can rate sop completion items"
ON sop_completion_items
FOR UPDATE
USING (
    EXISTS (
        SELECT 1
        FROM sop_completions sc
        JOIN property_members pm ON pm.property_id = sc.property_id
        WHERE sc.id = sop_completion_items.completion_id
          AND pm.user_id = auth.uid()
          AND pm.role IN ('property_admin', 'org_admin', 'org_super_admin', 'master_admin')
          AND pm.is_active = TRUE
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM sop_completions sc
        JOIN property_members pm ON pm.property_id = sc.property_id
        WHERE sc.id = sop_completion_items.completion_id
          AND pm.user_id = auth.uid()
          AND pm.role IN ('property_admin', 'org_admin', 'org_super_admin', 'master_admin')
          AND pm.is_active = TRUE
    )
);
