-- =========================================================
-- MASTER ADMIN SYSTEM - COMPLETE SETUP
-- Single consolidated migration file
-- Run this entire file in Supabase SQL Editor
-- =========================================================

-- =========================================================
-- PART 1: TICKETING SYSTEM
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
  assigned_to uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Ticket comments/updates
CREATE TABLE IF NOT EXISTS ticket_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  comment text NOT NULL,
  is_internal boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes for tickets
CREATE INDEX IF NOT EXISTS idx_tickets_org ON tickets(organization_id);
CREATE INDEX IF NOT EXISTS idx_tickets_property ON tickets(property_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_raised_by ON tickets(raised_by);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- Enable RLS
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_comments ENABLE ROW LEVEL SECURITY;

-- RLS Policies for tickets
DROP POLICY IF EXISTS tickets_select ON tickets;
CREATE POLICY tickets_select ON tickets FOR SELECT 
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships 
      WHERE user_id = auth.uid()
    )
    OR public.is_master_admin()
  );

DROP POLICY IF EXISTS tickets_insert ON tickets;
CREATE POLICY tickets_insert ON tickets FOR INSERT
  WITH CHECK (
    raised_by = auth.uid()
    AND organization_id IN (
      SELECT organization_id FROM organization_memberships 
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tickets_update ON tickets;
CREATE POLICY tickets_update ON tickets FOR UPDATE
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS tickets_delete ON tickets;
CREATE POLICY tickets_delete ON tickets FOR DELETE
  USING (false);

-- RLS Policies for ticket_comments
DROP POLICY IF EXISTS ticket_comments_select ON ticket_comments;
CREATE POLICY ticket_comments_select ON ticket_comments FOR SELECT
  USING (
    ticket_id IN (SELECT id FROM tickets)
    AND (
      NOT is_internal
      OR public.is_master_admin()
    )
  );

DROP POLICY IF EXISTS ticket_comments_insert ON ticket_comments;
CREATE POLICY ticket_comments_insert ON ticket_comments FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND ticket_id IN (SELECT id FROM tickets)
  );

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

-- =========================================================
-- PART 2: FEATURE USAGE ANALYTICS
-- =========================================================

-- Feature usage logs table
CREATE TABLE IF NOT EXISTS feature_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  feature_name text NOT NULL,
  action text NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_feature_usage_org ON feature_usage_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_feature_usage_property ON feature_usage_logs(property_id);
CREATE INDEX IF NOT EXISTS idx_feature_usage_feature ON feature_usage_logs(feature_name);
CREATE INDEX IF NOT EXISTS idx_feature_usage_created ON feature_usage_logs(created_at);

-- Enable RLS
ALTER TABLE feature_usage_logs ENABLE ROW LEVEL SECURITY;

-- RLS: Only Master Admin can read feature usage logs
DROP POLICY IF EXISTS feature_usage_select ON feature_usage_logs;
CREATE POLICY feature_usage_select ON feature_usage_logs FOR SELECT
  USING (public.is_master_admin());

-- Anyone can insert (automatic tracking)
DROP POLICY IF EXISTS feature_usage_insert ON feature_usage_logs;
CREATE POLICY feature_usage_insert ON feature_usage_logs FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- No updates or deletes (append-only log)
DROP POLICY IF EXISTS feature_usage_update ON feature_usage_logs;
CREATE POLICY feature_usage_update ON feature_usage_logs FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS feature_usage_delete ON feature_usage_logs;
CREATE POLICY feature_usage_delete ON feature_usage_logs FOR DELETE
  USING (false);

-- Materialized view for aggregated analytics
DROP MATERIALIZED VIEW IF EXISTS feature_usage_summary CASCADE;
CREATE MATERIALIZED VIEW feature_usage_summary AS
SELECT 
  organization_id,
  feature_name,
  COUNT(*) as usage_count,
  COUNT(DISTINCT user_id) as unique_users,
  MAX(created_at) as last_used,
  DATE_TRUNC('day', created_at) as usage_date
FROM feature_usage_logs
GROUP BY organization_id, feature_name, DATE_TRUNC('day', created_at);

-- Index on materialized view
CREATE INDEX IF NOT EXISTS idx_feature_summary_org ON feature_usage_summary(organization_id);
CREATE INDEX IF NOT EXISTS idx_feature_summary_date ON feature_usage_summary(usage_date);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_feature_usage_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY feature_usage_summary;
END;
$$ LANGUAGE plpgsql;

-- Helper function to log feature usage
CREATE OR REPLACE FUNCTION log_feature_usage(
  p_organization_id uuid,
  p_property_id uuid,
  p_feature_name text,
  p_action text,
  p_metadata jsonb DEFAULT '{}'
)
RETURNS void AS $$
BEGIN
  INSERT INTO feature_usage_logs (organization_id, property_id, user_id, feature_name, action, metadata)
  VALUES (p_organization_id, p_property_id, auth.uid(), p_feature_name, p_action, p_metadata);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION log_feature_usage TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_feature_usage_summary TO authenticated;

-- =========================================================
-- PART 3: CUSTOM SIGNUP LINKS / INVITE CODES
-- =========================================================

-- Invite links table
CREATE TABLE IF NOT EXISTS invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'tenant',
  invitation_code text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  max_uses integer DEFAULT 1,
  current_uses integer DEFAULT 0,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Invite link usage tracking
CREATE TABLE IF NOT EXISTS invite_link_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_link_id uuid NOT NULL REFERENCES invite_links(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id),
  used_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invite_links_org ON invite_links(organization_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_property ON invite_links(property_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_code ON invite_links(invitation_code);
CREATE INDEX IF NOT EXISTS idx_invite_links_active ON invite_links(is_active, expires_at);

-- Enable RLS
ALTER TABLE invite_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_link_usage ENABLE ROW LEVEL SECURITY;

-- RLS for invite_links
DROP POLICY IF EXISTS invite_links_select ON invite_links;
CREATE POLICY invite_links_select ON invite_links FOR SELECT
  USING (
    public.is_master_admin()
    OR organization_id IN (
      SELECT organization_id FROM organization_memberships 
      WHERE user_id = auth.uid() AND role IN ('org_super_admin', 'master_admin')
    )
  );

DROP POLICY IF EXISTS invite_links_insert ON invite_links;
CREATE POLICY invite_links_insert ON invite_links FOR INSERT
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS invite_links_update ON invite_links;
CREATE POLICY invite_links_update ON invite_links FOR UPDATE
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

DROP POLICY IF EXISTS invite_links_delete ON invite_links;
CREATE POLICY invite_links_delete ON invite_links FOR DELETE
  USING (false);

-- RLS for invite_link_usage
DROP POLICY IF EXISTS invite_link_usage_select ON invite_link_usage;
CREATE POLICY invite_link_usage_select ON invite_link_usage FOR SELECT
  USING (public.is_master_admin());

DROP POLICY IF EXISTS invite_link_usage_insert ON invite_link_usage;
CREATE POLICY invite_link_usage_insert ON invite_link_usage FOR INSERT
  WITH CHECK (true);

-- Function to generate unique invite code
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS text AS $$
BEGIN
  RETURN 'INV_' || upper(encode(gen_random_bytes(8), 'hex'));
END;
$$ LANGUAGE plpgsql;

-- Function to validate and use invite link
CREATE OR REPLACE FUNCTION use_invite_link(p_code text)
RETURNS jsonb AS $$
DECLARE
  v_link invite_links;
  v_result jsonb;
BEGIN
  SELECT * INTO v_link FROM invite_links 
  WHERE invitation_code = p_code
    AND is_active = true
    AND expires_at > now()
    AND current_uses < max_uses
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Invalid or expired invitation code'
    );
  END IF;

  UPDATE invite_links 
  SET current_uses = current_uses + 1
  WHERE id = v_link.id;

  INSERT INTO invite_link_usage (invite_link_id, user_id)
  VALUES (v_link.id, auth.uid());

  RETURN jsonb_build_object(
    'valid', true,
    'organization_id', v_link.organization_id,
    'property_id', v_link.property_id,
    'role', v_link.role
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION generate_invite_code TO authenticated;
GRANT EXECUTE ON FUNCTION use_invite_link TO authenticated;

-- =========================================================
-- PART 4: SET MASTER ADMIN FLAG
-- =========================================================

-- ⚠️ IMPORTANT: Replace 'your-email@example.com' with YOUR actual login email!

UPDATE users 
SET is_master_admin = true 
WHERE email = 'ranganathanlohitaksha@gmail.com';  

-- Verify it worked (should return your user with is_master_admin = true)
SELECT id, email, full_name, is_master_admin 
FROM users 
WHERE is_master_admin = true;

-- =========================================================
-- SETUP COMPLETE! 
-- =========================================================
-- Next steps:
-- 1. Verify the SELECT query above shows your user
-- 2. Clear browser cache or use incognito mode
-- 3. Login at http://localhost:3000/login
-- 4. You should be redirected to http://localhost:3000/master
-- =========================================================

NOTIFY pgrst, 'reload schema';
