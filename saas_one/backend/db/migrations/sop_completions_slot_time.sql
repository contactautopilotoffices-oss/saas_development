-- Add slot_time to sop_completions so hourly checklists deduplicate per slot,
-- not just per day. One completion per (template, property, date, slot).

ALTER TABLE sop_completions ADD COLUMN IF NOT EXISTS slot_time TIME;

-- Index for fast slot-level deduplication lookups
CREATE INDEX IF NOT EXISTS sop_completions_slot_idx
    ON sop_completions (template_id, property_id, completion_date, slot_time);
