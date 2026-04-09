/**
 * WhatsApp Queue Service — Batch Message Enqueueing
 *
 * Purpose: High-performance batch insertion of WhatsApp messages into the `whatsapp_queue`
 * database table. A Supabase DB webhook (database trigger) processes each row and calls
 * the WasenderAPI to deliver the actual message.
 *
 * Why a queue + DB approach (instead of direct sending):
 *   1. Performance: Ticket creation shouldn't wait for WhatsApp delivery (which can take
 *      1-5 seconds per message). Inserting into a DB table is fast (~10ms).
 *   2. Reliability: If WasenderAPI is down, messages aren't lost — they sit in the queue
 *      and get retried by the cron processor.
 *   3. Rate limiting: The cron processor (process-whatsapp-queue) can pace message delivery
 *      to respect WasenderAPI rate limits.
 *   4. Auditability: Every WhatsApp message is tracked in the queue with status.
 *
 * Flow:
 *   1. API route calls WhatsAppQueueService.enqueue() with a list of user IDs.
 *   2. This service fetches phone numbers for all users in one query.
 *   3. Inserts all queue rows in one bulk INSERT.
 *   4. A Supabase DB webhook fires per row and calls WasenderAPI.
 *   5. A cron job (process-whatsapp-queue) retries failed messages.
 *
 * Database table: whatsapp_queue
 *   - ticket_id   : Optional ticket this message relates to
 *   - user_id     : Recipient's user ID
 *   - phone       : Recipient's WhatsApp number
 *   - message     : Text content
 *   - media_url   : Optional image/video URL
 *   - media_type  : 'image' | 'video' | null
 *   - event_type  : Category label (e.g., 'TICKET_ASSIGNED', 'TICKET_CREATED')
 *   - status      : 'pending' | 'sent' | 'failed'
 *
 * Environment variables: None (uses supabaseAdmin which reads Supabase env vars)
 */

import { supabaseAdmin } from '@/backend/lib/supabase/admin'

/** Payload for enqueueing a batch of WhatsApp messages */
export interface WhatsAppQueuePayload {
    ticketId?: string              // Optional ticket ID for context
    userIds: string[]             // Array of user IDs to notify
    message: string               // WhatsApp message text (with or without Markdown)
    mediaUrl?: string             // Optional URL of image/video to attach
    mediaType?: 'image' | 'video' // Type of media (determines how WasenderAPI sends it)
    eventType: string             // Event category (e.g., 'TICKET_ASSIGNED') for filtering
}

export class WhatsAppQueueService {
    /**
     * Enqueue WhatsApp messages for multiple users in a single DB operation.
     *
     * What it does:
     *   1. Fetches phone numbers for all target users in one batch query.
     *   2. Filters out users with no phone number on record.
     *   3. Maps the data into queue rows (one per user with a valid phone).
     *   4. Performs a single bulk INSERT into the whatsapp_queue table.
     *
     * Why single INSERT: Bulk operations are much faster than N individual inserts
     * and reduce DB round-trips from O(n) to O(1).
     *
     * @param payload — Contains userIds, message, optional media, event type
     * @returns void (fire-and-forget from the caller's perspective)
     *
     * Failures: Logged to console but never thrown. An empty userIds array is a no-op.
     */
    static async enqueue(payload: WhatsAppQueuePayload): Promise<void> {
        // No users to notify — nothing to do
        if (payload.userIds.length === 0) return

        // Fetch phone numbers for all target users in one query
        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id, phone')
            .in('id', payload.userIds)

        // Build queue rows — only include users with a phone number
        const rows = (users || [])
            .filter(u => u.phone)
            .map(u => ({
                ticket_id: payload.ticketId || null,
                user_id: u.id,
                phone: u.phone as string,
                message: payload.message,
                media_url: payload.mediaUrl ?? null,
                media_type: payload.mediaType ?? null,
                event_type: payload.eventType,
                status: 'pending',  // DB webhook will update this to 'sent'/'failed'
            }))

        if (rows.length === 0) {
            console.log('[WhatsAppQueue] No users with phone numbers, skipping enqueue.')
            return
        }

        // Bulk insert all queue rows
        const { error } = await supabaseAdmin.from('whatsapp_queue').insert(rows)
        if (error) {
            console.error('[WhatsAppQueue] Failed to insert queue rows:', error.message)
        } else {
            console.log(`[WhatsAppQueue] Enqueued ${rows.length} messages for event: ${payload.eventType}`)
        }
    }
}
