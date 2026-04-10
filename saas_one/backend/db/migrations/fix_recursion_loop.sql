-- FIX RECURSION: Remove dependency on 'properties' table
-- by using the denormalized 'organization_id' on property_memberships.

CREATE OR REPLACE FUNCTION public.is_org_member_v2(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Check direct org membership
  IF EXISTS (
    SELECT 1 FROM public.organization_memberships 
    WHERE user_id = auth.uid() 
    AND organization_id = p_org_id
  ) THEN
    RETURN true;
  END IF;

  -- 2. Check property membership using denormalized column
  -- This AVOIDS reading 'properties' table, preventing recursion loops
  IF EXISTS (
    SELECT 1 FROM public.property_memberships 
    WHERE user_id = auth.uid() 
    AND organization_id = p_org_id
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;
ALTER FUNCTION public.is_org_member_v2 OWNER TO postgres;

NOTIFY pgrst, 'reload schema';
