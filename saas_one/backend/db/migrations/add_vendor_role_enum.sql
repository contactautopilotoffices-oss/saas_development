-- Add 'vendor' to app_role enum safely
DO $$
BEGIN
  ALTER TYPE app_role ADD VALUE 'vendor';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
