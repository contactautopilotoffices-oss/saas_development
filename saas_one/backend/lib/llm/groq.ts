/**
 * Groq LLM Client — Tie-breaker for Hybrid Ticket Classification
 *
 * Purpose: Calls the Groq API (LLM inference) to resolve ambiguous or complex
 * ticket classifications that the rule engine cannot confidently handle.
 *
 * How it fits into the hybrid system:
 *   1. Rule engine (classifyTicket) scans keywords → produces candidate buckets + scores
 *   2. Confidence analyzer (confidence.ts) determines if LLM help is needed
 *   3. This module calls Groq with the candidates and ticket text
 *   4. Groq returns: primary category, secondary category, priority, risk flag, reasoning
 *
 * Why Groq (not OpenAI/Anthropic directly):
 *   - Groq offers significantly lower latency for comparable quality.
 *   - Llama-3.3-70b-versatile is fast enough for real-time ticket classification.
 *   - Cost-effective for high-volume classification calls.
 *
 * Key design decisions:
 *   - Strict Zod schema validation for both input and output.
 *   - 5-second timeout to prevent blocking ticket creation.
 *   - Silent fallback on any failure — ticket creation continues with rule result.
 *   - Output normalization (title-case priority, null safety).
 *   - Always returns a GroqResponse object (never throws).
 *
 * API: https://api.groq.com/openai/v1/chat/completions
 * Model: llama-3.3-70b-versatile
 * Temperature: 0.1 (low for consistent, deterministic output)
 * Max tokens: 200 (short response — just structured JSON)
 *
 * Environment variable: GROQ_API_KEY
 */

import { z } from 'zod'
import { SkillGroup } from '../ticketing/classifyTicket'

// --- Input/Output Schemas (validated with Zod) ---

/**
 * Input schema — what we send to Groq for classification.
 * All fields are validated before the API call is made.
 */
const LLMInputSchema = z.object({
    ticket_text: z.string(),                           // Raw ticket title + description
    candidate_buckets: z.array(z.string()),            // Valid skill group labels (for validation)
    rule_scores: z.record(z.string(), z.number()),     // Keyword match counts per bucket
    db_priority: z.string().optional(),               // Baseline priority from issue_categories table
})

/**
 * Output schema — what we expect back from Groq.
 * Groq is instructed to return JSON matching this structure.
 */
const LLMOutputSchema = z.object({
    primary_category: z.string(),                      // Selected skill group (must be from candidates)
    secondary_category: z.string().nullable().optional(), // Contributing category if relevant
    priority: z.enum(['Low', 'Medium', 'High', 'Urgent']), // Ticket priority level
    risk_flag: z.string().nullable().optional(),       // Safety risk identifier if any
    reasoning: z.string(),                             // One-line explanation of the decision
})

export type LLMInput = z.infer<typeof LLMInputSchema>
export type LLMOutput = z.infer<typeof LLMOutputSchema>

/**
 * Standardized response from the Groq classification call.
 * Always returned (never thrown) — failures are communicated via the `success` field.
 */
export interface GroqResponse {
    success: boolean           // true if Groq returned a valid, parsed response
    result?: LLMOutput        // Parsed classification result (only if success=true)
    error?: string            // Human-readable error description (only if success=false)
    latencyMs: number         // Round-trip time in milliseconds
    fallbackUsed: boolean     // true if rule-engine fallback was used instead
    usage?: {                 // Token usage metrics (for cost tracking)
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
    }
}

// --- Configuration ---

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'  // Groq's OpenAI-compatible endpoint
const GROQ_MODEL = 'llama-3.3-70b-versatile'                            // Fast, capable, cost-effective
const TIMEOUT_MS = 5000                                                  // 5s timeout — prevents blocking
const MIN_CONFIDENCE_THRESHOLD = 0.65                                    // Below this, suggest human review

// --- System Prompt ---

/**
 * Build the system prompt for Groq.
 * This is the "instructions" that tell the LLM how to behave as a triage system.
 *
 * Why a detailed prompt:
 *   - Groq needs strict definitions of priority levels (Urgent vs High vs Medium vs Low).
 *   - Examples help the model understand the domain-specific meaning of each category.
 *   - The "when in doubt choose higher priority" rule prevents under-triaging dangerous issues.
 */
