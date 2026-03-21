-- =====================================================
-- ESCALATION TRIGGER DELAY & DEFAULT HIERARCHY
-- Adds property-admin-configurable trigger delay before
-- the first escalation fires, and a default hierarchy flag.
-- Date: 20260312
-- =====================================================

-- trigger_after_minutes: how long after ticket assignment before escalating to Level 1
ALTER TABLE escalation_hierarchies
  ADD COLUMN IF NOT EXISTS trigger_after_minutes integer NOT NULL DEFAULT 30 CHECK (trigger_after_minutes > 0);

-- is_default: auto-attach this hierarchy to new tickets for the property/org
ALTER TABLE escalation_hierarchies
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Tickets now start at level 0 (MST handling, not yet in hierarchy).
-- Level 0 → Level 1 fires when trigger_after_minutes elapses with no MST action.
-- Change default from 1 to 0 for new tickets.
ALTER TABLE tickets ALTER COLUMN current_escalation_level SET DEFAULT 0;
