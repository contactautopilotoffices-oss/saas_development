-- =========================================================
-- SCHEMA REPAIR: Add property_id to skill_groups if missing
-- =========================================================

DO $$ 
BEGIN 
    -- 1. Check if property_id column exists in skill_groups
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='skill_groups' AND column_name='property_id'
    ) THEN
        -- Add property_id column
        ALTER TABLE skill_groups ADD COLUMN property_id uuid REFERENCES properties(id) ON DELETE CASCADE;
        
        -- If we have existing data and multiple properties, we might need to handle it.
        -- But usually, this error happens when the table is empty or just created wrong.
        
        -- Re-add the unique constraint
        ALTER TABLE skill_groups DROP CONSTRAINT IF EXISTS skill_groups_property_id_code_key;
        ALTER TABLE skill_groups ADD CONSTRAINT skill_groups_property_id_code_key UNIQUE(property_id, code);
    END IF;

    -- 2. Check if property_id column exists in issue_categories
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='issue_categories' AND column_name='property_id'
    ) THEN
        -- Add property_id column
        ALTER TABLE issue_categories ADD COLUMN property_id uuid REFERENCES properties(id) ON DELETE CASCADE;
        
        -- Re-add the unique constraint
        ALTER TABLE issue_categories DROP CONSTRAINT IF EXISTS issue_categories_property_id_code_key;
        ALTER TABLE issue_categories ADD CONSTRAINT issue_categories_property_id_code_key UNIQUE(property_id, code);
    END IF;
END $$;
