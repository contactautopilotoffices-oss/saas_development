-- Add DELETE policy for electricity readings
DROP POLICY IF EXISTS electricity_readings_admin_delete ON electricity_readings;
CREATE POLICY electricity_readings_admin_delete ON electricity_readings FOR DELETE USING (
  EXISTS(SELECT 1 FROM property_memberships pm WHERE pm.user_id = auth.uid() AND pm.property_id = electricity_readings.property_id AND pm.role IN ('property_admin', 'staff', 'mst'))
  OR EXISTS(SELECT 1 FROM organization_memberships om 
            JOIN properties p ON p.organization_id = om.organization_id 
            WHERE om.user_id = auth.uid() AND p.id = electricity_readings.property_id AND om.role IN ('org_super_admin', 'master_admin'))
  OR (SELECT email FROM auth.users WHERE id = auth.uid()) = 'ranganathanlohitaksha@gmail.com'
);
