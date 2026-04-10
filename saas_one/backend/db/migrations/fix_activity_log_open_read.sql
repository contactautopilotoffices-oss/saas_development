-- =========================================================
-- FIX: Allow any authenticated user to read ticket_activity_log
-- This ensures photo/video timestamps are visible to all users
-- regardless of who uploaded them.
-- =========================================================

-- Drop ALL existing SELECT policies on ticket_activity_log
DROP POLICY IF EXISTS "ticket_activity_log_select_policy" ON public.ticket_activity_log;
DROP POLICY IF EXISTS "activity_log_read" ON public.ticket_activity_log;
DROP POLICY IF EXISTS "Users can view activity for their tickets" ON public.ticket_activity_log;
DROP POLICY IF EXISTS "ticket_activity_log_read" ON public.ticket_activity_log;

-- Simple open read: any authenticated user can read all activity log entries
CREATE POLICY "ticket_activity_log_select_policy" ON public.ticket_activity_log
FOR SELECT USING (
  auth.role() = 'authenticated'
);

NOTIFY pgrst, 'reload schema';
