/**
 * Hybrid Classification Resolver — Orchestrates the full ticket classification pipeline
 *
 * Purpose: Acts as the central coordinator for the hybrid (rule engine + LLM) classification
 * system. Runs the complete flow from rule matching to final decision and database logging.
 *
 * The full classification pipeline:
 *   Step 1: Rule Engine       → classifyTicketEnhanced() — keyword matching, candidate scores
 *   Step 2: Confidence Analyzer → analyzeConfidence() — determines zone (A/B/C), whether LLM needed
 *   Step 3: LLM Gateway       → classifyWithGroq() — resolves ambiguous cases (if Zone B/C)
 *   Step 4: Final Decision    → Combine rule result + LLM enrichment
 *   Step 5: Database Logging  → logClassification() — persist the full decision to audit table
 *
 * Forced AI policy: Every ticket is sent to the LLM regardless of confidence zone.
 * This enriches all tickets with AI-generated priority, risk flags, and reasoning.
 * This is a deliberate design choice — the cost of occasional LLM latency is worth
 * the benefit of consistent, enriched classification across all tickets.
 *
 * Database table used: ticket_classification_logs
 *   Stores: rule scores, LLM latency, token usage, decision source, final bucket, entropy
 *
 * Part of: backend/lib/ticketing/ module (the highest-level orchestrator).
 */

import { classifyTicketEnhanced, EnhancedClassificationResult, SkillGroup } from './classifyTicket'
import { analyzeConfidence, getTopCandidates, ConfidenceAnalysis, ClassificationZone } from './confidence'
import { classifyWithGroq, LLMInput } from '../llm/groq'
import { createClient } from '@supabase/supabase-js'
import { emitWebhook } from './webhooks'

// --- Types ---

/** Which system made the final classification decision */
export type DecisionSource = 'rule' | 'llm' | 'human'

/**
 * The final resolved classification result returned to API route handlers.
 * Contains everything needed to route, prioritize, and display the ticket.
 */
export interface ResolvedClassification {
    // Core classification fields
    issue_code: string | null      // Specific issue sub-code (e.g., 'ELECTRICAL_NO_POWER')
    skill_group: SkillGroup         // Department bucket for routing
    confidence: 'high' | 'low'     // Confidence in the skill_group decision

    // Decision metadata
    zone: ClassificationZone        // Confidence zone (A/B/C)
    decisionSource: DecisionSource  // 'rule' if rule engine won, 'llm' if LLM overrode
    llmUsed: boolean               // Was Groq called? (almost always true with forced AI policy)
    llmEnhanced: boolean           // Was the LLM's result actually accepted and used?
    enhancedClassification: boolean // Was this enriched with AI metadata beyond skill_group?

    // AI enrichment fields (populated when LLM was invoked)
    secondary_category_code?: string | null   // Secondary department if applicable
    risk_flag?: string | null                // Safety risk if detected ("Fire risk", "Slip hazard")
    llm_reasoning?: string | null            // One-line AI explanation of the decision
    priority?: string | null                 // AI-assigned priority: Low/Medium/High/Urgent

    // Reference data (for logging and debugging)
    ruleResult: EnhancedClassificationResult  // Raw rule engine output
    confidenceAnalysis: ConfidenceAnalysis    // Confidence zone analysis

    // LLM response details (only populated if llmUsed = true)
    llmResult?: {
        selectedBucket: string
        secondaryBucket?: string | null
        priority?: string
        riskFlag?: string | null
        reason: string
        latencyMs: number
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }
}

/** Shape of the record inserted into ticket_classification_logs table */
export interface ClassificationLogEntry {
    ticket_id: string
    rule_top_bucket: string
    rule_scores: Record<string, number>
    rule_margin: number
    entropy: number
    llm_used: boolean
    llm_bucket?: string
    llm_secondary_bucket?: string | null
    llm_risk_flag?: string | null
    llm_reason?: string
    llm_latency_ms?: number
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    final_bucket: string
    decision_source: DecisionSource
    zone: ClassificationZone
}

