-- Migration: Rename Soft Service Supervisor to Manager
-- Created: 2026-02-21
-- Description: Standardize naming for soft service management role

DO $$
BEGIN
  -- Add soft_service_manager role if it doesn't exist
  BEGIN
    ALTER TYPE app_role ADD VALUE 'soft_service_manager';
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;
END $$;

-- Update existing memberships from supervisor to manager
UPDATE property_memberships 
SET role = 'soft_service_manager' 
WHERE role = 'soft_service_supervisor';

UPDATE organization_memberships 
SET role = 'soft_service_manager' 
WHERE role = 'soft_service_supervisor';

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
