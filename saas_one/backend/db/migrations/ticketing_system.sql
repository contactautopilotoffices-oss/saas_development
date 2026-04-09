-- =========================================================
-- TICKETING SYSTEM FOR TECHNICAL SUPPORT
-- Allows clients to raise bugs/issues, Master Admin resolves
-- =========================================================

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL, -- 'broken_feature', 'performance', 'bug', 'other'
  status text DEFAULT 'open', -- 'open', 'in_progress', 'resolved', 'closed'
  priority text DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
  assigned_to uuid REFERENCES users(id), -- Master Admin who takes the ticket
  work_started_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ticket comments/updates
CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  comment text NOT NULL,
  is_internal boolean DEFAULT false, -- Only visible to Master Admin
  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_property ON tickets(property_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_raised_by ON tickets(raised_by);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- Enable RLS
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tickets
-- Users can view tickets from their organization
DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets FOR SELECT 
  USING (
    -- User is in the organization
    organization_id IN (
      SELECT organization_id FROM organization_memberships 
      WHERE user_id = auth.uid()
    )
    -- OR user is Master Admin
    OR public.is_master_admin()
  );

-- Users can create tickets for their organization
DROP POLICY IF EXISTS tickets_insert ON tickets;
CREATE POLICY tickets_insert ON tickets FOR INSERT
  WITH CHECK (
    raised_by = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Only Master Admin can update tickets
DROP POLICY IF EXISTS tickets_update ON tickets;
CREATE POLICY tickets_update ON tickets FOR UPDATE
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- No one can delete tickets (soft delete via status instead)
DROP POLICY IF EXISTS tickets_delete ON tickets;
CREATE POLICY tickets_delete ON tickets FOR DELETE
  USING (false);

-- RLS Policies for ticket_comments
-- Users can view comments on tickets they can see
DROP POLICY IF EXISTS ticket_comments_select ON ticket_comments;
CREATE POLICY ticket_comments_select ON ticket_comments FOR SELECT
  USING (
    ticket_id IN (SELECT id FROM tickets)
    AND (
      -- Non-internal comments visible to all
      NOT is_internal
      -- Internal comments only to Master Admin
      OR public.is_master_admin()
    )
  );

-- Users can add comments to tickets they can see
DROP POLICY IF EXISTS ticket_comments_insert ON ticket_comments;
CREATE POLICY ticket_comments_insert ON ticket_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND ticket_id IN (SELECT id FROM tickets)
  );

-- Only comment author or Master Admin can update
DROP POLICY IF EXISTS ticket_comments_update ON ticket_comments;
CREATE POLICY ticket_comments_update ON ticket_comments FOR UPDATE
  USING (
    user_id = auth.uid() 
    OR public.is_master_admin()
  );

-- Trigger to update tickets.updated_at
CREATE OR REPLACE FUNCTION update_ticket_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ticket_comments_update_timestamp ON ticket_comments;
CREATE TRIGGER ticket_comments_update_timestamp
  AFTER INSERT OR UPDATE ON ticket_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_ticket_timestamp();

NOTIFY pgrst, 'reload schema';
