/**
 * Ticket Classifier Resolver
 * 
 * Orchestrates the hybrid classification flow:
 * 1. Rule Engine (classifyTicketEnhanced)
 * 2. Confidence Analyzer (determine zone)
 * 3. LLM Gateway (if Zone B/C)
 * 4. Final Decision
 * 5. Log to database
 */

import { classifyTicketEnhanced, EnhancedClassificationResult, SkillGroup } from './classifyTicket';
import { analyzeConfidence, getTopCandidates, ConfidenceAnalysis, ClassificationZone } from './confidence';
import { classifyWithGroq, LLMInput } from '../llm/groq';
import { createClient } from '@supabase/supabase-js';
import { emitWebhook } from './webhooks';

export type DecisionSource = 'rule' | 'llm' | 'human';

export interface ResolvedClassification {
    // Final result
    issue_code: string | null;
    skill_group: SkillGroup;
    confidence: 'high' | 'low';

    // Decision metadata
    zone: ClassificationZone;
    decisionSource: DecisionSource;
    llmUsed: boolean;
    llmEnhanced: boolean; // True if LLM was used AND its result was accepted

    // For frontend display
    enhancedClassification: boolean;
    secondary_category_code?: string | null;
    risk_flag?: string | null;
    llm_reasoning?: string | null;
    priority?: string | null;

    // Original rule result (for logging)
    ruleResult: EnhancedClassificationResult;
    confidenceAnalysis: ConfidenceAnalysis;

    // LLM details (if used)
    llmResult?: {
        selectedBucket: string;
        secondaryBucket?: string | null;
        priority?: string;
        riskFlag?: string | null;
        reason: string;
        latencyMs: number;
        usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
    };
}

export interface ClassificationLogEntry {
    ticket_id: string;
    rule_top_bucket: string;
    rule_scores: Record<string, number>;
    rule_margin: number;
    entropy: number;
    llm_used: boolean;
    llm_bucket?: string;
    llm_secondary_bucket?: string | null;
    llm_risk_flag?: string | null;
    llm_reason?: string;
    llm_latency_ms?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    final_bucket: string;
    decision_source: DecisionSource;
    zone: ClassificationZone;
}

/**
 * Main resolver function
 * Orchestrates the entire hybrid classification flow
 */
export async function resolveClassification(ticketText: string, dbPriority?: string): Promise<ResolvedClassification> {
    // Step 1: Run rule engine
    const ruleResult = classifyTicketEnhanced(ticketText);

    // Step 2: Analyze confidence (including semantic signals)
    const confidenceAnalysis = analyzeConfidence(ruleResult, ticketText);

    // Default response (rule-based)
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
    };

    // Step 3: Force LLM classification for ALL tickets (AI Assisted for all properties)
    // We override the confidence check to ensure every ticket gets AI enrichment (risk, priority, reasoning)
    const forceLlm = true;

    if (forceLlm || confidenceAnalysis.needsLlm) {
        // Only emit low confidence webhook if it was ACTUALLY low confidence
        if (confidenceAnalysis.needsLlm) {
            emitWebhook('rule.low_confidence', 'pending', {
                text: ticketText,
                reason: confidenceAnalysis.reason,
                margin: ruleResult.margin,
                top_category: ruleResult.skill_group
            });
        }

        const topCandidates = getTopCandidates(ruleResult, 3); // Provide top 3 candidates for more context

        const llmInput: LLMInput = {
            ticket_text: ticketText,
            candidate_buckets: ['technical', 'plumbing', 'vendor', 'soft_services'],
            rule_scores: ruleResult.scores,
            db_priority: dbPriority,
        };

        const llmResponse = await classifyWithGroq(llmInput);

        if (llmResponse.success && llmResponse.result) {
            const llmResult = llmResponse.result;

            finalResult.llmUsed = true;
            finalResult.llmResult = {
                selectedBucket: llmResult.primary_category,
                secondaryBucket: llmResult.secondary_category,
                priority: llmResult.priority,
                riskFlag: llmResult.risk_flag,
                reason: llmResult.reasoning,
                latencyMs: llmResponse.latencyMs,
                usage: llmResponse.usage,
            };

            // Hybrid decision: Accept LLM if it returned a valid primary category
            // (We trust the LLM's situational reasoning over rules in Zone B/C)
            finalResult.skill_group = llmResult.primary_category as SkillGroup;

            // Map primary category back to an issue_code if possible (best guess from candidates)
            const matchedCandidate = topCandidates.find(c => c.skill_group === llmResult.primary_category);
            finalResult.issue_code = matchedCandidate ? matchedCandidate.issue_code : null;

            finalResult.confidence = 'high';
            finalResult.decisionSource = 'llm';
            finalResult.llmEnhanced = true;
            finalResult.enhancedClassification = true;

            // Enrich result with extra AI metadata
            finalResult.secondary_category_code = llmResult.secondary_category;
            finalResult.risk_flag = llmResult.risk_flag;
            finalResult.llm_reasoning = llmResult.reasoning;
            finalResult.priority = llmResult.priority;

            // Emit LLM invoked webhook
            emitWebhook('llm.invoked', 'pending', {
                ticket_id: 'pending',
                source: 'resolver',
                latency_ms: llmResponse.latencyMs,
                reason: confidenceAnalysis.needsLlm ? confidenceAnalysis.reason : 'Forced AI Policy',
                result: llmResult
            });
        }
    }

    return finalResult;
}

/**
 * Log classification decision to database
 */
export async function logClassification(
    ticketId: string,
    resolution: ResolvedClassification
): Promise<void> {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.warn('[Resolver] Cannot log: missing Supabase config');
        return;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

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
    };

    const { error } = await supabase
        .from('ticket_classification_logs')
        .insert(logEntry);

    if (error) {
        console.error('[Resolver] Failed to log classification:', error);
    }

    // Emit final categorized webhook
    emitWebhook('ticket.categorized', ticketId, {
        final_category: resolution.skill_group,
        secondary_category: resolution.secondary_category_code,
        priority: resolution.priority || (resolution.ruleResult.confidence === 'high' ? 'Medium' : 'Low'),
        risk_flag: resolution.risk_flag,
        decision_source: resolution.decisionSource,
        reasoning: resolution.llm_reasoning
    });
}

/**
 * Combined resolve and log function for convenience
 */
export async function resolveAndLogClassification(
    ticketText: string,
    ticketId: string
): Promise<ResolvedClassification> {
    const resolution = await resolveClassification(ticketText);

    // Log asynchronously - don't block on this
    logClassification(ticketId, resolution).catch(err => {
        console.error('[Resolver] Logging error:', err);
    });

    return resolution;
}
