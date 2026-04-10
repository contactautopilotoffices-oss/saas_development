-- FIX: Broaden Organization Access Policy
-- Problem: Property Admins/Staff need to read Organization details (for headers/context) 
-- but 'org_read_member' only checked organization_memberships.

CREATE OR REPLACE FUNCTION public.is_org_member_v2(p_org_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Check direct org membership (Org Admin, etc.)
  IF EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = auth.uid()
    AND organization_id = p_org_id
  ) THEN
    RETURN true;
  END IF;

  -- 2. Check property membership linked to this org (Property Admin, Staff, Tenant)
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

-- Notify pgrst to reload schema cache
NOTIFY pgrst, 'reload schema';
