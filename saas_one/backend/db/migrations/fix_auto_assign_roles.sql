-- =========================================================
-- FIX: Simplified Auto-Assignment Logic
-- Purpose: 
-- 1. Find resolver by SKILL GROUP ID only (global lookup)
-- 2. 'staff' role -> ONLY eligible for 'soft_services' tickets
-- 3. 'mst' role -> Eligible for ANY skill they have
-- =========================================================

CREATE OR REPLACE FUNCTION find_best_resolver(
  p_property_id uuid,
  p_skill_group_id uuid,
  p_floor_number integer DEFAULT 1
) RETURNS uuid AS $$
DECLARE
  v_resolver_id uuid;
  v_skill_code text;
BEGIN
  -- 1. Get the code of the required skill group
  SELECT code INTO v_skill_code FROM skill_groups WHERE id = p_skill_group_id LIMIT 1;
  
  RAISE NOTICE '[find_best_resolver] Looking for skill: % (ID: %)', v_skill_code, p_skill_group_id;

  -- 2. Find Best Resolver - GLOBAL lookup on resolver_stats
  SELECT rs.user_id INTO v_resolver_id
  FROM resolver_stats rs
  JOIN property_memberships pm ON pm.user_id = rs.user_id
  LEFT JOIN (
    SELECT assigned_to, COUNT(*) as active_count
    FROM tickets
    WHERE skill_group_id = p_skill_group_id
      AND status IN ('assigned', 'in_progress')
    GROUP BY assigned_to
  ) t ON t.assigned_to = rs.user_id
  WHERE rs.skill_group_id = p_skill_group_id  -- Match the skill (GLOBAL)
    AND rs.is_available = true
    AND pm.is_active = true
    
    -- ROLE RULES:
    AND (
      -- MST/Admin/Technician can take ANY skill they have
      pm.role IN ('mst', 'property_admin', 'org_admin', 'technician')
      OR
      -- Staff can ONLY take soft_services
      (pm.role = 'staff' AND v_skill_code = 'soft_services')
    )

  ORDER BY 
    COALESCE(t.active_count, 0) ASC,  -- Least busy first
    RANDOM()
  LIMIT 1;
  
  IF v_resolver_id IS NOT NULL THEN
    RAISE NOTICE '[find_best_resolver] ✅ Found resolver: %', v_resolver_id;
  ELSE
    RAISE NOTICE '[find_best_resolver] ❌ No resolver found for skill: %', v_skill_code;
  END IF;
  
  RETURN v_resolver_id;
END;
$$ LANGUAGE plpgsql;

-- Also update the legacy wrapper
CREATE OR REPLACE FUNCTION find_least_loaded_resolver(
  p_property_id uuid,
  p_skill_group_id uuid
) RETURNS uuid AS $$
BEGIN
  RETURN find_best_resolver(p_property_id, p_skill_group_id, 1);
END;
$$ LANGUAGE plpgsql;
