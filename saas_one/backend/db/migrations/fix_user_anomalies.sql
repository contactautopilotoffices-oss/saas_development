-- ================================================
-- Fix User Data Anomalies
-- ================================================

-- 1. Remove Erroneous Organization Membership for Master Admin
-- (Deleting memberships for specific email)
DELETE FROM public.organization_memberships
WHERE user_id IN (
    SELECT id FROM public.users 
    WHERE email = 'ranganathanlohitaksha@gmail.com'
);

-- 2. Fix 'Harsh' (Org Super Admin) - Missing Membership
-- Insert the missing membership if it doesn't verify
-- NOTE: We need the Organization ID for 'infosys-work' (based on screenshot context)
-- We will try to find the organization by name.

DO $$
DECLARE
    v_user_id uuid;
    v_org_id uuid;
BEGIN
    -- Get User ID for Harsh
    SELECT id INTO v_user_id FROM public.users WHERE email = 'harshrp2309@gmail.com';
    
    -- Get Organization ID (assuming 'infosys-work' is the name based on context, or just pick the first org found if specific one unknown?)
    -- Let's try to match 'infosys-work' or generic fallback
    SELECT id INTO v_org_id FROM public.organizations WHERE name = 'infosys-work' LIMIT 1;
    
    -- Safety check: if we found both, insert
    IF v_user_id IS NOT NULL AND v_org_id IS NOT NULL THEN
        -- Insert if not exists
        IF NOT EXISTS (SELECT 1 FROM public.organization_memberships WHERE user_id = v_user_id AND organization_id = v_org_id) THEN
            INSERT INTO public.organization_memberships (user_id, organization_id, role, is_active)
            VALUES (v_user_id, v_org_id, 'org_super_admin', true);
            
            RAISE NOTICE 'Fixed membership for Harsh';
        ELSE
            RAISE NOTICE 'Membership for Harsh already exists';
        END IF;
    ELSE
        RAISE NOTICE 'Could not fix Harsh: User or Org not found (User: %, Org: %)', v_user_id, v_org_id;
    END IF;
END $$;
