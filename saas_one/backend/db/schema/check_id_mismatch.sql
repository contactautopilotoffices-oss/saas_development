-- =========================================================
-- DIAGNOSTIC: Check for ID Mismatch
-- Purpose: Verify if the Skill IDs in 'resolver_stats' match the Skill IDs in 'issue_categories'.
-- =========================================================

DO $$
DECLARE
    v_category_code text := 'ac_breakdown'; -- The category you are testing
    v_skill_group_id uuid;
    v_skill_name text;
    v_resolver_count integer;
    v_all_stats_count integer;
BEGIN
    RAISE NOTICE '🔍 DIAGNOSTIC STARTED for Category: %', v_category_code;

    -- 1. Find which Skill Group this Category belongs to
    SELECT skill_group_id, name INTO v_skill_group_id, v_skill_name
    FROM issue_categories 
    JOIN skill_groups ON skill_groups.id = issue_categories.skill_group_id
    WHERE issue_categories.code = v_category_code
    LIMIT 1;

    IF v_skill_group_id IS NULL THEN
        RAISE NOTICE '❌ CRITICAL: Category "%" not found or has no Skill Group!', v_category_code;
        RETURN;
    END IF;

    RAISE NOTICE '✅ Category "%" maps to Skill Group: "%" (ID: %)', v_category_code, v_skill_name, v_skill_group_id;

    -- 2. Check if ANY resolvers have this EXACT Skill Group ID
    SELECT COUNT(*) INTO v_resolver_count
    FROM resolver_stats
    WHERE skill_group_id = v_skill_group_id
      AND is_available = true;

    RAISE NOTICE '🔎 Checking resolver_stats table...';
    RAISE NOTICE '   Found % available resolvers with EXACT Skill ID match.', v_resolver_count;

    -- 3. Check total rows just to be sure
    SELECT COUNT(*) INTO v_all_stats_count FROM resolver_stats;
    RAISE NOTICE '   (Total rows in resolver_stats table: %)', v_all_stats_count;

    -- 4. Conclusion
    IF v_resolver_count > 0 THEN
        RAISE NOTICE '✅ DATA LOOKS CORRECT. Resolvers exist with the right ID.';
        RAISE NOTICE '   If assignment fails, it is likely the ROLE RESTRICTION (Staff vs MST).';
    ELSE
        RAISE NOTICE '❌ DATA MISMATCH DETECTED!';
        RAISE NOTICE '   Your resolvers in DB might have a DIFFERENT Skill ID than what AC Breakdown expects.';
        RAISE NOTICE '   Solution: Update resolver_stats to use the ID: %', v_skill_group_id;
    END IF;

END $$;
