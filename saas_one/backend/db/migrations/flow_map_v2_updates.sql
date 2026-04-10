-- Migration to add fields required for Ticket Flow Map V2
-- Adding tracking for assignment, acceptance, and MST presence

-- 1. Update tickets table
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- 2. Update users table for MST presence
ALTER TABLE users
ADD COLUMN IF NOT EXISTS online_status text DEFAULT 'offline', -- 'online', 'offline', 'busy'
ADD COLUMN IF NOT EXISTS last_seen_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS team text; -- e.g., 'technical', 'plumbing', etc.

-- 3. Update the ticket assignment logic to set assigned_at automatically
CREATE OR REPLACE FUNCTION set_ticket_assigned_at()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.assigned_to IS NOT NULL AND (OLD.assigned_to IS NULL OR NEW.assigned_to != OLD.assigned_to)) THEN
    NEW.assigned_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_ticket_assigned_at ON tickets;
CREATE TRIGGER trg_set_ticket_assigned_at
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION set_ticket_assigned_at();

-- 4. Update the work started logic to set accepted_at automatically
CREATE OR REPLACE FUNCTION set_ticket_accepted_at()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'in_progress' AND OLD.status != 'in_progress') THEN
    NEW.accepted_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_ticket_accepted_at ON tickets;
CREATE TRIGGER trg_set_ticket_accepted_at
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION set_ticket_accepted_at();
