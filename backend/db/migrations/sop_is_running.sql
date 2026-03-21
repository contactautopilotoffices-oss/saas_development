-- Separate "template exists" (is_active) from "schedule is live" (is_running).
-- New templates start with is_running = false until admin explicitly starts them.

ALTER TABLE sop_templates ADD COLUMN IF NOT EXISTS is_running BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sop_templates ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;

-- Existing active templates: treat them as already running so nothing breaks
UPDATE sop_templates SET is_running = true WHERE is_active = true;
-- Backfill started_at for already-running templates using created_at as best estimate
UPDATE sop_templates SET started_at = created_at WHERE is_running = true AND started_at IS NULL;
