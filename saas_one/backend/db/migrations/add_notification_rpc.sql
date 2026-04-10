-- RPC: Get recipients for TICKET_CREATED event
-- Logic:
-- 1. Fetch Property MSTs, Admins, Security, Staff
-- 2. Fetch Org Super Admins (optional, can be separate)
-- 3. Exclude the creator (optional, disabled for dev debugging)

CREATE OR REPLACE FUNCTION get_ticket_created_recipients(
    p_property_id UUID,
    p_organization_id UUID,
    p_creator_id UUID
)
RETURNS TABLE (user_id UUID, role TEXT) AS $$
BEGIN
    RETURN QUERY
    -- 1. Property Members (MST, Admin, etc.)
    SELECT pm.user_id, pm.role::TEXT
    FROM property_memberships pm
    WHERE pm.property_id = p_property_id
    AND pm.role IN ('MST', 'PROPERTY_ADMIN', 'SECURITY', 'STAFF', 'mst', 'property_admin', 'security', 'staff')
    AND pm.user_id != p_creator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
