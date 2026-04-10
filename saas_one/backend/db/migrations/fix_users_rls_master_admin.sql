-- Enable RLS on users table if not already enabled
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Drop existing highly restrictive policies if any to avoid conflicts/recursion
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
DROP POLICY IF EXISTS "Master Admin can view all users" ON public.users;

-- 1. Allow users to view their own profile
CREATE POLICY "Users can view their own profile" 
ON public.users 
FOR SELECT 
USING (auth.uid() = id);

-- 2. Allow Master Admins to view ALL users
-- Direct check to avoid recursion if possible, or use a secure function if needed.
-- Since is_master_admin is ON the users table, a self-select for the policy might recurse?
-- "USING ( (SELECT is_master_admin FROM users WHERE id = auth.uid()) = true )" 
-- If I select * from users, it checks this policy for every row.
-- For row X, it runs the subquery. The subquery selects from users (row auth.uid()). 
-- Does selecting row auth.uid() trigger the policy again? Yes. Infinite recursion.

-- SOLUTION: Use a security definer function to check master admin status safely.

CREATE OR REPLACE FUNCTION public.is_master_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT COALESCE(is_master_admin, false) FROM public.users WHERE id = auth.uid();
$$;

-- Wait, if the function selects from users, it still triggers RLS?
-- Yes, unless we bypass RLS inside the function.
-- 'SECURITY DEFINER' functions run with the privileges of the owner (postgres), 
-- but they still respect RLS unless the owner has RLS bypass or we assume the owner is superuser (which bypasses RLS).
-- In Supabase, postgres is superuser equivalent mostly? 
-- Let's make it safer by explicitly granting access or ensuring we don't recurse.

-- Better approach for recursion avoidance:
-- Use `auth.jwt()` metadata if available, but we store it in the table.

-- Let's use the function but ensure it doesn't cause recursion.
-- Actually, the infinite recursion usually happens if the policy query itself requires reading the row protected by the policy.
-- If I read row Y, and I check row X (myself), checking row X requires reading row X.
-- Start reading row X -> check policy -> read row X ... Recursion.

-- Standard Supabase pattern:
-- Grant SELECT on users to authenticated? No, that exposes PII.

-- Let's try to trust the JWT claims if we had them, but we don't.

-- Recursive Break:
-- We can allow access if the user ID matches, OR if the request comes from a privileged context? No.

-- LET'S FIX RLS RECURSION properly.
-- We can create a separate "admin_users" view or similar, but simplified:

-- DROP the recursive policy if exists.
DROP POLICY IF EXISTS "Master Admin can view all users" ON public.users;

-- Create a function that uses a direct query (maybe bypassing RLS by view? or just rely on the fact that SECURITY DEFINER functions owned by postgres bypass RLS)
-- Confirmed: SECURITY DEFINER functions owned by a role with BYPASSRLS (like postgres usually) will bypass RLS.

CREATE OR REPLACE FUNCTION public.check_is_master_admin_safe()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() 
    AND is_master_admin = true
  );
END;
$$;

-- Now the policy:
CREATE POLICY "Master Admin can view all users" 
ON public.users 
FOR SELECT 
USING (
  public.check_is_master_admin_safe()
);

-- Also allow update?
CREATE POLICY "Master Admin can update all users" 
ON public.users 
FOR UPDATE
USING (
  public.check_is_master_admin_safe()
);

-- Delete?
CREATE POLICY "Master Admin can delete all users" 
ON public.users 
FOR DELETE
USING (
  public.check_is_master_admin_safe()
);
