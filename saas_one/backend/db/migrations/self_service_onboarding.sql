-- =========================================================
-- SELF-SERVICE ONBOARDING SETUP (ROBUST FIX)
-- =========================================================

-- 1. Ensure user record trigger is robust
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), users.full_name);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Organizations: Allow authenticated users to view active ones
DROP POLICY IF EXISTS orgs_browse_for_signup ON organizations;
CREATE POLICY orgs_browse_for_signup ON organizations
FOR SELECT TO authenticated
USING (true); -- Full transparency for browsing during onboarding

-- 3. Properties: Allow authenticated users to view active ones
DROP POLICY IF EXISTS props_browse_for_signup ON properties;
CREATE POLICY props_browse_for_signup ON properties
FOR SELECT TO authenticated
USING (true); -- Full transparency for browsing during onboarding

-- 4. Memberships: Allow ALL authenticated users to self-enroll (INSERT/UPDATE/SELECT)
-- This fixes the 400 error on UPSERT (which needs both INSERT and UPDATE)

-- Organization Memberships
DROP POLICY IF EXISTS org_membership_self_service ON organization_memberships;
CREATE POLICY org_membership_self_service ON organization_memberships
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Property Memberships
DROP POLICY IF EXISTS prop_membership_self_service ON property_memberships;
CREATE POLICY prop_membership_self_service ON property_memberships
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- 5. Finalize
NOTIFY pgrst, 'reload schema';
