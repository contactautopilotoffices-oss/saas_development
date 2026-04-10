-- Create property_features table for granular feature control
CREATE TABLE IF NOT EXISTS property_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(property_id, feature_key)
);

-- Enable RLS
ALTER TABLE property_features ENABLE ROW LEVEL SECURITY;

-- Policies
-- 1. Master Admin can do anything
CREATE POLICY "Master Admin full access on property_features" ON property_features
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.is_master_admin = true
        )
    );

-- 2. Property Admins can view features for their property
CREATE POLICY "Property Admins can view features" ON property_features
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM property_memberships
            WHERE property_memberships.property_id = property_features.property_id
            AND property_memberships.user_id = auth.uid()
            AND property_memberships.role IN ('PROPERTY_ADMIN', 'property_admin', 'ORG_SUPER_ADMIN')
        )
    );

-- 3. Org Super Admins can manage features for their organization's properties
CREATE POLICY "Org Super Admin can manage features" ON property_features
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM properties p
            JOIN organization_memberships om ON p.organization_id = om.organization_id
            WHERE p.id = property_features.property_id
            AND om.user_id = auth.uid()
            AND om.role = 'org_super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM properties p
            JOIN organization_memberships om ON p.organization_id = om.organization_id
            WHERE p.id = property_features.property_id
            AND om.user_id = auth.uid()
            AND om.role = 'org_super_admin'
        )
    );

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_property_features_property_id ON property_features(property_id);
CREATE INDEX IF NOT EXISTS idx_property_features_feature_key ON property_features(feature_key);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_property_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER trigger_update_property_features_updated_at
    BEFORE UPDATE ON property_features
    FOR EACH ROW
    EXECUTE FUNCTION update_property_features_updated_at();

-- Seed initial features for existing properties (optional but helpful)
-- This enables 'ticket_validation' by default for all existing properties
INSERT INTO property_features (property_id, feature_key, is_enabled)
SELECT id, 'ticket_validation', true
FROM properties
ON CONFLICT (property_id, feature_key) DO NOTHING;
