-- =========================================================
-- HYBRID CLASSIFICATION LOGS
-- Tracks ticket classification decisions for observability
-- =========================================================

-- Classification logs table
CREATE TABLE IF NOT EXISTS ticket_classification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  
  -- Rule engine results
  rule_top_bucket text NOT NULL,           -- Top skill_group from rules
  rule_scores jsonb NOT NULL DEFAULT '{}', -- All candidate scores: {"technical": 5, "plumbing": 3}
  rule_margin int NOT NULL DEFAULT 0,      -- Difference between top two scores
  entropy float DEFAULT 0,                 -- Score distribution entropy (optional V1)
  
  -- LLM results (nullable if not used)
  llm_used boolean NOT NULL DEFAULT false,
  llm_bucket text,                         -- LLM selected bucket (if used)
  llm_secondary_bucket text,               -- LLM selected secondary bucket
  llm_risk_flag text,                      -- LLM detected risk flag
  llm_confidence float,                    -- LLM confidence score (0-1)
  llm_reason text,                         -- LLM reasoning (for debugging)
  llm_latency_ms int,                      -- LLM API response time
  prompt_tokens int,                       -- Token usage from prompt
  completion_tokens int,                   -- Token usage from response
  total_tokens int,                         -- Total token usage
  
  -- Final decision
  final_bucket text NOT NULL,              -- The actual assigned bucket
  decision_source text NOT NULL DEFAULT 'rule', -- 'rule' | 'llm' | 'human'
  zone text NOT NULL DEFAULT 'A',          -- 'A' (rule) | 'B' (llm) | 'C' (human)
  
  -- Metadata
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_classification_logs_ticket ON ticket_classification_logs(ticket_id);
CREATE INDEX IF NOT EXISTS idx_classification_logs_source ON ticket_classification_logs(decision_source);
CREATE INDEX IF NOT EXISTS idx_classification_logs_llm ON ticket_classification_logs(llm_used);
CREATE INDEX IF NOT EXISTS idx_classification_logs_created ON ticket_classification_logs(created_at);

-- LLM Health Metrics table (for monitoring)
CREATE TABLE IF NOT EXISTS llm_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz NOT NULL DEFAULT now(),
  success_count int NOT NULL DEFAULT 0,
  failure_count int NOT NULL DEFAULT 0,
  fallback_count int NOT NULL DEFAULT 0,
  avg_latency_ms float,
  p95_latency_ms float,
  total_prompt_tokens bigint DEFAULT 0,
  total_completion_tokens bigint DEFAULT 0,
  total_cost_usd float DEFAULT 0,
  window_minutes int NOT NULL DEFAULT 5  -- Aggregation window
);

CREATE INDEX IF NOT EXISTS idx_llm_health_timestamp ON llm_health_metrics(timestamp);

-- Enable RLS
ALTER TABLE ticket_classification_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_health_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Only Master Admin can view classification logs
DROP POLICY IF EXISTS classification_logs_select ON ticket_classification_logs;
CREATE POLICY classification_logs_select ON ticket_classification_logs FOR SELECT 
  USING (public.is_master_admin());

DROP POLICY IF EXISTS classification_logs_insert ON ticket_classification_logs;
CREATE POLICY classification_logs_insert ON ticket_classification_logs FOR INSERT 
  WITH CHECK (true); -- Allow inserts from backend service

DROP POLICY IF EXISTS llm_health_select ON llm_health_metrics;
CREATE POLICY llm_health_select ON llm_health_metrics FOR SELECT 
  USING (public.is_master_admin());

DROP POLICY IF EXISTS llm_health_insert ON llm_health_metrics;
CREATE POLICY llm_health_insert ON llm_health_metrics FOR INSERT 
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
