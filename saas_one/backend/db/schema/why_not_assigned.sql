-- =========================================================
-- DIAGNOSTIC: Why is no one getting assigned?
-- Purpose: List all potential resolvers and exactly why they are failing.
-- usage: Run this in SQL Editor.
-- =========================================================

SELECT 
    u.email,
    pm.role,
    sg.code as skill,
    rs.is_available,
    -- Analysis Column
    CASE 
        WHEN pm.role = 'staff' AND sg.code != 'soft_services' 
            THEN '⛔ BLOCKED: Staff role can only take Soft Services'
        WHEN pm.role NOT IN ('staff', 'mst', 'property_admin', 'org_admin', 'technician') 
            THEN '⛔ BLOCKED: Role not allowed (must be mst/admin/technician)'
        WHEN rs.is_available = false 
            THEN '⛔ BLOCKED: User is marked Unavailable'
        ELSE '✅ ELIGIBLE (Should get assigned)'
    END as assignment_status
FROM resolver_stats rs
JOIN property_memberships pm ON pm.user_id = rs.user_id AND pm.property_id = rs.property_id
JOIN users u ON u.id = rs.user_id
JOIN skill_groups sg ON sg.id = rs.skill_group_id;
