-- "NUCLEAR OPTION" PERMISSION FIX
-- 1. Grant Low-Level SQL Privileges (Fixes 42501)
GRANT USERAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.users TO authenticated;
GRANT SELECT ON TABLE public.organizations TO authenticated;
GRANT SELECT ON TABLE public.properties TO authenticated;
GRANT SELECT ON TABLE public.organization_memberships TO authenticated;
GRANT SELECT ON TABLE public.property_memberships TO authenticated;
GRANT SELECT ON TABLE public.property_activities TO authenticated;

-- 2. Drop Potentially Conflicting/Legacy Policies
DROP POLICY IF EXISTS "org_read_member" ON public.organizations;
DROP POLICY IF EXISTS "org_read_master" ON public.organizations;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.organizations;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.organizations;
DROP POLICY IF EXISTS "Public organizations are viewable by everyone." ON public.organizations;

-- 3. Re-Define Safe Functions (SECURITY DEFINER + OWNER POSTGRES)
CREATE OR REPLACE FUNCTION public.is_master_admin_v2()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Safe check running as superuser
  RETURN COALESCE(
    (SELECT is_master_admin FROM public.users WHERE id = auth.uid()),
    false
  );
END;
$$;
ALTER FUNCTION public.is_master_admin_v2 OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_master_admin_v2 TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_master_admin_v2 TO anon;

-- Re-define Org Member check with Join (Safe)
CREATE OR REPLACE FUNCTION public.is_org_member_v2(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.organization_memberships WHERE user_id = auth.uid() AND organization_id = p_org_id) THEN
    RETURN true;
  END IF;
  IF EXISTS (SELECT 1 FROM public.property_memberships pm JOIN public.properties p ON p.id = pm.property_id WHERE pm.user_id = auth.uid() AND p.organization_id = p_org_id) THEN
    RETURN true;
  END IF;
  RETURN false;
END;
$$;
ALTER FUNCTION public.is_org_member_v2 OWNER TO postgres;
GRANT EXECUTE ON FUNCTION public.is_org_member_v2 TO authenticated;

-- 4. Re-Apply Clean V2 Policies
CREATE POLICY "org_read_member" ON public.organizations FOR SELECT USING ( public.is_org_member_v2(id) );
CREATE POLICY "org_read_master" ON public.organizations FOR ALL USING ( public.is_master_admin_v2() );

-- 5. Fix Users Table Policy (Allow reading own profile)
DROP POLICY IF EXISTS "users_read_self" ON public.users;
CREATE POLICY "users_read_self" ON public.users FOR SELECT USING (auth.uid() = id);

NOTIFY pgrst, 'reload schema';