// --- Core Functions ---

/**
 * Main entry point — resolve a ticket's classification using the hybrid pipeline.
 *
 * @param ticketText   — The raw ticket title and description
 * @param dbPriority  — Optional baseline priority from the issue_categories DB table
 * @returns ResolvedClassification with all metadata (skill group, priority, risk, etc.)
 *
 * Pipeline steps:
 *   1. Run rule engine to get keyword-match classification.
 *   2. Analyze confidence to determine zone and whether LLM is needed.
 *   3. Always call Groq (forced AI policy) to get priority, risk, reasoning.
 *   4. Combine results — prefer LLM's skill_group over rule engine's.
 *   5. Emit webhooks for observability (low confidence, LLM invoked, ticket categorized).
 */
export async function resolveClassification(ticketText: string, dbPriority?: string): Promise<ResolvedClassification> {
    // Step 1: Run rule engine
    const ruleResult = classifyTicketEnhanced(ticketText)

    // Step 2: Analyze confidence (margin, entropy, semantic signals)
    const confidenceAnalysis = analyzeConfidence(ruleResult, ticketText)

    // Default: use rule engine result if LLM is unavailable or fails
    let finalResult: ResolvedClassification = {
        issue_code: ruleResult.issue_code,
        skill_group: ruleResult.skill_group,
        confidence: ruleResult.confidence,
        zone: confidenceAnalysis.zone,
        decisionSource: 'rule',
        llmUsed: false,
        llmEnhanced: false,
        enhancedClassification: false,
        ruleResult,
        confidenceAnalysis,
    }

    // Step 3: Force LLM classification for ALL tickets
    // Even Zone A (high confidence) tickets get AI enrichment for priority/risk/reasoning
    const forceLlm = true

    if (forceLlm || confidenceAnalysis.needsLlm) {
        // Emit webhook for low-confidence detections (observability)
        if (confidenceAnalysis.needsLlm) {
            emitWebhook('rule.low_confidence', 'pending', {
                text: ticketText,
                reason: confidenceAnalysis.reason,
                margin: ruleResult.margin,
                top_category: ruleResult.skill_group
            })
        }

        // Get top 3 candidates for richer LLM context
        const topCandidates = getTopCandidates(ruleResult, 3)

        // Build LLM input: ticket text + candidates + rule scores + DB priority hint
        const llmInput: LLMInput = {
            ticket_text: ticketText,
            candidate_buckets: ['technical', 'plumbing', 'vendor', 'soft_services'],
            rule_scores: ruleResult.scores,
            db_priority: dbPriority,
        }

        // Call Groq
        const llmResponse = await classifyWithGroq(llmInput)

        if (llmResponse.success && llmResponse.result) {
            const llmResult = llmResponse.result

            // Populate LLM details for logging
            finalResult.llmUsed = true
            finalResult.llmResult = {
                selectedBucket: llmResult.primary_category,
                secondaryBucket: llmResult.secondary_category,
                priority: llmResult.priority,
                riskFlag: llmResult.risk_flag,
                reason: llmResult.reasoning,
                latencyMs: llmResponse.latencyMs,
                usage: llmResponse.usage,
            }

            // Use LLM's skill group (trusts LLM's situational reasoning over rules)
            finalResult.skill_group = llmResult.primary_category as SkillGroup

            // Map the LLM's bucket back to the best matching issue_code from candidates
            const matchedCandidate = topCandidates.find(c => c.skill_group === llmResult.primary_category)
            finalResult.issue_code = matchedCandidate ? matchedCandidate.issue_code : null

            // Upgrade to confident and mark as LLM-sourced
            finalResult.confidence = 'high'
            finalResult.decisionSource = 'llm'
            finalResult.llmEnhanced = true
            finalResult.enhancedClassification = true

            // Add AI enrichment fields
            finalResult.secondary_category_code = llmResult.secondary_category
            finalResult.risk_flag = llmResult.risk_flag
            finalResult.llm_reasoning = llmResult.reasoning
            finalResult.priority = llmResult.priority

            // Emit LLM invocation webhook (for monitoring, latency tracking, cost analysis)
            emitWebhook('llm.invoked', 'pending', {
                ticket_id: 'pending',
                source: 'resolver',
                latency_ms: llmResponse.latencyMs,
                reason: confidenceAnalysis.needsLlm ? confidenceAnalysis.reason : 'Forced AI Policy',
                result: llmResult
            })
        }
    }

    return finalResult
}

