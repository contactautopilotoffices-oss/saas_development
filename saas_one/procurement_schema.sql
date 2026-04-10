-- =================================================================================
-- PROCUREMENT MODULE MIGRATION
-- Run in Supabase SQL Editor (safe, idempotent)
-- =================================================================================

-- =================================================================
-- 1. ADD 'procurement' TO app_role ENUM
-- =================================================================
DO $$
BEGIN
  ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'procurement';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE 'procurement already exists in app_role enum, skipping.';
END $$;

-- =================================================================
-- 2. ENSURE 'metadata' COLUMN ON ticket_comments (for @mentions)
-- =================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'ticket_comments' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE ticket_comments ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- =================================================================
-- 3. MATERIAL REQUESTS TABLE
--    Staff/MST raise material requests linked to a ticket.
--    Procurement users fulfill them.
-- =================================================================
CREATE TABLE IF NOT EXISTS material_requests (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id       uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    requested_by    uuid NOT NULL REFERENCES users(id),
    assignee_uid    uuid REFERENCES users(id),           -- procurement user handling this
    items           jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{ name, quantity, unit, notes, estimated_cost }]
    status          text NOT NULL DEFAULT 'pending',      -- pending | approved | ordered | delivered | cancelled | rejected
    priority        text DEFAULT 'medium',                -- low | medium | high | urgent
    total_estimated_cost numeric DEFAULT 0,
    notes           text,
    approved_by     uuid REFERENCES users(id),
    approved_at     timestamptz,
    ordered_at      timestamptz,
    delivered_at    timestamptz,
    cancelled_at    timestamptz,
    cancellation_reason text,
    created_at      timestamptz DEFAULT now(),
    updated_at      timestamptz DEFAULT now()
);

-- =================================================================
-- 4. PROCUREMENT ORDERS TABLE
--    Tracks actual purchase orders created by procurement team.
-- =================================================================
CREATE TABLE IF NOT EXISTS procurement_orders (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    material_request_id uuid NOT NULL REFERENCES material_requests(id) ON DELETE CASCADE,
    property_id       uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    organization_id   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ordered_by        uuid NOT NULL REFERENCES users(id),
    vendor_name       text,                               -- external vendor/supplier name
    vendor_contact    text,
    items             jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{ name, quantity, unit_price, total_price }]
    total_amount      numeric DEFAULT 0,
    invoice_number    text,
    invoice_url       text,                               -- Supabase storage URL for invoice scan
    payment_status    text DEFAULT 'unpaid',               -- unpaid | partial | paid
    delivery_status   text DEFAULT 'pending',              -- pending | in_transit | delivered | partial
    expected_delivery date,
    actual_delivery   date,
    notes             text,
    created_at        timestamptz DEFAULT now(),
    updated_at        timestamptz DEFAULT now()
);

-- =================================================================
-- 5. PROCUREMENT ACTIVITY LOG (audit trail)
-- =================================================================
CREATE TABLE IF NOT EXISTS procurement_activity_log (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    material_request_id uuid REFERENCES material_requests(id) ON DELETE CASCADE,
    procurement_order_id uuid REFERENCES procurement_orders(id) ON DELETE CASCADE,
    user_id             uuid REFERENCES users(id) ON DELETE SET NULL,
    action              text NOT NULL,                    -- 'created' | 'approved' | 'rejected' | 'ordered' | 'delivered' | 'cancelled' | 'comment'
    old_value           text,
    new_value           text,
    metadata            jsonb DEFAULT '{}'::jsonb,
    created_at          timestamptz DEFAULT now()
);

-- =================================================================
-- 6. INDEXES
-- =================================================================
CREATE INDEX IF NOT EXISTS idx_material_requests_status     ON material_requests(status);
CREATE INDEX IF NOT EXISTS idx_material_requests_ticket     ON material_requests(ticket_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_property   ON material_requests(property_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_assignee   ON material_requests(assignee_uid);
CREATE INDEX IF NOT EXISTS idx_material_requests_org        ON material_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_material_requests_created    ON material_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_procurement_orders_request   ON procurement_orders(material_request_id);
CREATE INDEX IF NOT EXISTS idx_procurement_orders_property  ON procurement_orders(property_id);
CREATE INDEX IF NOT EXISTS idx_procurement_orders_delivery  ON procurement_orders(delivery_status);

CREATE INDEX IF NOT EXISTS idx_procurement_log_request      ON procurement_activity_log(material_request_id);
CREATE INDEX IF NOT EXISTS idx_procurement_log_order        ON procurement_activity_log(procurement_order_id);

-- =================================================================
-- 7. ROW LEVEL SECURITY
-- =================================================================

-- ---- material_requests ----
ALTER TABLE material_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: Property members + org admins can view
DROP POLICY IF EXISTS material_requests_select ON material_requests;
CREATE POLICY material_requests_select ON material_requests FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = material_requests.property_id
        AND pm.is_active
    )
    OR EXISTS(
      SELECT 1 FROM organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = material_requests.organization_id
        AND om.role IN ('org_super_admin', 'master_admin', 'procurement')
    )
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  );

-- INSERT: Staff/MST/procurement can create requests
DROP POLICY IF EXISTS material_requests_insert ON material_requests;
CREATE POLICY material_requests_insert ON material_requests FOR INSERT
  WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS(
      SELECT 1 FROM property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = material_requests.property_id
        AND pm.is_active
        AND pm.role IN ('staff', 'mst', 'procurement', 'property_admin')
    )
  );

