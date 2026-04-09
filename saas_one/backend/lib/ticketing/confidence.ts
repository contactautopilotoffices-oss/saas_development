/**
 * Classification Confidence Analyzer
 *
 * Purpose: Analyzes the rule engine's classification result to determine how
 * confident we should be in the decision — and whether human or LLM assistance
 * is needed before accepting it.
 *
 * Why this matters:
 *   - Not all rule-engine decisions are equally reliable.
 *   - A ticket matching 10 plumbing keywords vs 0 for all other groups is confident.
 *   - A ticket matching 2 plumbing and 2 technical keywords is ambiguous.
 *   - Ambiguous classifications should be escalated to the LLM or flagged for review.
 *
 * Classification Zones:
 *   - Zone A: High confidence. Rule-only decision is safe. No LLM needed.
 *   - Zone B: Ambiguous. LLM assist recommended for priority/risk reasoning.
 *   - Zone C: Very low confidence. Human review required before routing.
 *
 * Signals that force escalation (regardless of score margin):
 *   - Safety/Risk keywords: 'burnt', 'spark', 'smoke', 'fire', 'overheat' → always escalate
 *   - Negation: 'no', 'not', 'without', 'never' → can flip meaning entirely
 *   - Temporal/Conditional: 'after', 'before', 'sometimes' → context-dependent
 *
 * API used: None (pure computation, no external calls).
 *
 * Part of: Hybrid Ticket Classification System (rule engine + Groq LLM).
 */

import { EnhancedClassificationResult, SkillGroup } from './classifyTicket'

// --- Types ---

/** Confidence zone — determines how to handle the classification */
export type ClassificationZone = 'A' | 'B' | 'C'

/** Full confidence analysis result */
export interface ConfidenceAnalysis {
    zone: ClassificationZone         // Which zone this ticket falls into
    margin: number                   // Score difference between top 2 candidates
    entropy: number                  // Uncertainty measure (0=certain, 1=maximum uncertainty)
    needsLlm: boolean                // Should LLM be invoked for this ticket?
    needsHumanReview: boolean        // Should this be flagged for manual review?
    reason: string                   // Human-readable explanation of the decision
}

// --- Configuration Thresholds ---

/** If margin between top 2 groups is below this, it's ambiguous → Zone B */
const MARGIN_LLM_THRESHOLD = 8

/** If top score is below this (on a 0-100 normalized scale), weak match → Zone B */
const SCORE_LLM_THRESHOLD = 40

/** Entropy above this → groups are too close → Zone B */
const ENTROPY_HIGH = 0.7

// --- Semantic Signal Detection ---

/**
 * Detect linguistic signals that complicate simple keyword matching.
 *
 * What it detects:
 *   - Negation     ('not working', 'no power') — can flip the meaning of a match
 *   - Temporal     ('after hours', 'only on weekends') — context-dependent issues
 *   - Safety/Risk  ('fire', 'burning', 'spark') — always escalate regardless of score
 *
 * Why: The rule engine does substring matching — "no AC" matches "AC" in the dictionary.
 * Negation detection catches this false positive.
 *
 * @param text — The raw ticket text to analyze
 * @returns Object with boolean flags and a human-readable reason
 */
function detectSemanticSignals(text: string): {
    hasNegation: boolean
    hasTemporal: boolean
    hasSafetyRisk: boolean
    signalReason: string | null
} {
    const lower = text.toLowerCase()

    // Words/phrases that indicate negation (the issue may be the OPPOSITE of what matched)
    const negations = ['no ', 'not', 'without', 'none', 'never', "don't", "didn't", "wasn't"]
    // Words indicating time/condition dependence (regular issue vs. specific scenario)
    const temporals = ['after', 'before', 'only when', 'sometimes', 'yesterday', 'morning', 'every', 'when ']
    // Words indicating immediate danger (escalate regardless of score)
    const safetyRisks = ['burnt', 'spark', 'smoke', 'overheat', 'fire', 'electric shock', 'burning', 'blast']

    const hasNegation = negations.some(n => lower.includes(n))
    const hasTemporal = temporals.some(t => lower.includes(t))
    const hasSafetyRisk = safetyRisks.some(s => lower.includes(s))

    // Priority order: Safety > Negation > Temporal (for the reason string)
    let signalReason: string | null = null
    if (hasSafetyRisk) signalReason = 'Safety/Risk signal detected'
    else if (hasNegation) signalReason = 'Negation detected (potential context flip)'
    else if (hasTemporal) signalReason = 'Temporal/Conditional context detected'

    return { hasNegation, hasTemporal, hasSafetyRisk, signalReason }
}

