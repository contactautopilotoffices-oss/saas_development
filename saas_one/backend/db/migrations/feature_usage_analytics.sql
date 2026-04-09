-- =========================================================
-- FEATURE USAGE ANALYTICS
-- Track feature usage per organization for analytics
-- =========================================================

-- Feature usage logs table
CREATE TABLE IF NOT EXISTS feature_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  feature_name text NOT NULL, -- 'ticketing', 'viewer', 'analytics', 'procurement', 'visitors'
  action text NOT NULL, -- 'accessed', 'created', 'updated', 'viewed', etc.
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

-- Function to refresh materialized view (call via cron or manually)
CREATE OR REPLACE FUNCTION refresh_feature_usage_summary()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY feature_usage_summary;
END;
$$ LANGUAGE plpgsql;

-- Helper function to log feature usage (call from frontend)
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

NOTIFY pgrst, 'reload schema';
