-- =========================================================
-- DIAGNOSTIC: Check Why Resolver Not Found
-- Run this in Supabase SQL Editor to debug the issue
-- =========================================================

-- 1. Show all skill_groups (to see their IDs)
SELECT 'SKILL GROUPS' as info;
SELECT id, code, name, property_id FROM skill_groups LIMIT 20;

-- 2. Show all resolver_stats entries
SELECT 'RESOLVER STATS' as info;
SELECT rs.user_id, rs.skill_group_id, rs.property_id, rs.is_available,
       sg.code as skill_code, u.full_name
FROM resolver_stats rs
LEFT JOIN skill_groups sg ON sg.id = rs.skill_group_id
LEFT JOIN users u ON u.id = rs.user_id;

-- 3. Show recent tickets with their skill_group_id
SELECT 'RECENT TICKETS' as info;
SELECT id, title, skill_group_id, property_id, status, assigned_to, created_at
FROM tickets
ORDER BY created_at DESC
LIMIT 5;

-- 4. CHECK FOR MISMATCH: Does any resolver have the EXACT skill_group_id that tickets are using?
SELECT 'CHECKING MATCHES' as info;
SELECT 
    t.title,
    t.skill_group_id as ticket_skill,
    t.property_id as ticket_property,
    rs.user_id as matching_resolver,
    rs.is_available
FROM tickets t
LEFT JOIN resolver_stats rs 
    ON rs.skill_group_id = t.skill_group_id 
    AND rs.property_id = t.property_id
    AND rs.is_available = true
WHERE t.status = 'waitlist'
ORDER BY t.created_at DESC
LIMIT 5;
