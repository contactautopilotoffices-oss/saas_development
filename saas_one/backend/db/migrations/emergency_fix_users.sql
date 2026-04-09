-- EMERGENCY FIX: Drop Recursive Policy
-- Problem: 'users_read_master' causes infinite recursion during login because
-- it calls is_master_admin_v2() which queries 'users'.
-- Even with SECURITY DEFINER, this is causing stability issues.

-- 1. Drop the problematic policy
DROP POLICY IF EXISTS "users_read_master" ON public.users;

-- 2. Ensure 'users_read_self' is the ONLY policy active for now
DROP POLICY IF EXISTS "users_read_self" ON public.users;
CREATE POLICY "users_read_self" ON public.users FOR SELECT USING (auth.uid() = id);

-- 3. Reload Schema
NOTIFY pgrst, 'reload schema';
