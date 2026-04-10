-- =========================================================
-- MIGRATION: Seed Default Skill Groups
-- Purpose: Ensure every property has the standard skill groups requried for onboarding
-- =========================================================

-- 1. Technical Support (Common)
INSERT INTO skill_groups (property_id, code, name, is_manual_assign)
SELECT id, 'technical', 'Technical Support', false
FROM properties p
WHERE NOT EXISTS (
    SELECT 1 FROM skill_groups sg 
    WHERE sg.property_id = p.id AND sg.code = 'technical'
);

-- 2. Plumbing (MST specific)
INSERT INTO skill_groups (property_id, code, name, is_manual_assign)
SELECT id, 'plumbing', 'Plumbing', false
FROM properties p
WHERE NOT EXISTS (
    SELECT 1 FROM skill_groups sg 
    WHERE sg.property_id = p.id AND sg.code = 'plumbing'
);

-- 3. Soft Services (Staff specific)
INSERT INTO skill_groups (property_id, code, name, is_manual_assign)
SELECT id, 'soft_services', 'Soft Services', false
FROM properties p
WHERE NOT EXISTS (
    SELECT 1 FROM skill_groups sg 
    WHERE sg.property_id = p.id AND sg.code = 'soft_services'
);

-- 4. Vendor Coordination (MST/Vendor specific)
-- Note: is_manual_assign = true typically for vendor coordination
INSERT INTO skill_groups (property_id, code, name, is_manual_assign)
SELECT id, 'vendor', 'Vendor Coordination', true
FROM properties p
WHERE NOT EXISTS (
    SELECT 1 FROM skill_groups sg 
    WHERE sg.property_id = p.id AND sg.code = 'vendor'
);

-- 5. Ensure resolver_stats policy allows insert during onboarding
-- (If not already handled by service role or specific RLS)
-- Checking if we need to adjust policies. 
-- Usually onboarding runs as authenticated user.
-- They need to be able to insert into resolver_stats for themselves.

-- Grant permissions / Policies check
-- Resolver stats RLS:
-- We need a policy to allow users to insert their *own* resolver_stats
-- IF it doesn't exist.

DO $$
BEGIN
    DROP POLICY IF EXISTS resolver_stats_insert_own ON resolver_stats;
    CREATE POLICY resolver_stats_insert_own ON resolver_stats 
    FOR INSERT 
    WITH CHECK (
        user_id = auth.uid()
        AND EXISTS (
             SELECT 1 FROM property_memberships pm 
             WHERE pm.user_id = auth.uid() 
             AND pm.property_id = resolver_stats.property_id
        )
    );
EXCEPTION 
    WHEN undefined_table THEN
        NULL; -- Handle case where table might not exist yet (though it should from evolution.sql)
END $$;
