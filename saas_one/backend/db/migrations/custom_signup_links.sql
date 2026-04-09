-- =========================================================
-- CUSTOM SIGNUP LINKS / INVITE CODES
-- Master Admin can generate property-specific signup links
-- =========================================================

-- Invite links table
CREATE TABLE IF NOT EXISTS invite_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  role app_role NOT NULL DEFAULT 'tenant',
  invitation_code text UNIQUE NOT NULL, -- e.g., "INV_xyz123"
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  max_uses integer DEFAULT 1,
  current_uses integer DEFAULT 0,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}', -- For additional context (e.g., reason, notes)
  created_at timestamptz DEFAULT now()
);

-- Invite link usage tracking
CREATE TABLE IF NOT EXISTS invite_link_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_link_id uuid NOT NULL REFERENCES invite_links(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id), -- User who used the link
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
-- Master Admin and org admins can view
DROP POLICY IF EXISTS invite_links_select ON invite_links;
CREATE POLICY invite_links_select ON invite_links FOR SELECT
  USING (
    public.is_master_admin()
    OR organization_id IN (
      SELECT organization_id FROM organization_memberships 
      WHERE user_id = auth.uid() AND role IN ('org_super_admin', 'master_admin')
    )
  );

-- Only Master Admin can create invite links
DROP POLICY IF EXISTS invite_links_insert ON invite_links;
CREATE POLICY invite_links_insert ON invite_links FOR INSERT
  WITH CHECK (public.is_master_admin());

-- Master Admin can update (e.g., deactivate)
DROP POLICY IF EXISTS invite_links_update ON invite_links;
CREATE POLICY invite_links_update ON invite_links FOR UPDATE
  USING (public.is_master_admin())
  WITH CHECK (public.is_master_admin());

-- No deletes (keep for audit trail)
DROP POLICY IF EXISTS invite_links_delete ON invite_links;
CREATE POLICY invite_links_delete ON invite_links FOR DELETE
  USING (false);

-- RLS for invite_link_usage
-- Master Admin can view all usage
DROP POLICY IF EXISTS invite_link_usage_select ON invite_link_usage;
CREATE POLICY invite_link_usage_select ON invite_link_usage FOR SELECT
  USING (public.is_master_admin());

-- System can insert usage records
DROP POLICY IF EXISTS invite_link_usage_insert ON invite_link_usage;
CREATE POLICY invite_link_usage_insert ON invite_link_usage FOR INSERT
  WITH CHECK (true); -- Open for signup flow

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
  -- Get the invite link
  SELECT * INTO v_link FROM invite_links 
  WHERE invitation_code = p_code
    AND is_active = true
    AND expires_at > now()
    AND current_uses < max_uses
  FOR UPDATE;

  -- If not found or invalid
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'valid', false,
      'error', 'Invalid or expired invitation code'
    );
  END IF;

  -- Increment usage counter
  UPDATE invite_links 
  SET current_uses = current_uses + 1
  WHERE id = v_link.id;

  -- Log the usage
  INSERT INTO invite_link_usage (invite_link_id, user_id)
  VALUES (v_link.id, auth.uid());

  -- Return link details
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

NOTIFY pgrst, 'reload schema';
