-- =========================================================
-- SEED DEFAULT ORGANIZATION: Autopilot Offices
-- Safe • Idempotent
-- =========================================================

-- Ensure the organization exists
INSERT INTO public.organizations (name, code)
VALUES ('Autopilot Offices', 'autopilot')
ON CONFLICT (code) DO NOTHING;

-- Optionally, set it as the default if we ever add a 'is_default' column
-- ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;
-- UPDATE organizations SET is_default = TRUE WHERE code = 'autopilot';

-- Ensure some properties exist for the default org
DO $$
DECLARE
    org_id UUID;
BEGIN
    SELECT id INTO org_id FROM organizations WHERE code = 'autopilot';
    
    INSERT INTO public.properties (name, code, organization_id, status)
    VALUES 
        ('Main Campus', 'main-campus', org_id, 'active'),
        ('Executive Suites', 'exec-suites', org_id, 'active')
    ON CONFLICT (code) DO NOTHING;
END $$;
