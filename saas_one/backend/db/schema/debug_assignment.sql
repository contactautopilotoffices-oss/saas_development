-- =========================================================
-- DEBUG: Analyze Assignment Failure
-- Purpose: Check why a specific ticket isn't finding a resolver.
-- Usage: Replace 'TICKET_ID' with the actual UUID.
-- =========================================================

DO $$
DECLARE
    -- REPLACE THIS WITH THE ACTUAL TICKET ID YOU ARE DEBUGGING
    -- You can find it in the URL: /tickets/[uuid]
    v_ticket_id uuid := 'REPLACE_WITH_UUID_HERE'; 
    
    r_ticket RECORD;
    v_skill_id uuid;
    v_skill_code text;
    v_eligible_count integer;
BEGIN
    -- 1. Get Ticket Details
    SELECT * INTO r_ticket FROM tickets WHERE id = v_ticket_id;
    
    IF r_ticket IS NULL THEN
        RAISE NOTICE '❌ Ticket Not Found!';
        RETURN;
    END IF;

    RAISE NOTICE '🔍 Analyzing Ticket: %', r_ticket.ticket_number;
    RAISE NOTICE '   Category Code: %', r_ticket.category;
    RAISE NOTICE '   Property ID: %', r_ticket.property_id;
    RAISE NOTICE '   Skill Group ID on Ticket: %', r_ticket.skill_group_id;

    -- 2. Check Skill Group
    SELECT code INTO v_skill_code FROM skill_groups WHERE id = r_ticket.skill_group_id;
    RAISE NOTICE '   Skill Group Code: %', v_skill_code;

    -- 3. Check Eligible Resolvers
    RAISE NOTICE '---------------------------------------------------';
    RAISE NOTICE '🕵️ Looking for resolvers in resolver_stats...';
    
    SELECT COUNT(*) INTO v_eligible_count
    FROM resolver_stats rs
    JOIN property_memberships pm ON pm.user_id = rs.user_id AND pm.property_id = rs.property_id
    WHERE rs.property_id = r_ticket.property_id
      AND rs.skill_group_id = r_ticket.skill_group_id
      AND rs.is_available = true
      AND pm.is_active = true;
      
    RAISE NOTICE '   ✅ Found % eligible resolvers with matching skill.', v_eligible_count;

    IF v_eligible_count = 0 THEN
        RAISE NOTICE '   ❌ FAILURE REASON: No user has this skill assigned in resolver_stats!';
        RAISE NOTICE '      Action: Add a row to resolver_stats for your MST user with skill_group_id = %', r_ticket.skill_group_id;
    ELSE
        RAISE NOTICE '   ✅ Resolvers exist. If still not assigned, check if roles are allowed.';
        
        -- Check Role Filter
        SELECT COUNT(*) INTO v_eligible_count
        FROM resolver_stats rs
        JOIN property_memberships pm ON pm.user_id = rs.user_id AND pm.property_id = rs.property_id
        WHERE rs.property_id = r_ticket.property_id
          AND rs.skill_group_id = r_ticket.skill_group_id
          AND rs.is_available = true
          AND pm.is_active = true
          AND pm.role IN ('staff', 'mst', 'property_admin', 'org_admin', 'technician') -- The updated list
          AND (pm.role != 'staff' OR v_skill_code = 'soft_services'); -- The Staff restriction
          
        RAISE NOTICE '   ✅ Found % eligible resolvers AFTER role checks.', v_eligible_count;
        
        IF v_eligible_count = 0 THEN
             RAISE NOTICE '   ❌ FAILURE REASON: Users have the skill, but their ROLE is excluded!';
             RAISE NOTICE '      (e.g., Staff users cannot take Technical tickets).';
        END IF;
    END IF;
    
END $$;
