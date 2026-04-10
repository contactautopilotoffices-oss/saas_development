/**
 * Rule-Based Ticket Classification Engine
 *
 * Purpose: Automatically categorizes incoming maintenance tickets into skill groups
 * (departments) based purely on keyword matching against a pre-defined dictionary.
 *
 * How it works:
 *   1. Convert ticket text to lowercase for case-insensitive matching.
 *   2. Scan the text against a keyword dictionary organized by skill group.
 *   3. Count keyword matches per skill group — more matches = higher score.
 *   4. Apply precedence rules when skill groups tie.
 *   5. Return the best-matching category, issue code, and confidence level.
 *
 * Skill Groups (departments):
 *   - technical      → Electrical, mechanical, equipment issues
 *   - plumbing       → Water, pipe, drainage issues
 *   - vendor        → Issues requiring third-party contractor intervention
 *   - soft_services → Housekeeping, cleaning, pest control, landscaping
 *
 * Precedence order (when tied): vendor > technical > plumbing > soft_services
 * This reflects cost/effort: vendor issues are most expensive so get priority.
 *
 * Dictionary: issueDictionary.json — maps issue codes to keyword arrays.
 *
 * Two output modes:
 *   - classifyTicket()        — Simple result (for backward compatibility)
 *   - classifyTicketEnhanced()— Full scoring with all candidates (for hybrid LLM system)
 *
 * API used:
 *   - Direct function call (no external API) — runs synchronously, no network calls.
 */

import dictionary from './issueDictionary.json'

// --- Types ---

/** Department/category bucket for ticket routing */
export type SkillGroup = 'technical' | 'plumbing' | 'vendor' | 'soft_services'

/** Confidence level of the classification decision */
export type Confidence = 'high' | 'low'

/** Basic classification result — returned by classifyTicket() */
export interface ClassificationResult {
    issue_code: string | null   // Specific issue sub-category code (e.g., 'ELECTRICAL_NO_POWER')
    skill_group: SkillGroup      // Department bucket for routing
    confidence: Confidence      // 'high' = confident match, 'low' = fallback used
}

/**
 * Enhanced classification result — returned by classifyTicketEnhanced().
 * Includes full scoring details used by the hybrid (rule + LLM) classifier.
 */
export interface EnhancedClassificationResult extends ClassificationResult {
    /** Keyword match count per skill group (raw scores) */
    scores: Record<SkillGroup, number>
    /** Top categories ordered by score (for LLM context) */
    candidates: Array<{ skill_group: SkillGroup; score: number; issue_code: string | null }>
    /** Difference between top two scores — high margin = confident decision */
    margin: number
}

// --- Internal types ---

/** Represents a single keyword match found during classification */
interface Match {
    issue_code: string      // The issue category code this keyword maps to
    skill_group: SkillGroup // The department bucket
    keyword: string         // The matched keyword (for debugging/logging)
    keyword_length: number  // Length — used as tie-breaker (longer = more specific)
}

/**
 * Enhanced classification with full scoring details.
 *
 * What it does:
 *   1. Scans ticket text against the keyword dictionary.
 *   2. Counts matches per skill group to compute scores.
 *   3. Applies precedence rules to break ties.
 *   4. Returns all candidates sorted by score for LLM context.
 *
 * @param text — Ticket title and/or description to classify
 * @returns Full classification result with scores and candidates
 *
 * Algorithm:
 *   - Each keyword match in a skill group adds 1 to that group's score.
 *   - Within a skill group, the issue_code with the most keyword matches wins.
 *   - Tie-breaker: longest keyword wins (more specific match).
 *   - Across groups: precedence order determines the winner.
 *   - No matches: falls back to 'technical' with 'low' confidence.
 */
