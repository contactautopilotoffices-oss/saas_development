-- =========================================================
-- DIAGNOSTIC: Check Master Admin Setup
-- Run this to debug the login redirect issue
-- =========================================================

-- 1. Check if user exists in users table with correct flag
SELECT 
    id,
    email,
    full_name,
    is_master_admin,
    created_at
FROM users
WHERE email = 'ranganathanlohitaksha@gmail.com';

-- 2. Check auth users (this is Supabase's auth schema)
SELECT 
    id,
    email,
    created_at,
    last_sign_in_at
FROM auth.users
WHERE email = 'ranganathanlohitaksha@gmail.com';

-- 3. Check if auth ID matches users table ID
SELECT 
    'Auth User ID' as source, 
    id, 
    email 
FROM auth.users 
WHERE email = 'ranganathanlohitaksha@gmail.com'
UNION ALL
SELECT 
    'Users Table ID' as source, 
    id, 
    email 
FROM users 
WHERE email = 'ranganathanlohitaksha@gmail.com';

-- =========================================================
-- EXPECTED RESULTS:
-- - Query 1 should return your user with is_master_admin = true
-- - Query 2 should return your auth record
-- - Query 3 should show SAME ID for both records
-- 
-- IF IDs DON'T MATCH: That's the problem!
-- =========================================================
