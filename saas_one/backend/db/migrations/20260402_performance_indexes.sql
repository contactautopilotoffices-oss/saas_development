-- Performance indexes for common query patterns

-- tickets: property + created_at for date-range filtered org queries
CREATE INDEX IF NOT EXISTS idx_tickets_property_created ON tickets(property_id, created_at);

-- tickets: property + status + created_at for filtered paginated queries
CREATE INDEX IF NOT EXISTS idx_tickets_property_status_created ON tickets(property_id, status, created_at DESC);

-- tickets: org + status + created_at for org-wide filtered queries
CREATE INDEX IF NOT EXISTS idx_tickets_org_status_created ON tickets(organization_id, status, created_at DESC);

-- tickets: assigned_to + status for workload queries
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_status_created ON tickets(assigned_to, status, created_at DESC);
