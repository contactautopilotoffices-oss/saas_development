-- FIX: Permissions and Ownership
-- Problem: 'permission denied for table users' (42501) suggests 'authenticated' role
-- lacks basic SELECT grants, or SECURITY DEFINER functions aren't owned by superuser.

-- 1. Ensure 'authenticated' role has SQL-level SELECT permission
-- (RLS policies will then restrict which rows they see)
GRANT SELECT ON public.users TO authenticated;
GRANT SELECT ON public.organizations TO authenticated;
GRANT SELECT ON public.properties TO authenticated;
GRANT SELECT ON public.organization_memberships TO authenticated;
GRANT SELECT ON public.property_memberships TO authenticated;
GRANT SELECT ON public.property_activities TO authenticated;

-- 2. Ensure SECURITY DEFINER functions are owned by postgres (superuser)
-- This guarantees they bypass RLS when executed
ALTER FUNCTION public.is_master_admin_v2 OWNER TO postgres;
ALTER FUNCTION public.is_org_member_v2 OWNER TO postgres;
ALTER FUNCTION public.is_property_member_v2 OWNER TO postgres;
ALTER FUNCTION public.is_org_admin_v2 OWNER TO postgres;

-- 3. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
