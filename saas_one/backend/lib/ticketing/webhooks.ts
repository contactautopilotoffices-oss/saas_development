/// <reference types="node" />

/**
 * Webhook Emitter for Ticket Categorization Events
 *
 * Purpose: Fires HTTP POST events to an external webhook URL when significant
 * classification events occur. Enables observability, audit logging, and
 * integration with external monitoring systems.
 *
 * Why webhooks:
 *   - Allows external systems (Slack, PagerDuty, custom dashboards) to react
 *     to ticket classification events in real time.
 *   - Decouples the classification system from notification/monitoring concerns.
 *   - Provides an audit trail beyond the database (can forward to log services).
 *
 * Events emitted:
 *   - ticket.categorized    : Final routing decision made (with priority, risk, reasoning)
 *   - llm.invoked           : LLM was called for a ticket (with latency, usage metrics)
 *   - rule.low_confidence   : Rule engine had low confidence (flagged for review)
 *
 * Design: Fire-and-forget (async, non-blocking). Webhook failures do not affect
 * ticket creation or classification. This ensures webhooks never impact main flow.
 *
 * Environment variable:
 *   CATEGORIZATION_WEBHOOK_URL — External endpoint to receive events (optional)
 *
 * Part of: Hybrid Ticket Classification System observability layer.
 */

export interface WebhookPayload {
    event: 'ticket.categorized' | 'llm.invoked' | 'rule.low_confidence'
    timestamp: string            // ISO 8601 timestamp of when the event occurred
    ticket_id: string            // The ticket this event relates to
    data: any                    // Event-specific data payload
}

/** External webhook URL configured via environment variable (optional) */
const WEBHOOK_URL = (process as { env?: Record<string, string | undefined> }).env?.CATEGORIZATION_WEBHOOK_URL

/**
 * Emit a webhook event to the configured external URL.
 *
 * What it does:
 *   1. Constructs a typed payload with event name, timestamp, ticket ID, and data.
 *   2. Checks if a webhook URL is configured (skips silently if not).
 *   3. Sends a POST request with JSON body (fire-and-forget, non-blocking).
 *   4. Catches and logs any network errors — never throws.
 *
 * @param event    — The event type (determines payload structure)
 * @param ticketId — The ticket ID this event pertains to
 * @param data     — Event-specific data (e.g., priority, skill_group, latency)
 *
 * Why fire-and-forget:
 *   - Webhooks are secondary/observability features. Main flow = ticket creation.
 *   - A slow or failing webhook should never delay or break ticket processing.
 *   - Errors are caught and logged so operators can debug webhook issues.
 *
 * @returns void (async, non-blocking)
 */
export async function emitWebhook(event: WebhookPayload['event'], ticketId: string, data: any): Promise<void> {
    const payload: WebhookPayload = {
        event,
        timestamp: new Date().toISOString(),
        ticket_id: ticketId,
        data
    }

    console.log(`[Webhook] Emitting ${event} for ticket ${ticketId}`)

    // Skip if no webhook URL is configured — this is expected in development
    if (!WEBHOOK_URL) {
        console.warn('[Webhook] No WEBHOOK_URL configured, skipping emission')
        return
    }

    try {
        // Use fetch without await on the response — we don't care about the result
        // This makes it truly fire-and-forget
        fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => {
            // Log but don't throw — webhook failures must never impact main flow
            console.error(`[Webhook] Failed to emit ${event}:`, err)
        })
    } catch (err) {
        console.error(`[Webhook] Error preparing ${event}:`, err)
    }
}
