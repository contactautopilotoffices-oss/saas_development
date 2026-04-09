-- ============================================
-- Privacy-Aware App Usage Analytics
-- Session-based tracking for engagement insights
-- ============================================

-- User Sessions Table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_end TIMESTAMPTZ,
    duration_seconds INT,
    user_agent TEXT,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_start ON user_sessions(session_start);
CREATE INDEX IF NOT EXISTS idx_user_sessions_open ON user_sessions(user_id) WHERE session_end IS NULL;

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can view their own sessions
CREATE POLICY "Users can view own sessions" ON user_sessions
    FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own sessions
CREATE POLICY "Users can insert own sessions" ON user_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own sessions (for activity pings)
CREATE POLICY "Users can update own sessions" ON user_sessions
    FOR UPDATE USING (auth.uid() = user_id);

-- Admins can view all sessions
CREATE POLICY "Admins can view all sessions" ON user_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM organization_memberships om
            WHERE om.user_id = auth.uid()
            AND om.role IN ('admin', 'super_admin', 'owner')
            AND om.is_active = true
        )
    );

-- ============================================
-- Auto-Close Stale Sessions Function
-- Called periodically to close sessions with >15min inactivity
-- ============================================
CREATE OR REPLACE FUNCTION close_stale_sessions()
RETURNS INTEGER AS $$
DECLARE
    closed_count INTEGER;
BEGIN
    WITH closed AS (
        UPDATE user_sessions
        SET 
            session_end = last_activity + INTERVAL '15 minutes',
            duration_seconds = EXTRACT(EPOCH FROM (last_activity - session_start))::INT
        WHERE session_end IS NULL
        AND last_activity < NOW() - INTERVAL '15 minutes'
        RETURNING id
    )
    SELECT COUNT(*) INTO closed_count FROM closed;
    
    RETURN closed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Aggregated Metrics View for Admin Dashboard
-- ============================================
CREATE OR REPLACE VIEW user_engagement_metrics AS
SELECT 
    u.id AS user_id,
    u.full_name,
    u.email,
    
    -- Last Activity
    MAX(s.last_activity) AS last_active,
    
    -- Sessions this week
    COUNT(CASE WHEN s.session_start >= NOW() - INTERVAL '7 days' THEN 1 END) AS sessions_this_week,
    
    -- Average session duration (seconds)
    ROUND(AVG(s.duration_seconds) FILTER (WHERE s.duration_seconds IS NOT NULL))::INT AS avg_duration_seconds,
    
    -- Total sessions
    COUNT(s.id) AS total_sessions,
    
    -- Engagement Level calculation
    CASE 
        WHEN COUNT(CASE WHEN s.session_start >= NOW() - INTERVAL '7 days' THEN 1 END) >= 10 
             AND AVG(s.duration_seconds) FILTER (WHERE s.duration_seconds IS NOT NULL) >= 600 
        THEN 'high'
        WHEN COUNT(CASE WHEN s.session_start >= NOW() - INTERVAL '7 days' THEN 1 END) >= 3 
        THEN 'medium'
        ELSE 'low'
    END AS engagement_level

FROM users u
LEFT JOIN user_sessions s ON u.id = s.user_id
GROUP BY u.id, u.full_name, u.email;

-- Grant access to the view
GRANT SELECT ON user_engagement_metrics TO authenticated;

-- ============================================
-- Scheduled Job: Auto-close stale sessions
-- Run every 5 minutes via pg_cron (if available)
-- ============================================
-- Uncomment if pg_cron is enabled:
-- SELECT cron.schedule('close-stale-sessions', '*/5 * * * *', 'SELECT close_stale_sessions()');
