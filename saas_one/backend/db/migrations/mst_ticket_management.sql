-- =========================================================
-- MST TICKET MANAGEMENT SYSTEM
-- Adds department classification, work pause states, and 
-- new status values for MST-driven ticket workflow
-- =========================================================

-- 1. Create department enum type
DO $$ BEGIN
  CREATE TYPE public.ticket_department AS ENUM ('technical', 'soft_services', 'vendor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add department column to tickets
ALTER TABLE public.tickets 
  ADD COLUMN IF NOT EXISTS department public.ticket_department DEFAULT 'technical';

-- 3. Add work-level pause fields (separate from SLA pause)
-- These track when an MST explicitly pauses work on a ticket
ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS work_paused boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS work_paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS work_pause_reason text,
  ADD COLUMN IF NOT EXISTS work_paused_by uuid REFERENCES public.users(id);

-- 4. Create indexes for efficient department queries
CREATE INDEX IF NOT EXISTS idx_tickets_department ON public.tickets(department);
CREATE INDEX IF NOT EXISTS idx_tickets_property_department ON public.tickets(property_id, department);
CREATE INDEX IF NOT EXISTS idx_tickets_property_status ON public.tickets(property_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status ON public.tickets(assigned_to, status);

-- 5. Create a view for MST workload tracking
CREATE OR REPLACE VIEW public.mst_workload AS
SELECT 
  u.id as user_id,
  u.full_name,
  pm.property_id,
  COUNT(t.id) FILTER (WHERE t.status IN ('assigned', 'in_progress') AND t.work_paused = false) as active_tickets,
  COUNT(t.id) FILTER (WHERE t.work_paused = true) as paused_tickets,
  COUNT(t.id) FILTER (WHERE t.status = 'closed' AND t.resolved_at > now() - interval '7 days') as completed_this_week,
  COALESCE(rs.is_available, true) as is_available
FROM public.users u
JOIN public.property_memberships pm ON pm.user_id = u.id
LEFT JOIN public.tickets t ON t.assigned_to = u.id AND t.property_id = pm.property_id
LEFT JOIN public.resolver_stats rs ON rs.user_id = u.id AND rs.property_id = pm.property_id
WHERE pm.role IN ('mst', 'staff')
GROUP BY u.id, u.full_name, pm.property_id, rs.is_available;

-- 6. Function to auto-classify ticket department based on description
CREATE OR REPLACE FUNCTION public.classify_ticket_department(description text)
RETURNS public.ticket_department
LANGUAGE plpgsql
AS $$
DECLARE
  lower_desc text := lower(description);
BEGIN
  -- Check for vendor-related keywords first (most specific)
  IF lower_desc ~ '(lift|elevator|escalator|signage|amc|fire\s*alarm|cctv|security\s*system|access\s*control)' THEN
    RETURN 'vendor';
  END IF;
  
  -- Check for soft services keywords
  IF lower_desc ~ '(clean|spill|pantry|washroom|toilet|bathroom|dust|hygiene|housekeep|trash|garbage|pest|saniti)' THEN
    RETURN 'soft_services';
  END IF;
  
  -- Default to technical (covers electrical, plumbing, HVAC, etc.)
  RETURN 'technical';
END;
$$;

-- 7. Trigger to auto-set department on ticket creation if not provided
CREATE OR REPLACE FUNCTION public.auto_classify_ticket_department()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only auto-classify if department is not explicitly set or is default
  IF NEW.department IS NULL OR NEW.department = 'technical' THEN
    NEW.department := public.classify_ticket_department(COALESCE(NEW.description, '') || ' ' || COALESCE(NEW.title, ''));
  END IF;
  
  -- Auto-transition to waitlist status for new tickets
  IF NEW.status = 'open' AND OLD IS NULL THEN
    NEW.status := 'waitlist';
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ticket_auto_classify ON public.tickets;
CREATE TRIGGER ticket_auto_classify
  BEFORE INSERT ON public.tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_classify_ticket_department();

-- 8. Update RLS policies to allow MSTs to self-assign tickets in their property
DROP POLICY IF EXISTS tickets_mst_update ON public.tickets;
CREATE POLICY tickets_mst_update ON public.tickets FOR UPDATE
  USING (
    -- MST can update tickets in their property
    EXISTS (
      SELECT 1 FROM public.property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = tickets.property_id
        AND pm.role IN ('mst', 'staff', 'property_admin')
    )
    -- Or is master admin
    OR public.is_master_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = tickets.property_id
        AND pm.role IN ('mst', 'staff', 'property_admin')
    )
    OR public.is_master_admin()
  );

-- 9. Comment for documentation
COMMENT ON COLUMN public.tickets.department IS 'Department classification: technical, soft_services, or vendor';
COMMENT ON COLUMN public.tickets.work_paused IS 'Whether work on this ticket is explicitly paused by MST';
COMMENT ON COLUMN public.tickets.work_pause_reason IS 'Reason provided when pausing work';

NOTIFY pgrst, 'reload schema';
