-- ================================================
-- User Profile Auto-Creation Trigger
-- ================================================
-- This trigger automatically creates a user_profiles entry
-- when a new user is created in auth.users
-- 
-- Run this SQL in Supabase SQL Editor or via migration
-- ================================================

-- 1. Create the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    auth_user_id,
    full_name,
    username,
    metadata
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    COALESCE(
      NEW.raw_user_meta_data ->> 'username',
      LOWER(REPLACE(SPLIT_PART(NEW.email, '@', 1), '.', '_'))
    ),
    COALESCE(NEW.raw_user_meta_data, '{}'::jsonb)
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, user_profiles.full_name),
    metadata = user_profiles.metadata || EXCLUDED.metadata,
    updated_at = now();
  
  RETURN NEW;
END;
$$;

-- 2. Grant execute permission
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- 3. Create the trigger on auth.users
-- Note: This requires superuser/owner privileges on auth schema
DO $$
BEGIN
  -- Drop existing trigger if it exists
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created' 
    AND tgrelid = 'auth.users'::regclass
  ) THEN
    DROP TRIGGER on_auth_user_created ON auth.users;
  END IF;
  
  -- Create the trigger
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();
    
  RAISE NOTICE 'Trigger on_auth_user_created created successfully';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Insufficient privileges to create trigger on auth.users. Please run as database owner.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Error creating trigger: %', SQLERRM;
END$$;

-- ================================================
-- Verification Query
-- ================================================
-- Run this to verify the trigger exists:
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname = 'on_auth_user_created';