function buildSystemPrompt(): string {
    return `You are an expert facilities incident triage system.
Your job is to infer the primary cause, secondary contributing factors, correct priority, and safety risks of maintenance tickets.

Rules:
1. Reason about context, negation, time, and cause vs symptom.
2. Identify the PRIMARY category responsible (from the provided list).
3. Identify a SECONDARY category if relevant (from the provided list), otherwise null.
4. Assign priority using these strict definitions:
   - Urgent: Immediate threat to life/safety — fire, flood, structural collapse, complete power failure, stuck lift with person inside.
   - High: Risk of damage, injury, or major service disruption — any leakage/water damage, electrical faults, broken locks, lift malfunction, sewage issues, AC failure in server room.
   - Medium: Affects comfort or routine operations — AC not cooling, lighting issues, minor plumbing (dripping tap without damage risk), cleaning requests, furniture issues.
   - Low: Purely cosmetic, no service impact — paint scuff, minor stain, aesthetic complaints.
   When in doubt between two levels, always choose the HIGHER priority.
5. Flag safety risks explicitly (e.g., "Fire risk", "Slip hazard", "Water damage risk").
6. Provide a concise one-line reasoning.

Respond ONLY in valid JSON format matching the requested schema.`
}

/**
 * Build the user prompt with ticket-specific context.
 * Includes rule engine scores and priority examples to guide the LLM.
 */
function buildUserPrompt(input: LLMInput): string {
    // Examples of what each priority level looks like in real tickets
    const priorityExamples = `
Priority Examples (use these as reference):
- Urgent: "lift stuck with person inside", "fire alarm triggered", "electrical spark near server room", "flooding on floor"
- High: "urinal tap leakage", "water pipe leaking", "AC not working in server room", "exposed wiring", "broken door lock", "sewage smell", "ceiling water seepage"
- Medium: "AC not cooling properly", "light flickering", "wifi slow", "chair broken", "tap dripping slightly", "washroom cleaning needed", "dustbin not cleared"
- Low: "paint scuff on wall", "minor stain on carpet", "desk slightly misaligned", "fingerprints on glass"`

    // DB baseline priority — Groq should only go HIGHER, never lower
    const dbPriorityHint = input.db_priority
        ? `\nBaseline Priority (from category DB): ${input.db_priority} — only assign HIGHER than this if the ticket text clearly warrants it. Never assign lower.`
        : ''

    return `Target Categories: ${JSON.stringify(input.candidate_buckets)}

Ticket Description:
"${input.ticket_text}"

Rule Engine Context:
Scores: ${JSON.stringify(input.rule_scores)}
${priorityExamples}${dbPriorityHint}

Analyze the situation and return structured JSON.`
}

// --- Main Classification Function ---

/**
 * Call Groq API to classify a ticket.
 *
 * What it does:
 *   1. Validates input against LLMInputSchema (Zod).
 *   2. Checks for GROQ_API_KEY existence.
 *   3. Sends a POST request with system prompt + user prompt.
 *   4. Parses the JSON response and validates against LLMOutputSchema (Zod).
 *   5. Normalizes output (title-case priority, null safety).
 *   6. Returns a GroqResponse — never throws.
 *
 * @param input — Ticket text, candidate buckets, rule engine scores, optional DB priority
 * @returns GroqResponse with classification result or error details
 *
 * Error handling strategy: Fail silently. Return fallbackUsed=true so the calling
 * code (resolver.ts) knows to use the rule engine result instead.
 */