-- UPDATE: Procurement users, property admins, creator, or master admin
DROP POLICY IF EXISTS material_requests_update ON material_requests;
CREATE POLICY material_requests_update ON material_requests FOR UPDATE
  USING (
    requested_by = auth.uid()
    OR assignee_uid = auth.uid()
    OR EXISTS(
      SELECT 1 FROM property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = material_requests.property_id
        AND pm.is_active
        AND pm.role IN ('procurement', 'property_admin')
    )
    OR EXISTS(
      SELECT 1 FROM organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = material_requests.organization_id
        AND om.role IN ('org_super_admin', 'master_admin', 'procurement')
    )
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  )
  WITH CHECK (
    requested_by = auth.uid()
    OR assignee_uid = auth.uid()
    OR EXISTS(
      SELECT 1 FROM property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = material_requests.property_id
        AND pm.is_active
        AND pm.role IN ('procurement', 'property_admin')
    )
    OR EXISTS(
      SELECT 1 FROM organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = material_requests.organization_id
        AND om.role IN ('org_super_admin', 'master_admin', 'procurement')
    )
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  );

-- DELETE: Only admins
DROP POLICY IF EXISTS material_requests_delete ON material_requests;
CREATE POLICY material_requests_delete ON material_requests FOR DELETE
  USING (
    EXISTS(
      SELECT 1 FROM property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = material_requests.property_id
        AND pm.role = 'property_admin'
    )
    OR EXISTS(
      SELECT 1 FROM organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = material_requests.organization_id
        AND om.role IN ('org_super_admin', 'master_admin')
    )
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  );

-- ---- procurement_orders ----
ALTER TABLE procurement_orders ENABLE ROW LEVEL SECURITY;

-- SELECT: Procurement users, property admins, org admins
DROP POLICY IF EXISTS procurement_orders_select ON procurement_orders;
CREATE POLICY procurement_orders_select ON procurement_orders FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = procurement_orders.property_id
        AND pm.is_active
        AND pm.role IN ('procurement', 'property_admin')
    )
    OR EXISTS(
      SELECT 1 FROM organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = procurement_orders.organization_id
        AND om.role IN ('org_super_admin', 'master_admin', 'procurement')
    )
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  );

-- INSERT: Only procurement users
DROP POLICY IF EXISTS procurement_orders_insert ON procurement_orders;
CREATE POLICY procurement_orders_insert ON procurement_orders FOR INSERT
  WITH CHECK (
    ordered_by = auth.uid()
    AND EXISTS(
      SELECT 1 FROM property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = procurement_orders.property_id
        AND pm.is_active
        AND pm.role IN ('procurement', 'property_admin')
    )
  );

-- UPDATE: Procurement users or admins
DROP POLICY IF EXISTS procurement_orders_update ON procurement_orders;
CREATE POLICY procurement_orders_update ON procurement_orders FOR UPDATE
  USING (
    ordered_by = auth.uid()
    OR EXISTS(
      SELECT 1 FROM property_memberships pm
      WHERE pm.user_id = auth.uid()
        AND pm.property_id = procurement_orders.property_id
        AND pm.is_active
        AND pm.role IN ('procurement', 'property_admin')
    )
    OR EXISTS(
      SELECT 1 FROM organization_memberships om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = procurement_orders.organization_id
        AND om.role IN ('org_super_admin', 'master_admin')
    )
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  );

-- ---- procurement_activity_log ----
ALTER TABLE procurement_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procurement_log_select ON procurement_activity_log;
CREATE POLICY procurement_log_select ON procurement_activity_log FOR SELECT
  USING (
    EXISTS(
      SELECT 1 FROM material_requests mr
      JOIN property_memberships pm ON pm.property_id = mr.property_id
      WHERE mr.id = procurement_activity_log.material_request_id
        AND pm.user_id = auth.uid()
        AND pm.is_active
    )
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  );

DROP POLICY IF EXISTS procurement_log_insert ON procurement_activity_log;
CREATE POLICY procurement_log_insert ON procurement_activity_log FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
  );

-- =================================================================
-- 8. TRIGGERS (updated_at auto-update)
-- =================================================================
CREATE OR REPLACE FUNCTION update_material_requests_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_material_requests_updated_at ON material_requests;
CREATE TRIGGER trg_material_requests_updated_at
  BEFORE UPDATE ON material_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_material_requests_timestamp();

CREATE OR REPLACE FUNCTION update_procurement_orders_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_procurement_orders_updated_at ON procurement_orders;
CREATE TRIGGER trg_procurement_orders_updated_at
  BEFORE UPDATE ON procurement_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_procurement_orders_timestamp();

-- =================================================================
-- 9. HELPER: Auto-assign procurement requests to procurement users
-- =================================================================
CREATE OR REPLACE FUNCTION find_procurement_user(p_property_id uuid)
RETURNS uuid AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT pm.user_id INTO v_user_id
  FROM property_memberships pm
  WHERE pm.property_id = p_property_id
    AND pm.role = 'procurement'
    AND pm.is_active = true
  ORDER BY RANDOM()
  LIMIT 1;

  RETURN v_user_id;
END;
$$ LANGUAGE plpgsql;

-- =================================================================
-- DONE. Summary of what was created:
-- =================================================================
-- ✓ 'procurement' added to app_role enum
-- ✓ material_requests table (staff raises, procurement fulfills)
-- ✓ procurement_orders table (PO tracking by procurement team)
-- ✓ procurement_activity_log table (audit trail)
-- ✓ RLS policies for all 3 tables
-- ✓ Indexes for performance
-- ✓ Auto-update triggers for updated_at
-- ✓ find_procurement_user() helper function
--
-- To assign the procurement role to a user:
--   UPDATE property_memberships
--   SET role = 'procurement'
--   WHERE user_id = '<user-uuid>' AND property_id = '<property-uuid>';
--