/**
 * Log a classification decision to the database (fire-and-forget).
 *
 * What it does:
 *   1. Builds a ClassificationLogEntry from the ResolvedClassification.
 *   2. Inserts it into ticket_classification_logs table.
 *   3. Emits a 'ticket.categorized' webhook.
 *   4. Fails silently — logging errors never affect the main ticket creation flow.
 *
 * Why this matters:
 *   - Provides a complete audit trail for every AI classification decision.
 *   - Token usage data enables cost tracking and budget monitoring.
 *   - Latency metrics enable performance optimization.
 *   - Rule scores + entropy enable model/version comparison over time.
 */
export async function logClassification(
    ticketId: string,
    resolution: ResolvedClassification
): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
        console.warn('[Resolver] Cannot log: missing Supabase config')
        return
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    const logEntry: ClassificationLogEntry = {
        ticket_id: ticketId,
        rule_top_bucket: resolution.ruleResult.skill_group,
        rule_scores: resolution.ruleResult.scores,
        rule_margin: resolution.ruleResult.margin,
        entropy: resolution.confidenceAnalysis.entropy,
        llm_used: resolution.llmUsed,
        llm_bucket: resolution.llmResult?.selectedBucket,
        llm_secondary_bucket: resolution.llmResult?.secondaryBucket,
        llm_risk_flag: resolution.llmResult?.riskFlag,
        llm_reason: resolution.llmResult?.reason,
        llm_latency_ms: resolution.llmResult?.latencyMs,
        prompt_tokens: resolution.llmResult?.usage?.prompt_tokens,
        completion_tokens: resolution.llmResult?.usage?.completion_tokens,
        total_tokens: resolution.llmResult?.usage?.total_tokens,
        final_bucket: resolution.skill_group,
        decision_source: resolution.decisionSource,
        zone: resolution.zone,
    }

    const { error } = await supabase.from('ticket_classification_logs').insert(logEntry)
    if (error) {
        console.error('[Resolver] Failed to log classification:', error)
    }

    // Emit final categorization webhook for external systems (dashboards, monitoring)
    emitWebhook('ticket.categorized', ticketId, {
        final_category: resolution.skill_group,
        secondary_category: resolution.secondary_category_code,
        priority: resolution.priority || (resolution.ruleResult.confidence === 'high' ? 'Medium' : 'Low'),
        risk_flag: resolution.risk_flag,
        decision_source: resolution.decisionSource,
        reasoning: resolution.llm_reasoning
    })
}

/**
 * Combined resolve + log in one call.
 *
 * Convenience wrapper around resolveClassification() + logClassification().
 * Classifies the ticket and asynchronously persists the decision to the DB.
 *
 * @param ticketText — Ticket title and description
 * @param ticketId  — Database ID of the ticket (needed for the log entry)
 * @returns ResolvedClassification (result is returned immediately, logging is async)
 *
 * Why async logging: Database writes can take 50-200ms. We don't want to slow down
 * the HTTP response. The ticket creation response is sent as soon as classification
 * is complete; logging happens in the background without blocking.
 */
export async function resolveAndLogClassification(
    ticketText: string,
    ticketId: string
): Promise<ResolvedClassification> {
    const resolution = await resolveClassification(ticketText)

    // Log asynchronously — don't await. Errors are caught and logged internally.
    logClassification(ticketId, resolution).catch(err => {
        console.error('[Resolver] Logging error:', err)
    })

    return resolution
}
