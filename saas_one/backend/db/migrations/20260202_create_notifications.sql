-- Migration: Create notifications table

CREATE TABLE IF NOT EXISTS notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  type text NOT NULL, -- ticket_assigned, sla_warning, admin_reminder
  recipient_role text NOT NULL, -- MST, ADMIN
  recipient_id uuid REFERENCES users(id),
  title text NOT NULL,
  body text NOT NULL,
  entity_id text,
  timestamp timestamptz DEFAULT now(),
  read boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can see their own notifications"
ON notifications FOR SELECT
USING (recipient_id = auth.uid());

CREATE POLICY "Admins can see admin notifications"
ON notifications FOR SELECT
USING (recipient_role = 'ADMIN');

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