export async function classifyWithGroq(input: LLMInput): Promise<GroqResponse> {
    const startTime = Date.now()

    // Validate input before making the API call
    const inputValidation = LLMInputSchema.safeParse(input)
    if (!inputValidation.success) {
        return { success: false, error: `Invalid input: ${inputValidation.error.message}`, latencyMs: Date.now() - startTime, fallbackUsed: true }
    }

    // Check for API key — fail fast if not configured
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) {
        console.warn('[GroqClient] GROQ_API_KEY not configured, using fallback')
        return { success: false, error: 'GROQ_API_KEY not configured', latencyMs: Date.now() - startTime, fallbackUsed: true }
    }

    // AbortController for timeout — cancels the fetch if it takes too long
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
        // POST to Groq's OpenAI-compatible chat completions endpoint
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: buildSystemPrompt() },   // Instructions
                    { role: 'user', content: buildUserPrompt(input) }, // Ticket data
                ],
                temperature: 0.1,    // Low temperature for consistent, deterministic output
                max_tokens: 200,     // Short response — just the JSON object
                response_format: { type: 'json_object' }, // Force JSON mode (avoids markdown issues)
            }),
            signal: controller.signal,
        })

        clearTimeout(timeoutId)  // Clear timeout now that response is received

        // Check HTTP status
        if (!response.ok) {
            const errorText = await response.text()
            console.error('[GroqClient] API error:', response.status, errorText)
            return { success: false, error: `API error: ${response.status}`, latencyMs: Date.now() - startTime, fallbackUsed: true }
        }

        // Parse response JSON
        const data = await response.json()
        const content = data.choices?.[0]?.message?.content  // Groq returns the response text here
        const usage = data.usage ? {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens,
        } : undefined

        if (!content) {
            return { success: false, error: 'Empty response from Groq', latencyMs: Date.now() - startTime, fallbackUsed: true, usage }
        }

        // Parse JSON content from Groq's text response
        let parsed: any
        try {
            parsed = JSON.parse(content)
        } catch {
            console.error('[GroqClient] Failed to parse JSON:', content)
            return { success: false, error: 'Invalid JSON in response', latencyMs: Date.now() - startTime, fallbackUsed: true, usage }
        }

        // Normalize priority to title case — Groq often returns lowercase "urgent" instead of "Urgent"
        if (parsed && typeof parsed.priority === 'string') {
            const p = parsed.priority.toLowerCase()
            const map: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' }
            parsed.priority = map[p] ?? parsed.priority
        }

        // Normalize primary_category — Groq may return null for vague tickets
        if (parsed && (parsed.primary_category === null || parsed.primary_category === undefined)) {
            parsed.primary_category = input.candidate_buckets?.[0] ?? 'GENERAL_MAINTENANCE'
        }

        // Validate output structure against schema
        const outputValidation = LLMOutputSchema.safeParse(parsed)
        if (!outputValidation.success) {
            console.error('[GroqClient] Invalid output schema:', outputValidation.error)
            return { success: false, error: `Invalid output: ${outputValidation.error.message}`, latencyMs: Date.now() - startTime, fallbackUsed: true, usage }
        }

        const result = outputValidation.data

        // Guard: Groq must pick from the provided candidates (not invent new categories)
        if (!input.candidate_buckets.includes(result.primary_category)) {
            console.error('[GroqClient] LLM selected invalid bucket:', result.primary_category)
            return { success: false, error: `LLM selected bucket not in candidates: ${result.primary_category}`, latencyMs: Date.now() - startTime, fallbackUsed: true, usage }
        }

        // Success — return the validated result
        return { success: true, result, latencyMs: Date.now() - startTime, fallbackUsed: false, usage }

    } catch (error) {
        clearTimeout(timeoutId)  // Ensure timeout is cleared on any error

        // Handle timeout specifically (AbortError)
        if (error instanceof Error && error.name === 'AbortError') {
            console.warn('[GroqClient] Request timed out')
            return { success: false, error: 'Request timed out', latencyMs: Date.now() - startTime, fallbackUsed: true }
        }

        console.error('[GroqClient] Unexpected error:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error', latencyMs: Date.now() - startTime, fallbackUsed: true }
    }
}

/**
 * Check if a confidence score meets the minimum threshold for acceptance.
 *
 * @param confidence — Normalized confidence value (0-1)
 * @returns true if confidence >= MIN_CONFIDENCE_THRESHOLD (0.65)
 */
export function isConfidenceAcceptable(confidence: number): boolean {
    return confidence >= MIN_CONFIDENCE_THRESHOLD
}

/**
 * Convert skill group enum to a human-readable display name (for LLM prompt context).
 *
 * @param sg — Skill group enum value
 * @returns Display-friendly name string
 */
export function skillGroupToDisplayName(sg: SkillGroup): string {
    const names: Record<SkillGroup, string> = {
        technical: 'Technical',
        plumbing: 'Plumbing',
        vendor: 'Vendor',
        soft_services: 'Soft Services',
    }
    return names[sg]
}
