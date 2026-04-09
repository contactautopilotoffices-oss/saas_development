-- FIX: Robust Organization Access via Property Join
-- Uses SAFE JOIN through 'properties' table to verify org membership
-- This avoids relying on potentially missing 'organization_id' in property_memberships

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

  -- 2. Check property membership -> Property -> Organization
  IF EXISTS (
    SELECT 1 
    FROM public.property_memberships pm
    JOIN public.properties p ON p.id = pm.property_id
    WHERE pm.user_id = auth.uid()
    AND p.organization_id = p_org_id
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

NOTIFY pgrst, 'reload schema';
