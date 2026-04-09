-- FIX: Master Admin User Directory Access
-- Removes recursion while allowing Master Admins to see all users.

-- 1. Ensure the helper function is robust
CREATE OR REPLACE FUNCTION public.is_master_admin_v2()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_master boolean;
BEGIN
  -- Use a direct scalar subquery to minimize overhead and potentially avoid some recursion triggers
  SELECT is_master_admin INTO v_is_master
  FROM public.users
  WHERE id = auth.uid();
  
  RETURN COALESCE(v_is_master, false);
END;
$$;

-- Ensure it's owned by postgres to bypass RLS inside the function
ALTER FUNCTION public.is_master_admin_v2 OWNER TO postgres;

-- 2. Update Users Table Policy
-- We use a policy that doesn't call itself in a way that the planner finds recursive.
-- Standard practice: "is_master_admin" bypass

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_master" ON public.users;
DROP POLICY IF EXISTS "users_read_self" ON public.users;

-- Policy 1: Everyone can read their own profile
CREATE POLICY "users_read_self" ON public.users 
FOR SELECT USING (auth.uid() = id);

-- Policy 2: Master Admins can read everyone
-- Note: If recursion still occurs, we may need to use JWT claims or a separate table.
-- But SECURITY DEFINER owned by postgres should handle this.
CREATE POLICY "users_read_master" ON public.users 
FOR SELECT USING ( public.is_master_admin_v2() );

-- 3. Diagnostics (Optional but helpful for logging if we were running this interactively)
-- We'll just reload the schema for now.
NOTIFY pgrst, 'reload schema';
