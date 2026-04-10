-- Enable RLS on tickets if not already enabled
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

-- 1. Read Policy (View Tickets)
DROP POLICY IF EXISTS "tickets_read_policy" ON tickets;
CREATE POLICY "tickets_read_policy" ON tickets FOR SELECT USING (
  -- Users can see their own tickets
  raised_by = auth.uid()
  
  -- Assigned staff can see tickets
  OR assigned_to = auth.uid()
  
  -- Property Staff/Admins can see all tickets in their property
  OR EXISTS (
    SELECT 1 FROM property_memberships pm 
    WHERE pm.user_id = auth.uid() 
    AND pm.property_id = tickets.property_id 
    AND pm.is_active = true
    AND pm.role IN ('property_admin', 'staff', 'mst', 'security') -- explicitly listing likely roles
  )
  
  -- Master/Org Admins can see everything
  OR EXISTS (
    SELECT 1 FROM organization_memberships om 
    JOIN properties p ON p.organization_id = om.organization_id 
    WHERE om.user_id = auth.uid() 
    AND p.id = tickets.property_id 
    AND om.role IN ('master_admin', 'org_super_admin')
  )
  
  -- Fallback for super admin email
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- 2. Insert Policy (Create Tickets)
DROP POLICY IF EXISTS "tickets_insert_policy" ON tickets;
CREATE POLICY "tickets_insert_policy" ON tickets FOR INSERT WITH CHECK (
  -- Users can create tickets in properties they are members of
  EXISTS (
    SELECT 1 FROM property_memberships pm 
    WHERE pm.user_id = auth.uid() 
    AND pm.property_id = tickets.property_id
    AND pm.is_active = true
  )
  -- Org Super Admins can create tickets for any property in their org
  OR EXISTS (
    SELECT 1 FROM organization_memberships om
    JOIN properties p ON p.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
    AND p.id = tickets.property_id
    AND om.role IN ('org_super_admin', 'master_admin')
    AND om.is_active = true
  )
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- 3. Update Policy (Manage Tickets)
DROP POLICY IF EXISTS "tickets_update_policy" ON tickets;
CREATE POLICY "tickets_update_policy" ON tickets FOR UPDATE USING (
  -- Staff/Admins can update tickets
  EXISTS (
    SELECT 1 FROM property_memberships pm 
    WHERE pm.user_id = auth.uid() 
    AND pm.property_id = tickets.property_id 
    AND pm.is_active = true
    AND pm.role IN ('property_admin', 'staff', 'mst', 'security')
  )
  -- Org Super Admins can update tickets for any property in their org
  OR EXISTS (
    SELECT 1 FROM organization_memberships om
    JOIN properties p ON p.organization_id = om.organization_id
    WHERE om.user_id = auth.uid()
    AND p.id = tickets.property_id
    AND om.role IN ('org_super_admin', 'master_admin')
    AND om.is_active = true
  )
  OR assigned_to = auth.uid()
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);

-- 4. Reload Schema Cache
NOTIFY pgrst, 'reload schema';
