-- Migration: SOP Checklist Module
-- Created: 2026-02-19
-- Description: Standard Operating Procedure checklists with camera-based verification

-- 1. sop_templates: SOP template per property
CREATE TABLE IF NOT EXISTS sop_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'general',
    frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly', 'monthly', 'on_demand')),
    assigned_to TEXT[] NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. sop_checklist_items: individual items in a template
CREATE TABLE IF NOT EXISTS sop_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES sop_templates(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    requires_photo BOOLEAN DEFAULT FALSE,
    requires_comment BOOLEAN DEFAULT FALSE,
    is_mandatory BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. sop_completions: one completion record per template per day per user
CREATE TABLE IF NOT EXISTS sop_completions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES sop_templates(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    completed_by UUID NOT NULL REFERENCES users(id),
    completion_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'partial')),
    notes TEXT,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. sop_completion_items: per-item completion state
CREATE TABLE IF NOT EXISTS sop_completion_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    completion_id UUID NOT NULL REFERENCES sop_completions(id) ON DELETE CASCADE,
    checklist_item_id UUID NOT NULL REFERENCES sop_checklist_items(id) ON DELETE CASCADE,
    is_checked BOOLEAN DEFAULT FALSE,
    photo_url TEXT,
    comment TEXT,
    checked_at TIMESTAMPTZ,
    UNIQUE(completion_id, checklist_item_id)
);

-- Enable RLS
ALTER TABLE sop_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_completion_items ENABLE ROW LEVEL SECURITY;

-- Templates: property members can view; admins can manage
CREATE POLICY "sop_templates_read" ON sop_templates FOR SELECT USING (
    public.is_master_admin_v2() OR 
    public.is_org_admin_v2(organization_id) OR 
    (public.is_property_member_v2(property_id) AND (
        assigned_to @> ARRAY[auth.uid()::text] OR
        EXISTS (SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = sop_templates.property_id AND pm.role IN ('property_admin'))
    ))
);





CREATE POLICY "sop_templates_manage" ON sop_templates FOR ALL USING (
    public.is_master_admin_v2() OR public.is_org_admin_v2(organization_id) OR
    EXISTS (SELECT 1 FROM property_memberships WHERE user_id = auth.uid() AND property_id = sop_templates.property_id AND role IN ('property_admin'))
);

-- Checklist items: inherit from template access
CREATE POLICY "sop_items_read" ON sop_checklist_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM sop_templates t WHERE t.id = sop_checklist_items.template_id
        AND (
            public.is_master_admin_v2() OR 
            public.is_org_admin_v2(t.organization_id) OR 
            (public.is_property_member_v2(t.property_id) AND (
                t.assigned_to @> ARRAY[auth.uid()::text] OR
                EXISTS (SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = t.property_id AND pm.role IN ('property_admin'))
            ))
        )
    )
);



-- Completions: users can manage their own; admins see all
CREATE POLICY "sop_completions_all_roles" ON sop_completions FOR SELECT USING (
    completed_by = auth.uid() OR 
    public.is_org_admin_v2(organization_id) OR
    public.is_master_admin_v2() OR
    EXISTS (SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = sop_completions.property_id AND pm.role IN ('property_admin'))
);


CREATE POLICY "sop_completions_insert" ON sop_completions FOR INSERT WITH CHECK (
    completed_by = auth.uid() AND public.is_property_member_v2(property_id)
);

CREATE POLICY "sop_completions_update" ON sop_completions FOR UPDATE USING (
    completed_by = auth.uid()
);

-- Completion items: inherit from completion
CREATE POLICY "sop_completion_items_manage" ON sop_completion_items FOR ALL USING (
    EXISTS (SELECT 1 FROM sop_completions c WHERE c.id = sop_completion_items.completion_id
        AND (
            c.completed_by = auth.uid() OR 
            public.is_org_admin_v2(c.organization_id) OR 
            public.is_master_admin_v2() OR
            EXISTS (SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = c.property_id AND pm.role IN ('property_admin'))
        )
    )
);


-- Indexes
CREATE INDEX IF NOT EXISTS idx_sop_templates_property ON sop_templates(property_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sop_templates_org ON sop_templates(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_sop_items_template ON sop_checklist_items(template_id, order_index);
CREATE INDEX IF NOT EXISTS idx_sop_completions_template_date ON sop_completions(template_id, completion_date DESC);
CREATE INDEX IF NOT EXISTS idx_sop_completions_user ON sop_completions(completed_by, completion_date DESC);
CREATE INDEX IF NOT EXISTS idx_sop_completions_property_date ON sop_completions(property_id, completion_date DESC);
CREATE INDEX IF NOT EXISTS idx_sop_completion_items_completion ON sop_completion_items(completion_id);
