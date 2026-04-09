-- Track which checklist slots have already been alerted to avoid duplicate notifications.
-- The unique constraint on (template_id, slot_time) ensures each missed slot fires exactly once.

CREATE TABLE IF NOT EXISTS sop_missed_alerts (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID        NOT NULL REFERENCES sop_templates(id) ON DELETE CASCADE,
    slot_time   TIMESTAMPTZ NOT NULL,   -- the scheduled time of the missed slot
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (template_id, slot_time)
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS sop_missed_alerts_created_at_idx ON sop_missed_alerts (created_at);

-- Auto-purge rows older than 30 days (optional: run via pg_cron or manual cleanup)
-- DELETE FROM sop_missed_alerts WHERE created_at < now() - interval '30 days';
