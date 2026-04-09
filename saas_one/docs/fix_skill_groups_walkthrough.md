# Fix: Skill Groups Error

The error `Failed to fetch skill groups: {}` typically indicates a permission issue (Row Level Security) or that the `skill_groups` table hasn't been properly initialized in your database yet.

I have created a fix migration that will:
1. Ensure the `skill_groups` table exists.
2. Enable Row Level Security (RLS) on it.
3. Add a policy allowing all authenticated users to **read** the skill groups (necessary for the onboarding dropdowns).
4. Re-seed the default skills (Technical, Plumbing, Soft Services, Vendor) for all your properties.

## Instructions

1. Copy the SQL below.
2. Go to your Supabase Dashboard -> **SQL Editor**.
3. Paste the SQL and click **Run**.
4. Try the onboarding flow again.

### SQL to Run (`migrations/fix_skill_groups_permissions.sql`)

```sql
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
```
