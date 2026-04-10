-- Add optional per-step time windows to sop_checklist_items.
-- A step with start_time/end_time should only be actioned within that window.

ALTER TABLE sop_checklist_items ADD COLUMN IF NOT EXISTS start_time TIME;
ALTER TABLE sop_checklist_items ADD COLUMN IF NOT EXISTS end_time TIME;
