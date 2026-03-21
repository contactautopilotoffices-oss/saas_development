-- =====================================================
-- ESCALATION HIERARCHY SYSTEM
-- Employee-based ticket escalation with Kanban builder
-- Date: 20260311
-- =====================================================

-- 1. Escalation Hierarchies
-- Stores named escalation chains per org or per property
CREATE TABLE IF NOT EXISTS escalation_hierarchies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE, -- NULL = org-wide
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Escalation Levels
-- Each row = one employee at a specific level within a hierarchy
CREATE TABLE IF NOT EXISTS escalation_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hierarchy_id uuid NOT NULL REFERENCES escalation_hierarchies(id) ON DELETE CASCADE,
  level_number integer NOT NULL CHECK (level_number >= 1),
  employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  escalation_time_minutes integer NOT NULL DEFAULT 30 CHECK (escalation_time_minutes > 0),
  notification_channels text[] DEFAULT ARRAY['push', 'email'],
  created_at timestamptz DEFAULT now(),
  UNIQUE (hierarchy_id, level_number)
);

-- 3. Ticket Escalation Logs
-- Immutable audit trail of every escalation event per ticket
CREATE TABLE IF NOT EXISTS ticket_escalation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  hierarchy_id uuid REFERENCES escalation_hierarchies(id) ON DELETE SET NULL,
  from_employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  to_employee_id uuid REFERENCES users(id) ON DELETE SET NULL,
  from_level integer,
  to_level integer,
  reason text DEFAULT 'timeout', -- 'timeout' | 'manual' | 'inactive_employee'
  escalated_at timestamptz DEFAULT now()
);

-- 4. Add escalation tracking columns to tickets
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hierarchy_id uuid REFERENCES escalation_hierarchies(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS current_escalation_level integer DEFAULT 1;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalation_last_action_at timestamptz DEFAULT now();
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS escalation_paused boolean DEFAULT false;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_esc_hierarchies_org ON escalation_hierarchies(organization_id);
CREATE INDEX IF NOT EXISTS idx_esc_hierarchies_prop ON escalation_hierarchies(property_id);
CREATE INDEX IF NOT EXISTS idx_esc_hierarchies_active ON escalation_hierarchies(organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_esc_levels_hierarchy ON escalation_levels(hierarchy_id);
CREATE INDEX IF NOT EXISTS idx_esc_levels_employee ON escalation_levels(employee_id);
CREATE INDEX IF NOT EXISTS idx_esc_logs_ticket ON ticket_escalation_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_esc_logs_at ON ticket_escalation_logs(escalated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_hierarchy ON tickets(hierarchy_id);
-- Partial index: only check open/in-progress tickets for escalation engine
CREATE INDEX IF NOT EXISTS idx_tickets_escalation_engine ON tickets(escalation_last_action_at, current_escalation_level, hierarchy_id)
  WHERE status NOT IN ('resolved', 'closed') AND escalation_paused = false AND hierarchy_id IS NOT NULL;

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE escalation_hierarchies ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_escalation_logs ENABLE ROW LEVEL SECURITY;

-- ---- escalation_hierarchies policies ----

DROP POLICY IF EXISTS esc_hier_select ON escalation_hierarchies;
CREATE POLICY esc_hier_select ON escalation_hierarchies FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = escalation_hierarchies.organization_id
      AND om.is_active = true
  )
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS esc_hier_insert ON escalation_hierarchies;
CREATE POLICY esc_hier_insert ON escalation_hierarchies FOR INSERT WITH CHECK (
  -- Org super admin or master admin can create org-wide hierarchies
  EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = escalation_hierarchies.organization_id
      AND om.role IN ('org_super_admin', 'master_admin')
      AND om.is_active = true
  )
  -- Property admin can create property-scoped hierarchies
  OR (
    escalation_hierarchies.property_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = escalation_hierarchies.property_id
        AND pm.role = 'property_admin'
        AND pm.is_active = true
    )
  )
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS esc_hier_update ON escalation_hierarchies;
CREATE POLICY esc_hier_update ON escalation_hierarchies FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = escalation_hierarchies.organization_id
      AND om.role IN ('org_super_admin', 'master_admin')
      AND om.is_active = true
  )
  OR (
    escalation_hierarchies.property_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = escalation_hierarchies.property_id
        AND pm.role = 'property_admin'
        AND pm.is_active = true
    )
  )
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS esc_hier_delete ON escalation_hierarchies;
CREATE POLICY esc_hier_delete ON escalation_hierarchies FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM organization_memberships om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = escalation_hierarchies.organization_id
      AND om.role IN ('org_super_admin', 'master_admin')
      AND om.is_active = true
  )
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- ---- escalation_levels policies ----

DROP POLICY IF EXISTS esc_levels_select ON escalation_levels;
CREATE POLICY esc_levels_select ON escalation_levels FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM escalation_hierarchies eh
    JOIN organization_memberships om ON om.organization_id = eh.organization_id
    WHERE eh.id = escalation_levels.hierarchy_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  )
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS esc_levels_insert ON escalation_levels;
CREATE POLICY esc_levels_insert ON escalation_levels FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM escalation_hierarchies eh
    JOIN organization_memberships om ON om.organization_id = eh.organization_id
    WHERE eh.id = escalation_levels.hierarchy_id
      AND om.user_id = auth.uid()
      AND om.role IN ('org_super_admin', 'master_admin', 'property_admin')
      AND om.is_active = true
  )
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS esc_levels_update ON escalation_levels;
CREATE POLICY esc_levels_update ON escalation_levels FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM escalation_hierarchies eh
    JOIN organization_memberships om ON om.organization_id = eh.organization_id
    WHERE eh.id = escalation_levels.hierarchy_id
      AND om.user_id = auth.uid()
      AND om.role IN ('org_super_admin', 'master_admin', 'property_admin')
      AND om.is_active = true
  )
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

DROP POLICY IF EXISTS esc_levels_delete ON escalation_levels;
CREATE POLICY esc_levels_delete ON escalation_levels FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM escalation_hierarchies eh
    JOIN organization_memberships om ON om.organization_id = eh.organization_id
    WHERE eh.id = escalation_levels.hierarchy_id
      AND om.user_id = auth.uid()
      AND om.role IN ('org_super_admin', 'master_admin', 'property_admin')
      AND om.is_active = true
  )
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- ---- ticket_escalation_logs policies ----

DROP POLICY IF EXISTS esc_logs_select ON ticket_escalation_logs;
CREATE POLICY esc_logs_select ON ticket_escalation_logs FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM tickets t
    JOIN organization_memberships om ON om.organization_id = t.organization_id
    WHERE t.id = ticket_escalation_logs.ticket_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  )
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- Logs are written by the system (service role bypasses RLS), so only allow insert for master_admin/service
DROP POLICY IF EXISTS esc_logs_insert ON ticket_escalation_logs;
CREATE POLICY esc_logs_insert ON ticket_escalation_logs FOR INSERT WITH CHECK (
  (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  OR EXISTS (
    SELECT 1 FROM organization_memberships om
    JOIN tickets t ON t.organization_id = om.organization_id
    WHERE t.id = ticket_escalation_logs.ticket_id
      AND om.user_id = auth.uid()
      AND om.role IN ('org_super_admin', 'master_admin', 'property_admin')
      AND om.is_active = true
  )
);
