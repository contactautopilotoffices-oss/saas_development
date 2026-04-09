-- Issue Categorization & Skill Group Mapping Tables
-- Run this in Supabase SQL Editor

-- Table: issue_categories
-- Stores issue category definitions (e.g., ac_breakdown, water_leakage)
CREATE TABLE IF NOT EXISTS issue_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    skill_group_id UUID REFERENCES skill_groups(id) ON DELETE SET NULL,
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table: issue_keywords
-- Stores keywords/phrases that map to issue categories
CREATE TABLE IF NOT EXISTS issue_keywords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_category_id UUID REFERENCES issue_categories(id) ON DELETE CASCADE,
    keyword TEXT NOT NULL,
    match_type TEXT DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'regex')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(issue_category_id, keyword)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_issue_categories_skill_group ON issue_categories(skill_group_id);
CREATE INDEX IF NOT EXISTS idx_issue_categories_code ON issue_categories(code);
CREATE INDEX IF NOT EXISTS idx_issue_keywords_category ON issue_keywords(issue_category_id);
CREATE INDEX IF NOT EXISTS idx_issue_keywords_keyword ON issue_keywords(keyword);

-- Enable RLS
ALTER TABLE issue_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_keywords ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow read for authenticated users, write for admins only
CREATE POLICY "Allow read for authenticated users" ON issue_categories
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow read for authenticated users" ON issue_keywords
    FOR SELECT TO authenticated USING (true);

-- For insert/update/delete, use service role key (admin only)
-- These operations will be done via API with service role

-- Grant permissions
GRANT SELECT ON issue_categories TO authenticated;
GRANT SELECT ON issue_keywords TO authenticated;

-- Add a comment for documentation
COMMENT ON TABLE issue_categories IS 'Stores issue category definitions for ticket classification';
COMMENT ON TABLE issue_keywords IS 'Stores keywords that trigger issue category classification';
