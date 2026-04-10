-- =================================================================
-- ENABLE PASSWORD LOGIN (Manual Reset)
-- =================================================================
-- Supabase handles logins using the secure 'auth.users' table.
-- You cannot use 'public.users' for passwords.
-- Run this script to set a known password for your users.
-- =================================================================

-- 1. Ensure encryption extension is enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Set password for Harsh (Org Super Admin)
-- This sets the password to: 12345678
UPDATE auth.users
SET encrypted_password = crypt('12345678', gen_salt('bf'))
WHERE email = 'harshrp2309@gmail.com';

-- 3. Set password for Lohit (Master Admin)
-- This sets the password to: 12345678
UPDATE auth.users
SET encrypted_password = crypt('12345678', gen_salt('bf'))
WHERE email = 'ranganathanlohitaksha@gmail.com';

-- Usage:
-- Now you can go to your login page and sign in with:
-- Email: harshrp2309@gmail.com
-- Password: 12345678
