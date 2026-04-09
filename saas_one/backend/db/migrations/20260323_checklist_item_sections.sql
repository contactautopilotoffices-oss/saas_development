-- Add section_title to sop_checklist_items to support grouping
ALTER TABLE sop_checklist_items ADD COLUMN IF NOT EXISTS section_title TEXT;
