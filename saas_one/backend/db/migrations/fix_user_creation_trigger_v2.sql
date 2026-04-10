-- ================================================
-- Fix User Creation Trigger
-- ================================================
-- This migration fixes the handle_new_user function to insert into 'public.users' 
-- instead of 'public.user_profiles' which does not exist.
-- ================================================

-- 1. Create the fixed trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (
    id,
    full_name,
    email
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email),
    NEW.email
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(EXCLUDED.full_name, users.full_name),
    email = EXCLUDED.email;
  
  RETURN NEW;
END;
$$;

-- 2. Grant execute permission
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO supabase_auth_admin; -- Ensure auth system can call it

-- 3. Recreate the trigger on auth.users to ensure it uses the updated function
-- Note: This block needs to be run by a superuser or via the Supabase Dashboard SQL Editor
DO $$
BEGIN
  -- Drop existing trigger if it exists to clean up
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
    
  RAISE NOTICE 'Trigger on_auth_user_created recreated successfully pointing to public.users';
END$$;
