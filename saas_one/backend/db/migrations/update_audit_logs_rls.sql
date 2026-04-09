-- =========================================================
-- UPDATE: audit_logs RLS policy
-- Master admins can read all entries.
-- Property admins and org super admins can read entries
-- they created (event_by = auth.uid()).
-- =========================================================

-- Drop existing read policy
DROP POLICY IF EXISTS audit_logs_read_policy ON public.audit_logs;

-- Master admins can see everything; others can see their own entries
CREATE POLICY audit_logs_read_policy ON public.audit_logs
  FOR SELECT
  TO authenticated
  USING (
    -- Master admin: read all
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
      AND is_master_admin = true
    )
    -- Any authenticated admin/staff: read their own audit entries
    OR event_by = auth.uid()
  );

-- Inserts come from the server-side admin client only — no user INSERT policy needed.
-- Deny direct user inserts (no INSERT policy means DENY for non-service-role).

NOTIFY pgrst, 'reload schema';
