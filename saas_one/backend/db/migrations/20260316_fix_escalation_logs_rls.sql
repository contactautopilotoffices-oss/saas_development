-- =====================================================
-- FIX: ticket_escalation_logs SELECT policy
-- Allow ALL property members (tenant, mst, admin, etc.)
-- to view escalation logs for tickets in their property.
-- Previously only org-level members could see them.
-- Date: 20260316
-- =====================================================

DROP POLICY IF EXISTS esc_logs_select ON ticket_escalation_logs;

CREATE POLICY esc_logs_select ON ticket_escalation_logs FOR SELECT USING (
  -- Org members (admins, super admins)
  EXISTS (
    SELECT 1 FROM tickets t
    JOIN organization_memberships om ON om.organization_id = t.organization_id
    WHERE t.id = ticket_escalation_logs.ticket_id
      AND om.user_id = auth.uid()
      AND om.is_active = true
  )
  -- Property members (tenant, mst, staff, property_admin, etc.)
  OR EXISTS (
    SELECT 1 FROM tickets t
    JOIN property_memberships pm ON pm.property_id = t.property_id
    WHERE t.id = ticket_escalation_logs.ticket_id
      AND pm.user_id = auth.uid()
      AND pm.is_active = true
  )
  -- Master admin
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);
