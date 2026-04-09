-- =========================================================
-- FIX: Skill Groups Permissions & Data
-- Purpose: Ensure skill_groups table exists, has RLS enabled, 
-- and is readable by authenticated users.
-- =========================================================

-- 1. Ensure Table Exists (Idempotent)
CREATE TABLE IF NOT EXISTS skill_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_manual_assign boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(property_id, code)
);

-- 2. Enable RLS
ALTER TABLE skill_groups ENABLE ROW LEVEL SECURITY;

-- 3. Add Read Policy (Allow any authenticated user to read skill groups)
-- Ideally this should be scoped to property members, but for onboarding 
-- (where membership is just being created), a broader read is safer and low risk.
DO $$
BEGIN
    DROP POLICY IF EXISTS skill_groups_read_all ON skill_groups;
    CREATE POLICY skill_groups_read_all ON skill_groups 
    FOR SELECT 
    TO authenticated 
    USING (true);
EXCEPTION 
    WHEN undefined_object THEN NULL;
END $$;

-- 4. Seed Data (Idempotent upsert)
-- We'll use a DO block to loop properties and insert defaults if missing.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM properties LOOP
        -- Technical
        INSERT INTO skill_groups (property_id, code, name, is_manual_assign)
        VALUES (r.id, 'technical', 'Technical Support', false)
        ON CONFLICT (property_id, code) DO NOTHING;

        -- Plumbing
        INSERT INTO skill_groups (property_id, code, name, is_manual_assign)
        VALUES (r.id, 'plumbing', 'Plumbing', false)
        ON CONFLICT (property_id, code) DO NOTHING;

        -- Soft Services
        INSERT INTO skill_groups (property_id, code, name, is_manual_assign)
        VALUES (r.id, 'soft_services', 'Soft Services', false)
        ON CONFLICT (property_id, code) DO NOTHING;

        -- Vendor
        INSERT INTO skill_groups (property_id, code, name, is_manual_assign)
        VALUES (r.id, 'vendor', 'Vendor Coordination', true)
        ON CONFLICT (property_id, code) DO NOTHING;
    END LOOP;
END $$;
