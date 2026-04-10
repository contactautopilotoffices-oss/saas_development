-- =========================================================
-- Intelligent Ticket Classification & Shift-Aware Load Balancing
-- PRD Implementation Migration
-- =========================================================

-- 1. MST SKILLS MAPPING
CREATE TABLE IF NOT EXISTS mst_skills (
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  skill_code text NOT NULL, -- e.g., 'technical', 'plumbing', 'soft_service', 'vendor'
  PRIMARY KEY (user_id, skill_code)
);

-- 2. SHIFT TRACKING LOGS
CREATE TABLE IF NOT EXISTS shift_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  check_in_at timestamptz DEFAULT now(),
  check_out_at timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at timestamptz DEFAULT now()
);

-- 3. ENHANCE RESOLVER STATS
-- Note: resolver_stats table is assumed to exist from previous migrations
ALTER TABLE resolver_stats ADD COLUMN IF NOT EXISTS is_checked_in boolean DEFAULT false;
ALTER TABLE resolver_stats ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz;

-- 4. TICKET ENHANCEMENTS FOR CLASSIFICATION
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS issue_code text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS skill_group_code text;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS confidence text CHECK (confidence IN ('high', 'low'));

-- 5. RLS POLICIES FOR SHIFT LOGS
ALTER TABLE shift_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shift_logs_owner_policy ON shift_logs;
CREATE POLICY shift_logs_owner_policy ON shift_logs 
FOR ALL USING (auth.uid() = user_id);

-- 6. SHIFT-AWARE LOAD BALANCED ASSIGNMENT LOGIC
-- Refactors find_best_resolver to prioritize on-duty MSTs and balance load
CREATE OR REPLACE FUNCTION find_best_resolver(
  p_property_id uuid,
  p_skill_group_code text,
  p_floor_number integer DEFAULT 1
) RETURNS uuid AS $$
DECLARE
  v_resolver_id uuid;
BEGIN
  -- Select eligible MST based on:
  -- 1. Checked-in status (PRD 5.3)
  -- 2. Skill match (Skill group OR mapped skill)
  -- 3. Lowest active load (PRD 5.4)
  -- 4. Oldest last_assigned_at (Tie-breaker)
  
  SELECT rs.user_id INTO v_resolver_id
  FROM resolver_stats rs
  JOIN property_memberships pm ON pm.user_id = rs.user_id AND pm.property_id = rs.property_id
  LEFT JOIN (
    -- Calculate load = count of active tickets (PRD 5.4)
    SELECT assigned_to, COUNT(*) as active_count
    FROM tickets
    WHERE property_id = p_property_id 
      AND status IN ('assigned', 'in_progress', 'paused')
    GROUP BY assigned_to
  ) t ON t.assigned_to = rs.user_id
  WHERE rs.property_id = p_property_id
    AND rs.is_checked_in = true -- PRD requirement: Distinguish on-duty vs off-duty
    AND rs.is_available = true
    AND pm.is_active = true
    AND (
      -- Match by primary skill group or independent skill mapping (PRD 5.2)
      EXISTS (
        SELECT 1 FROM skill_groups sg 
        WHERE sg.id = rs.skill_group_id AND sg.code = p_skill_group_code
      )
      OR EXISTS (
        SELECT 1 FROM mst_skills ms 
        WHERE ms.user_id = rs.user_id AND ms.skill_code = p_skill_group_code
      )
    )
  ORDER BY 
    COALESCE(t.active_count, 0) ASC, -- Priority: Lowest load
    rs.last_assigned_at ASC NULLS FIRST, -- Tie-breaker: Oldest assignment
    RANDOM()
  LIMIT 1;
  
  RETURN v_resolver_id;
END;
$$ LANGUAGE plpgsql;

-- 7. AUTO-ASSIGNMENT TRIGGER UPDATE
CREATE OR REPLACE FUNCTION auto_assign_ticket()
RETURNS TRIGGER AS $$
DECLARE
  v_resolver_id uuid;
  v_skill_group_code text;
BEGIN
  -- Get skill group code for the category
  SELECT sg.code INTO v_skill_group_code 
  FROM skill_groups sg 
  WHERE sg.id = NEW.skill_group_id;

  -- Attempt assignment
  v_resolver_id := find_best_resolver(NEW.property_id, v_skill_group_code, NEW.floor_number);
  
  IF v_resolver_id IS NOT NULL THEN
    NEW.assigned_to := v_resolver_id;
    NEW.assigned_at := now();
    NEW.status := 'assigned';
    NEW.sla_started := true;
    NEW.sla_deadline := now() + (COALESCE(NEW.sla_hours, 24) || ' hours')::interval;
    
    -- Update last_assigned_at for load balancer round-robin fairness
    UPDATE resolver_stats 
    SET last_assigned_at = now() 
    WHERE user_id = v_resolver_id AND property_id = NEW.property_id;
  ELSE
    -- No available MST available -> ticket goes to WAITLIST (PRD 5.4 Edge Cases)
    NEW.status := 'waitlist';
    NEW.sla_started := false;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. ATTACH TRIGGER
DROP TRIGGER IF EXISTS trigger_auto_assign_ticket ON tickets;
CREATE TRIGGER trigger_auto_assign_ticket
BEFORE INSERT ON tickets
FOR EACH ROW
WHEN (NEW.assigned_to IS NULL) -- Only auto-assign if not manually assigned
EXECUTE FUNCTION auto_assign_ticket();
