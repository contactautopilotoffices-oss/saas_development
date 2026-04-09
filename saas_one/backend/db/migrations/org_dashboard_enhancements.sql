-- =========================================================
-- ORGANIZATION DASHBOARD ENHANCEMENTS
-- Complete migration for property creation, user metrics, module analytics
-- =========================================================

-- =========================================================
-- PART 1: USER ACTIVITY TRACKING
-- =========================================================

-- Add activity tracking columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity timestamptz DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login timestamptz;

-- Create trigger function to update user activity
CREATE OR REPLACE FUNCTION update_user_activity()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_activity = NOW();
  IF OLD.first_login IS NULL THEN
    NEW.first_login = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to users table (on any update)
DROP TRIGGER IF EXISTS trigger_update_user_activity ON users;
CREATE TRIGGER trigger_update_user_activity
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_user_activity();

-- Create index for activity queries
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity);
CREATE INDEX IF NOT EXISTS idx_users_first_login ON users(first_login);

-- =========================================================
-- PART 2: PROPERTY CODE AUTO-GENERATION
-- =========================================================

-- Function to generate sequential property codes per organization
CREATE OR REPLACE FUNCTION generate_property_code(p_org_id uuid)
RETURNS text AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count 
  FROM properties 
  WHERE organization_id = p_org_id;
  
  RETURN 'PROP-' || LPAD((v_count + 1)::TEXT, 3, '0');
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION generate_property_code TO authenticated;

-- =========================================================
-- PART 3: USER STATUS CLASSIFICATION
-- =========================================================

-- View to classify users as active, inactive, or dead
DROP VIEW IF EXISTS user_status_summary CASCADE;
CREATE VIEW user_status_summary AS
SELECT 
  om.organization_id,
  CASE 
    WHEN u.last_activity < NOW() - INTERVAL '60 days' AND u.first_login IS NULL THEN 'dead'
    WHEN u.last_activity < NOW() - INTERVAL '30 days' THEN 'inactive'
    ELSE 'active'
  END as status,
  COUNT(*) as count
FROM users u
INNER JOIN organization_memberships om ON u.id = om.user_id
WHERE om.organization_id IS NOT NULL
GROUP BY om.organization_id, status;

-- Grant access to view
GRANT SELECT ON user_status_summary TO authenticated;

-- =========================================================
-- PART 4: MODULE USAGE ANALYTICS
-- =========================================================

-- View for module adoption per organization (last 30 days)
DROP VIEW IF EXISTS module_usage_summary CASCADE;
CREATE VIEW module_usage_summary AS
SELECT 
  organization_id,
  feature_name as module_name,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) as total_uses,
  MAX(created_at) as last_used
FROM feature_usage_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY organization_id, feature_name;

GRANT SELECT ON module_usage_summary TO authenticated;

-- =========================================================
-- PART 5: STORAGE METRICS FUNCTION
-- =========================================================

-- Function to get storage usage per property
-- NOTE: This is a placeholder - implement based on your actual storage tracking
CREATE OR REPLACE FUNCTION get_org_storage_usage(p_org_id uuid)
RETURNS TABLE(
  property_id uuid,
  property_name text,
  storage_bytes bigint
) AS $$
BEGIN
  -- Placeholder implementation
  -- Replace with actual storage calculation logic
  RETURN QUERY
  SELECT 
    p.id as property_id,
    p.name as property_name,
    0::bigint as storage_bytes
  FROM properties p
  WHERE p.organization_id = p_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_org_storage_usage TO authenticated;

-- =========================================================
-- PART 6: RLS POLICIES FOR PROPERTY CREATION
-- =========================================================

-- Master Admin can create properties
DROP POLICY IF EXISTS ma_create_properties ON properties;
CREATE POLICY ma_create_properties ON properties
FOR INSERT TO authenticated
WITH CHECK (public.is_master_admin());

-- Master Admin can update properties
DROP POLICY IF EXISTS ma_update_properties ON properties;
CREATE POLICY ma_update_properties ON properties
FOR UPDATE TO authenticated
USING (public.is_master_admin());

-- =========================================================
-- PART 7: HELPER FUNCTIONS
-- =========================================================

-- Function to get organization metrics summary
CREATE OR REPLACE FUNCTION get_org_metrics(p_org_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
  v_total_users integer;
  v_active_users integer;
  v_inactive_users integer;
  v_dead_users integer;
  v_properties_count integer;
BEGIN
  -- Count total users (via organization_memberships)
  SELECT COUNT(DISTINCT user_id) INTO v_total_users
  FROM organization_memberships
  WHERE organization_id = p_org_id;
  
  -- Get user status counts
  SELECT 
    COALESCE(SUM(CASE WHEN status = 'active' THEN count ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'inactive' THEN count ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN status = 'dead' THEN count ELSE 0 END), 0)
  INTO v_active_users, v_inactive_users, v_dead_users
  FROM user_status_summary
  WHERE organization_id = p_org_id;
  
  -- Count properties
  SELECT COUNT(*) INTO v_properties_count
  FROM properties
  WHERE organization_id = p_org_id;
  
  v_result := jsonb_build_object(
    'total_users', v_total_users,
    'user_status', jsonb_build_object(
      'active', v_active_users,
      'inactive', v_inactive_users,
      'dead', v_dead_users
    ),
    'properties', v_properties_count
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_org_metrics TO authenticated;

-- =========================================================
-- PART 8: REFRESH MATERIALIZED VIEW (IF NEEDED)
-- =========================================================

-- If you want to create a materialized view instead of a regular view
-- for better performance, uncomment and use this:

/*
DROP MATERIALIZED VIEW IF EXISTS module_usage_summary_mv CASCADE;
CREATE MATERIALIZED VIEW module_usage_summary_mv AS
SELECT 
  organization_id,
  feature_name as module_name,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) as total_uses,
  MAX(created_at) as last_used
FROM feature_usage_logs
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY organization_id, feature_name;

CREATE INDEX IF NOT EXISTS idx_module_usage_org ON module_usage_summary_mv(organization_id);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_module_usage()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY module_usage_summary_mv;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION refresh_module_usage TO authenticated;
*/

-- =========================================================
-- SETUP COMPLETE
-- =========================================================

NOTIFY pgrst, 'reload schema';
