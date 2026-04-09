-- =========================================================
-- SET MASTER ADMIN FLAG FOR YOUR USER
-- Run this SQL in Supabase SQL Editor
-- =========================================================

-- STEP 1: Find your user ID (check what email you're logging in with)
-- Replace 'your-email@example.com' with your actual login email
SELECT id, email, full_name, is_master_admin 
FROM users 
WHERE email = 'your-email@example.com';

-- STEP 2: Set Master Admin flag
-- Replace 'your-user-id-here' with the ID from Step 1
UPDATE users 
SET is_master_admin = true 
WHERE id = 'your-user-id-here';

-- ALTERNATIVE: Set by email directly (easier)
UPDATE users 
SET is_master_admin = true 
WHERE email = 'your-email@example.com';

-- STEP 3: Verify it worked
SELECT id, email, full_name, is_master_admin 
FROM users 
WHERE is_master_admin = true;

-- =========================================================
-- EXPECTED RESULT: You should see your user with is_master_admin = true
-- =========================================================
