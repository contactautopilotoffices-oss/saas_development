-- =================================================================
-- BOOTSTRAP MASTER ADMIN USER (Auth + DB)
-- =================================================================
-- This script creates a user in Supabase Auth AND sets them as Master Admin.
-- It sets a default password 'admin123' if the user doesn't exist.
-- =================================================================

DO c:\Users\harsh\OneDrive\Desktop\autopilot\saas_one
DECLARE
  new_uid uuid;
  -- CHANGE THESE VALUES IF NEEDED ----------------------------------
  target_email text := 'lohit@example.com';  -- The email you want to use
  target_password text := 'admin123';         -- The password to log in with
  -- -------------------------------------------------------------
BEGIN
  -- 1. Check if auth user exists
  SELECT id INTO new_uid FROM auth.users WHERE email = target_email;

  -- 2. If NOT exists, create auth user
  IF new_uid IS NULL THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      recovery_token,
      email_change_token_new,
      email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(),
      'authenticated',
      'authenticated',
      target_email,
      crypt(target_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(),
      now(),
      '', '', '', ''
    ) RETURNING id INTO new_uid;
    
    RAISE NOTICE 'Created new Auth User: %', target_email;
  ELSE
    -- If exists, UPDATE the password so you can definitely login
    UPDATE auth.users 
    SET encrypted_password = crypt(target_password, gen_salt('bf'))
    WHERE id = new_uid;
    
    RAISE NOTICE 'Updated password for existing Auth User: %', target_email;
  END IF;

  -- 3. Ensure public user exists and is master admin
  INSERT INTO public.users (id, email, full_name, is_master_admin)
  VALUES (new_uid, target_email, 'Master Admin', true)
  ON CONFLICT (id) DO UPDATE
  SET 
    is_master_admin = true,
    email = EXCLUDED.email; -- syncing email just in case

  RAISE NOTICE 'SUCCESS: User % is now a Master Admin with password %', target_email, target_password;
END c:\Users\harsh\OneDrive\Desktop\autopilot\saas_one;
