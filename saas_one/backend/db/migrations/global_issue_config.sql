-- =========================================================
-- MIGRATION: Global Issue Categories & Keywords Schema
-- Purpose: Create tables for Master Admin Issue Configuration
-- that works globally across all properties.
-- =========================================================

-- 1. Ensure skill_groups table allows NULL property_id for global groups
DO $$
BEGIN
    -- Check if skill_groups exists and modify constraint if needed
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'skill_groups') THEN
        -- Drop the unique constraint that requires property_id if it exists
        ALTER TABLE skill_groups DROP CONSTRAINT IF EXISTS skill_groups_property_id_code_key;
        
        -- Add a new unique constraint on just code for global skill groups
        -- (Allow both property-specific and global skill groups)
        ALTER TABLE skill_groups DROP CONSTRAINT IF EXISTS skill_groups_global_code_key;
        ALTER TABLE skill_groups ADD CONSTRAINT skill_groups_global_code_key 
            UNIQUE (code) WHERE property_id IS NULL;
    END IF;
END $$;

-- 2. Create issue_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS issue_categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    skill_group_id uuid REFERENCES skill_groups(id) ON DELETE SET NULL,
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Add unique constraint for global categories (property_id IS NULL)
DO $$
BEGIN
    -- Drop existing constraint if it exists
    ALTER TABLE issue_categories DROP CONSTRAINT IF EXISTS issue_categories_property_id_code_key;
    -- Create unique constraint for property-specific categories
    ALTER TABLE issue_categories ADD CONSTRAINT issue_categories_property_id_code_key 
        UNIQUE (property_id, code);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add partial unique index for global categories (code must be unique when property_id IS NULL)
DROP INDEX IF EXISTS issue_categories_global_code_idx;
CREATE UNIQUE INDEX issue_categories_global_code_idx 
    ON issue_categories (code) 
    WHERE property_id IS NULL;

-- 3. Create issue_keywords table 
CREATE TABLE IF NOT EXISTS issue_keywords (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_category_id uuid NOT NULL REFERENCES issue_categories(id) ON DELETE CASCADE,
    keyword text NOT NULL,
    match_type text DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'regex')),
    created_at timestamptz DEFAULT now(),
    UNIQUE (issue_category_id, keyword)
);

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_issue_categories_skill_group ON issue_categories(skill_group_id);
CREATE INDEX IF NOT EXISTS idx_issue_categories_property ON issue_categories(property_id);
CREATE INDEX IF NOT EXISTS idx_issue_categories_code ON issue_categories(code);
CREATE INDEX IF NOT EXISTS idx_issue_keywords_category ON issue_keywords(issue_category_id);
CREATE INDEX IF NOT EXISTS idx_issue_keywords_keyword ON issue_keywords(keyword);

-- 5. Enable RLS
ALTER TABLE issue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_keywords ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for issue_categories
DROP POLICY IF EXISTS issue_categories_read_all ON issue_categories;
CREATE POLICY issue_categories_read_all ON issue_categories
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS issue_categories_admin_write ON issue_categories;
CREATE POLICY issue_categories_admin_write ON issue_categories
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.is_master_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.is_master_admin = true
        )
    );

-- 7. RLS Policies for issue_keywords
DROP POLICY IF EXISTS issue_keywords_read_all ON issue_keywords;
CREATE POLICY issue_keywords_read_all ON issue_keywords
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS issue_keywords_admin_write ON issue_keywords;
CREATE POLICY issue_keywords_admin_write ON issue_keywords
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.is_master_admin = true
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() 
            AND u.is_master_admin = true
        )
    );

-- 8. Insert global skill groups if they don't exist
INSERT INTO skill_groups (property_id, code, name, description, is_manual_assign)
VALUES 
    (NULL, 'plumbing', 'Plumbing', 'Water and plumbing related issues', false),
    (NULL, 'soft_services', 'Soft Services', 'Housekeeping, cleaning, and furniture issues', false),
    (NULL, 'technical', 'Technical', 'Electrical, AC, network, and lighting issues', false),
    (NULL, 'vendor', 'Vendor Coordination', 'Lift, fire, and external vendor issues', true)
ON CONFLICT DO NOTHING;

-- 9. Grant permissions
GRANT SELECT ON issue_categories TO authenticated;
GRANT SELECT ON issue_keywords TO authenticated;
GRANT ALL ON issue_categories TO service_role;
GRANT ALL ON issue_keywords TO service_role;