export function classifyTicketEnhanced(text: string): EnhancedClassificationResult {
    // Step 1: Normalize text
    const lowerText = text.toLowerCase()

    // Step 2: Find all keyword matches
    const matches: Match[] = []
    const skillGroups: SkillGroup[] = ['vendor', 'technical', 'plumbing', 'soft_services']

    for (const skillGroup of skillGroups) {
        const issues = dictionary[skillGroup as keyof typeof dictionary] as Record<string, string[]> | undefined
        if (!issues || typeof issues !== 'object') continue

        for (const [issueCode, keywords] of Object.entries(issues)) {
            if (!Array.isArray(keywords)) continue
            for (const keyword of keywords) {
                // Simple substring matching — if keyword appears in text, it's a hit
                if (lowerText.includes(keyword)) {
                    matches.push({
                        issue_code: issueCode,
                        skill_group: skillGroup,
                        keyword: keyword,
                        keyword_length: keyword.length,
                    })
                }
            }
        }
    }

    // Step 3: Compute scores per skill group
    const scores: Record<SkillGroup, number> = {
        technical: 0, plumbing: 0, vendor: 0, soft_services: 0,
    }
    for (const match of matches) {
        scores[match.skill_group]++
    }

    // Step 4: Build sorted candidate list for LLM context
    // Each candidate includes score, group, and the best issue_code within that group
    const candidates = skillGroups.map(sg => {
        const groupMatches = matches.filter(m => m.skill_group === sg)
        let bestIssueCode: string | null = null

        if (groupMatches.length > 0) {
            // Within the group: issue_code with most keyword matches wins
            const counts: Record<string, number> = {}
            groupMatches.forEach(m => {
                counts[m.issue_code] = (counts[m.issue_code] || 0) + 1
            })

            let maxCount = 0
            for (const [code, count] of Object.entries(counts)) {
                if (count > maxCount) {
                    maxCount = count
                    bestIssueCode = code
                } else if (count === maxCount && bestIssueCode) {
                    // Tie-breaker: longest keyword (more specific = more reliable)
                    const currentMaxLen = Math.max(...groupMatches.filter(m => m.issue_code === code).map(m => m.keyword_length))
                    const bestMaxLen = Math.max(...groupMatches.filter(m => m.issue_code === bestIssueCode!).map(m => m.keyword_length))
                    if (currentMaxLen > bestMaxLen) {
                        bestIssueCode = code
                    }
                }
            }
        }

        return { skill_group: sg, score: scores[sg], issue_code: bestIssueCode }
    }).sort((a, b) => b.score - a.score) // Sort descending by score

    // Step 5: Calculate margin (difference between top two scores)
    // High margin → clear winner. Low margin → ambiguous, needs LLM assist.
    const topScore = candidates[0]?.score || 0
    const secondScore = candidates[1]?.score || 0
    const margin = topScore - secondScore

    // Step 6: No matches — return fallback
    if (matches.length === 0) {
        return {
            issue_code: null,
            skill_group: dictionary.defaults.fallback_skill_group as SkillGroup,
            confidence: dictionary.defaults.confidence_on_fallback as Confidence,
            scores,
            candidates,
            margin: 0,
        }
    }

    // Step 7: Apply precedence across skill groups
    // First skill group (by precedence order) with any matches wins
    const precedence = dictionary.precedence_order as SkillGroup[]
    for (const skillGroup of precedence) {
        const groupMatches = matches.filter(m => m.skill_group === skillGroup)
        if (groupMatches.length > 0) {
            // Find the issue_code with most matches within this group
            const counts: Record<string, number> = {}
            groupMatches.forEach(m => { counts[m.issue_code] = (counts[m.issue_code] || 0) + 1 })

            let bestIssueCode = groupMatches[0].issue_code
            let maxCount = 0
            for (const [code, count] of Object.entries(counts)) {
                if (count > maxCount) {
                    maxCount = count
                    bestIssueCode = code
                } else if (count === maxCount) {
                    // Tie-breaker: longest keyword wins
                    const currentMaxLen = Math.max(...groupMatches.filter(m => m.issue_code === code).map(m => m.keyword_length))
                    const bestMaxLen = Math.max(...groupMatches.filter(m => m.issue_code === bestIssueCode).map(m => m.keyword_length))
                    if (currentMaxLen > bestMaxLen) {
                        bestIssueCode = code
                    }
                }
            }

            return { issue_code: bestIssueCode, skill_group: skillGroup, confidence: 'high', scores, candidates, margin }
        }
    }

    // Fallback (should not reach here)
    return { issue_code: null, skill_group: 'technical', confidence: 'low', scores, candidates, margin: 0 }
}

/**
 * Simple classification — returns only the essential result.
 *
 * @param text — Ticket title and/or description
 * @returns Basic classification with issue_code, skill_group, confidence
 *
 * Why: Maintains backward compatibility with simpler code paths that don't need
 * scoring details or candidate lists.
 */
export function classifyTicket(text: string): ClassificationResult {
    const enhanced = classifyTicketEnhanced(text)
    return {
        issue_code: enhanced.issue_code,
        skill_group: enhanced.skill_group,
        confidence: enhanced.confidence,
    }
}

/**
 * Convert skill group enum to a human-readable display name.
 *
 * @param skillGroup — The skill group enum value
 * @returns Display-friendly name (e.g., 'soft_services' → 'Soft Services')
 */
export function getSkillGroupDisplayName(skillGroup: SkillGroup): string {
    const names: Record<SkillGroup, string> = {
        technical: 'Technical',
        plumbing: 'Plumbing',
        vendor: 'Vendor',
        soft_services: 'Soft Services',
    }
    return names[skillGroup]
}

/**
 * Get the Lucide icon name associated with a skill group.
 *
 * @param skillGroup — The skill group enum value
 * @returns Lucide icon component name (e.g., 'Wrench', 'Droplet')
 *
 * Why: Used in UI components to visually distinguish departments.
 */
export function getSkillGroupIcon(skillGroup: SkillGroup): string {
    const icons: Record<SkillGroup, string> = {
        technical: 'Wrench',     // Wrench — mechanical/electrical repair
        plumbing: 'Droplet',     // Water drop — plumbing/water issues
        vendor: 'Building2',      // Building — external contractor needed
        soft_services: 'Sparkles' // Sparkles — housekeeping/cleaning
    }
    return icons[skillGroup]
}

/**
 * Get Tailwind CSS color classes for a skill group.
 *
 * @param skillGroup — The skill group enum value
 * @returns Object with bg, text, border color class strings
 *
 * Why: Consistent color coding across all UI components displaying skill groups.
 * Each department gets a distinct color for instant visual recognition.
 */
export function getSkillGroupColor(skillGroup: SkillGroup): { bg: string; text: string; border: string } {
    const colors: Record<SkillGroup, { bg: string; text: string; border: string }> = {
        technical:     { bg: 'bg-blue-500/10',   text: 'text-blue-500',   border: 'border-blue-500/20'   },
        plumbing:      { bg: 'bg-cyan-500/10',   text: 'text-cyan-500',   border: 'border-cyan-500/20'   },
        vendor:        { bg: 'bg-amber-500/10',  text: 'text-amber-500',  border: 'border-amber-500/20'  },
        soft_services: { bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'border-purple-500/20' },
    }
    return colors[skillGroup]
}

// Default export for backward compatibility
export default classifyTicket
