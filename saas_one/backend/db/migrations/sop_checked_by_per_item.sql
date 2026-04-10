-- Migration: Add checked_by column to sop_completion_items
-- Tracks which user checked/completed each individual checklist item

ALTER TABLE sop_completion_items
ADD COLUMN IF NOT EXISTS checked_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_sop_completion_items_checked_by ON sop_completion_items(checked_by);
