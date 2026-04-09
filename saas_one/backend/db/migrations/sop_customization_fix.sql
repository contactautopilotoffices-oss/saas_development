-- Migration: Add customization columns to SOP checklist tables
-- Description: Adds 'type' and 'is_optional' to sop_checklist_items and 'value' to sop_completion_items

-- Update sop_checklist_items
ALTER TABLE sop_checklist_items 
ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'checkbox',
ADD COLUMN IF NOT EXISTS is_optional BOOLEAN DEFAULT FALSE;

-- Update sop_completion_items
ALTER TABLE sop_completion_items
ADD COLUMN IF NOT EXISTS value TEXT;
