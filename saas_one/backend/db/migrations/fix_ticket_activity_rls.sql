-- =========================================================
-- FIX: TICKET ACTIVITY LOG RLS POLICIES
-- Ensures timestamps on photos/videos are visible to all
-- authorized users (not just the creator of the activity).
-- =========================================================

-- Enable RLS just to be explicit (though if it wasn't enabled, everyone could read. 
-- Assuming it got enabled or we want to secure it properly).
ALTER TABLE public.ticket_activity_log ENABLE ROW LEVEL SECURITY;

-- 1. Drop existing policies on this table if any
DROP POLICY IF EXISTS "ticket_activity_log_select_policy" ON public.ticket_activity_log;
DROP POLICY IF EXISTS "ticket_activity_log_insert_policy" ON public.ticket_activity_log;
DROP POLICY IF EXISTS "ticket_activity_log_update_policy" ON public.ticket_activity_log;
DROP POLICY IF EXISTS "ticket_activity_log_delete_policy" ON public.ticket_activity_log;
DROP POLICY IF EXISTS "activity_log_read" ON public.ticket_activity_log;
DROP POLICY IF EXISTS "activity_log_insert" ON public.ticket_activity_log;

-- 2. Read Policy: Users can view activities for tickets they have access to read
CREATE POLICY "ticket_activity_log_select_policy" ON public.ticket_activity_log
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.tickets t 
    WHERE t.id = ticket_activity_log.ticket_id
  )
);

-- 3. Insert Policy: Users can insert activities if they can update the corresponding ticket
-- or if they are the authenticated user performing the action
CREATE POLICY "ticket_activity_log_insert_policy" ON public.ticket_activity_log
FOR INSERT WITH CHECK (
  auth.uid() = user_id
);

-- 4. Update Policy: Generally activity logs shouldn't be updated, but if needed,
-- only Master Admins can update them.
CREATE POLICY "ticket_activity_log_update_policy" ON public.ticket_activity_log
FOR UPDATE USING (
  public.is_master_admin_v2()
) WITH CHECK (
  public.is_master_admin_v2()
);

-- 5. Delete Policy: Only Master Admins
CREATE POLICY "ticket_activity_log_delete_policy" ON public.ticket_activity_log
FOR DELETE USING (
  public.is_master_admin_v2()
);

NOTIFY pgrst, 'reload schema';
