-- Migration: Stock Reports Module
-- Created: 2026-02-19
-- Description: Inventory tracking system with stock items, movements, and daily reports

-- 1. stock_items: inventory items per property
CREATE TABLE IF NOT EXISTS stock_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    item_code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT DEFAULT 'units',
    quantity INTEGER NOT NULL DEFAULT 0,
    min_threshold INTEGER DEFAULT 10,
    location TEXT,
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(property_id, item_code)
);

-- 2. stock_movements: every stock change event
CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    action TEXT NOT NULL CHECK (action IN ('add', 'remove', 'adjust', 'initial')),
    quantity_change INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    user_id UUID REFERENCES users(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. stock_reports: daily snapshots (one per property per day)
CREATE TABLE IF NOT EXISTS stock_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    total_items INTEGER NOT NULL DEFAULT 0,
    low_stock_count INTEGER NOT NULL DEFAULT 0,
    total_added INTEGER NOT NULL DEFAULT 0,
    total_removed INTEGER NOT NULL DEFAULT 0,
    report_data JSONB,
    generated_by UUID REFERENCES users(id),
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(property_id, report_date)
);

-- Enable RLS
ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reports ENABLE ROW LEVEL SECURITY;

-- Policies: property members can view; org admins can manage
CREATE POLICY "stock_items_read" ON stock_items FOR SELECT USING (
    public.is_master_admin_v2() OR public.is_org_admin_v2(organization_id) OR public.is_property_member_v2(property_id)
);

CREATE POLICY "stock_items_write" ON stock_items FOR ALL USING (
    public.is_master_admin_v2() OR public.is_org_admin_v2(organization_id) OR public.is_property_member_v2(property_id)
);

CREATE POLICY "stock_movements_read" ON stock_movements FOR SELECT USING (
    public.is_master_admin_v2() OR public.is_org_admin_v2(organization_id) OR public.is_property_member_v2(property_id)
);

CREATE POLICY "stock_movements_insert" ON stock_movements FOR INSERT WITH CHECK (
    public.is_master_admin_v2() OR public.is_org_admin_v2(organization_id) OR public.is_property_member_v2(property_id)
);

CREATE POLICY "stock_reports_read" ON stock_reports FOR SELECT USING (
    public.is_master_admin_v2() OR public.is_org_admin_v2(organization_id) OR public.is_property_member_v2(property_id)
);

CREATE POLICY "stock_reports_write" ON stock_reports FOR ALL USING (
    public.is_master_admin_v2() OR public.is_org_admin_v2(organization_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_stock_items_property ON stock_items(property_id);
CREATE INDEX IF NOT EXISTS idx_stock_items_org ON stock_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_item ON stock_movements(item_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_property_date ON stock_movements(property_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stock_reports_property_date ON stock_reports(property_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_reports_org_date ON stock_reports(organization_id, report_date DESC);
