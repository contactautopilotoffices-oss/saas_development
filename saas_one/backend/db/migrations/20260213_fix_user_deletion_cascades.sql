-- =========================================================
-- FIX USER DELETION CASCADES
-- Ensures all references to users(id) do not block deletion.
-- =========================================================

DO $$
BEGIN
    -- 1. Tickets Table
    -- raised_by must be nullable to allow SET NULL
    ALTER TABLE tickets ALTER COLUMN raised_by DROP NOT NULL;
    
    -- Update constraints for tickets
    -- We need to drop the old ones first if we want to be sure, but we can just add new ones if we know the names or use a script.
    -- Since we don't know the exact constraint names, we'll try to drop them by looking them up or just adding them.
    -- Better way: drop the constraint by column and recreate.
END $$;

-- Helper to drop and recreate constraint with SET NULL
-- (Using DROP CONSTRAINT if it exists is hard without names, but we can try to guess or use pg_constraint)

-- Tickets
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_raised_by_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_assigned_to_fkey;
ALTER TABLE tickets ADD CONSTRAINT tickets_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL;

-- Ticket Comments
ALTER TABLE ticket_comments DROP CONSTRAINT IF EXISTS ticket_comments_user_id_fkey;
ALTER TABLE ticket_comments ADD CONSTRAINT ticket_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Ticket Activity Log
ALTER TABLE ticket_activity_log DROP CONSTRAINT IF EXISTS ticket_activity_log_user_id_fkey;
ALTER TABLE ticket_activity_log ADD CONSTRAINT ticket_activity_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Electricity Readings
ALTER TABLE electricity_readings DROP CONSTRAINT IF EXISTS electricity_readings_created_by_fkey;
ALTER TABLE electricity_readings ADD CONSTRAINT electricity_readings_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Diesel Readings
ALTER TABLE diesel_readings DROP CONSTRAINT IF EXISTS diesel_readings_created_by_fkey;
ALTER TABLE diesel_readings ADD CONSTRAINT diesel_readings_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- Property Activities
ALTER TABLE property_activities DROP CONSTRAINT IF EXISTS property_activities_created_by_fkey;
ALTER TABLE property_activities ADD CONSTRAINT property_activities_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- VMS Tickets
ALTER TABLE vms_tickets DROP CONSTRAINT IF EXISTS vms_tickets_reported_by_fkey;
ALTER TABLE vms_tickets ADD CONSTRAINT vms_tickets_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL;

-- Vendors
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_user_id_fkey;
ALTER TABLE vendors ADD CONSTRAINT vendors_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Utility Meta Tables
ALTER TABLE meter_multipliers DROP CONSTRAINT IF EXISTS meter_multipliers_created_by_fkey;
ALTER TABLE meter_multipliers ADD CONSTRAINT meter_multipliers_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE grid_tariffs DROP CONSTRAINT IF EXISTS grid_tariffs_created_by_fkey;
ALTER TABLE grid_tariffs ADD CONSTRAINT grid_tariffs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE dg_tariffs DROP CONSTRAINT IF EXISTS dg_tariffs_created_by_fkey;
ALTER TABLE dg_tariffs ADD CONSTRAINT dg_tariffs_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
