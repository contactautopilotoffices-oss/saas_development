-- Migration: Add time window support and make assignment optional on sop_templates
-- Date: 2026-03-18
--
-- Changes:
--   1. Drop the old frequency check constraint (only allowed daily/weekly/monthly/on_demand)
--      and replace it with one that also allows every_N_hours values.
--   2. Add start_time and end_time columns (TIME, nullable) to sop_templates.
--   3. assigned_to is already TEXT[] with default '{}' — empty array = open to all staff.
--      No schema change needed; we update application logic to treat {} as "open".

-- Step 1: Drop old constraint
ALTER TABLE sop_templates
    DROP CONSTRAINT IF EXISTS sop_templates_frequency_check;

-- Step 2: Add updated constraint that includes hourly options
ALTER TABLE sop_templates
    ADD CONSTRAINT sop_templates_frequency_check
    CHECK (frequency IN (
        'daily', 'weekly', 'monthly', 'on_demand',
        'every_1_hour', 'every_2_hours', 'every_3_hours',
        'every_4_hours', 'every_6_hours', 'every_8_hours', 'every_12_hours'
    ));

-- Step 3: Add time window columns
ALTER TABLE sop_templates
    ADD COLUMN IF NOT EXISTS start_time TIME DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS end_time   TIME DEFAULT NULL;

COMMENT ON COLUMN sop_templates.start_time IS 'Window start time (e.g. 10:00). Only relevant for hourly/periodic frequencies. NULL = no restriction.';
COMMENT ON COLUMN sop_templates.end_time   IS 'Window end time (e.g. 17:00). Checklist is due only between start_time and end_time on each day.';
COMMENT ON COLUMN sop_templates.assigned_to IS 'Array of user IDs assigned to this checklist. Empty array = open to all property staff.';