/**
 * Calculate Shannon entropy of the score distribution.
 *
 * What it measures: How "spread out" vs. "concentrated" the keyword matches are.
 *   - Entropy = 0: All matches in one group → confident (Zone A)
 *   - Entropy = 1: Matches evenly distributed → uncertain (Zone B/C)
 *
 * Why Shannon entropy: It's a principled measure of uncertainty that works
 * regardless of how many skill groups exist.
 *
 * Formula: H = -Σ(p_i * log2(p_i)) for each non-zero probability p_i
 * Normalized to [0, 1] by dividing by log2(n) where n = number of groups.
 *
 * @param scores — Raw keyword match counts per skill group
 * @returns Entropy value between 0 (certain) and 1 (maximum uncertainty)
 */
function calculateEntropy(scores: Record<string, number>): number {
    const values = Object.values(scores)
    const total = values.reduce((sum, v) => sum + v, 0)

    if (total === 0) return 0  // No matches → handled separately

    let entropy = 0
    for (const score of values) {
        if (score > 0) {
            const p = score / total
            entropy -= p * Math.log2(p)  // Shannon entropy contribution
        }
    }

    // Normalize to 0-1 range (max entropy for 4 equal groups = log2(4) = 2)
    return entropy / 2
}

/**
 * Main confidence analysis function.
 *
 * What it does:
 *   1. Computes Shannon entropy of the score distribution.
 *   2. Normalizes the top score to a 0-100 scale for threshold comparison.
 *   3. Checks for semantic signals (negation, temporal, safety).
 *   4. Determines the zone based on margin, score, entropy, and signals.
 *
 * @param result  — Enhanced classification result from the rule engine
 * @param text    — Original ticket text (for semantic signal detection)
 * @returns Full confidence analysis with zone, entropy, and reason
 *
 * Zone assignment logic:
 *   - No matches at all         → Zone C (no data, must use fallback or LLM)
 *   - Safety/negation/temporal → Zone B (signal detected, escalate)
 *   - margin < 8 OR score < 40 OR entropy >= 0.7 → Zone B
 *   - Otherwise                → Zone A (confident, rule-only is fine)
 */
export function analyzeConfidence(result: EnhancedClassificationResult, text: string = ''): ConfidenceAnalysis {
    const { margin, scores, candidates } = result
    const entropy = calculateEntropy(scores)

    // Normalize top score: 1 keyword match = 20 pts, capped at 100
    // Raw scores are keyword counts; this makes thresholds human-readable
    const topScoreRaw = candidates[0]?.score || 0
    const topScoreNormalized = Math.min(topScoreRaw * 20, 100)

    // Check for semantic signals that override score-based logic
    const signals = detectSemanticSignals(text || '')

    // --- No matches: Zone C ---
    if (topScoreRaw === 0) {
        return { zone: 'C', margin: 0, entropy: 0, needsLlm: true, needsHumanReview: true, reason: 'No keyword matches found' }
    }

    // --- Semantic signals force Zone B ---
    if (signals.hasSafetyRisk || signals.hasNegation || signals.hasTemporal) {
        return { zone: 'B', margin, entropy, needsLlm: true, needsHumanReview: false, reason: signals.signalReason || 'Semantic override' }
    }

    // --- Ambiguous: Zone B ---
    // Trigger Zone B if ANY of these indicate uncertainty
    if (margin < MARGIN_LLM_THRESHOLD || topScoreNormalized < SCORE_LLM_THRESHOLD || entropy >= ENTROPY_HIGH) {
        let reason = ''
        if (margin < MARGIN_LLM_THRESHOLD) reason = `Low margin: ${margin}`
        else if (topScoreNormalized < SCORE_LLM_THRESHOLD) reason = `Weak match: ${topScoreNormalized} pts`
        else reason = `High uncertainty (entropy: ${entropy.toFixed(2)})`

        return { zone: 'B', margin, entropy, needsLlm: true, needsHumanReview: false, reason }
    }

    // --- Confident: Zone A ---
    return { zone: 'A', margin, entropy, needsLlm: false, needsHumanReview: false, reason: `Clear winner: margin ${margin}, score ${topScoreNormalized} pts` }
}

/**
 * Get top N candidate skill groups for LLM context.
 *
 * Why: When calling the LLM, we provide context about which groups are plausible.
 * This lets the LLM make a more informed decision rather than starting from scratch.
 *
 * @param result — Enhanced classification result
 * @param n      — Number of top candidates to return (default: 2)
 * @returns Top N skill groups with scores, filtered to those with at least 1 match
 */
export function getTopCandidates(
    result: EnhancedClassificationResult,
    n: number = 2
): Array<{ skill_group: SkillGroup; score: number; issue_code: string | null }> {
    return result.candidates.filter(c => c.score > 0).slice(0, n)
}
