-- =========================================================
-- SNAG IMPORT TRACKING MIGRATION
-- ADDITIVE • BACKWARD-COMPATIBLE
-- =========================================================

-- Add import tracking columns to tickets table
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS import_batch_id uuid;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS classification_override boolean DEFAULT false;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS override_by uuid REFERENCES users(id);
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS override_at timestamptz;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS original_skill_group_id uuid;

-- Snag Import Batches (metadata for bulk imports)
CREATE TABLE IF NOT EXISTS snag_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  imported_by uuid NOT NULL REFERENCES users(id),
  filename text NOT NULL,
  total_rows integer NOT NULL,
  valid_rows integer NOT NULL,
  error_rows integer DEFAULT 0,
  status text DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_snag_imports_property ON snag_imports(property_id);
CREATE INDEX IF NOT EXISTS idx_snag_imports_status ON snag_imports(status);
CREATE INDEX IF NOT EXISTS idx_tickets_import_batch ON tickets(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_tickets_classification_override ON tickets(classification_override);

-- RLS for Snag Imports
ALTER TABLE snag_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS snag_imports_read ON snag_imports;
CREATE POLICY snag_imports_read ON snag_imports FOR SELECT USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = snag_imports.property_id AND pm.is_active)
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = snag_imports.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS snag_imports_insert ON snag_imports;
CREATE POLICY snag_imports_insert ON snag_imports FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = snag_imports.property_id AND pm.role IN ('property_admin'))
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = snag_imports.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS snag_imports_update ON snag_imports;
CREATE POLICY snag_imports_update ON snag_imports FOR UPDATE USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = snag_imports.property_id AND pm.role IN ('property_admin'))
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = snag_imports.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);
