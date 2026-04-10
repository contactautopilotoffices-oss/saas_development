-- Migration: Add Soft Service Roles
-- Created: 2026-02-20
-- Description: Add soft_service_staff and soft_service_supervisor to app_role enum

-- Safe additive approach (idempotent) - follows pattern from evolution.sql
DO $$
BEGIN
  -- Add soft_service_staff role
  BEGIN
    ALTER TYPE app_role ADD VALUE 'soft_service_staff';
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;

  -- Add soft_service_supervisor role
  BEGIN
    ALTER TYPE app_role ADD VALUE 'soft_service_supervisor';
  EXCEPTION
    WHEN duplicate_object THEN null;
  END;
END $$;

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
