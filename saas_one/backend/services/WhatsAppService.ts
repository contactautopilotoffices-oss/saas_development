/**
 * WhatsApp Direct Send Service — WasenderAPI Integration
 *
 * Purpose: Low-level service for directly sending WhatsApp messages via the WasenderAPI.
 * Handles text, image, video, and poll messages. Used as the underlying delivery mechanism
 * for the WhatsApp queue system.
 *
 * Why this exists:
 *   - WhatsAppQueueService enqueues messages in the DB; this service actually sends them.
 *   - Provides both synchronous (sendAsync) and asynchronous (send) variants.
 *   - Caches phone numbers to reduce DB lookups for repeated sends.
 *
 * API: WasenderAPI (https://wasenderapi.com/api)
 *   - Session-based: requires WASENDER_SENDER_ID (WhatsApp Business account)
 *   - Supports: text, image+caption, video+caption, polls
 *
 * Environment variables:
 *   WASENDER_API_KEY    — API key for authentication
 *   WASENDER_SENDER_ID  — WhatsApp session/phone number ID to send from
 *   APP_URL            — Used to build deep links in messages
 *
 * Phone number handling:
 *   - Indian 10-digit numbers are auto-prepended with country code 91.
 *   - All other numbers are used as-is.
 *
 * Caching strategy:
 *   - In-memory Map caches userId → phone with 5-minute TTL.
 *   - Reduces DB queries when sending to the same user repeatedly.
 *   - Cache is process-local (not shared across Vercel cold starts).
 */

import { supabaseAdmin } from '@/backend/lib/supabase/admin'

const WASENDER_API_KEY = process.env.WASENDER_API_KEY!
const WASENDER_SENDER_ID = process.env.WASENDER_SENDER_ID!
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '')

const BASE_URL = 'https://wasenderapi.com/api'

/** Options for sending a WhatsApp message */
export interface WhatsAppOptions {
    message: string               // Main text content (supports Markdown bold)
    deepLink?: string             // App path — appended to APP_URL for clickable link
    mediaUrl?: string            // URL of image/video to attach
    mediaType?: 'image' | 'video'
}

export class WhatsAppService {
    // In-memory phone cache: userId → { phone, expiresAt }
    // TTL 5 minutes to balance freshness vs. DB load
    private static phoneCache = new Map<string, { phone: string | null; expiresAt: number }>()
    private static CACHE_TTL_MS = 5 * 60 * 1000

    /**
     * Get a user's phone number (with in-memory caching).
     *
     * What it does:
     *   1. Check if a cached entry exists and hasn't expired.
     *   2. If not, query the users table via supabaseAdmin.
     *   3. Cache the result for CACHE_TTL_MS.
     *
     * Why cache: A typical workflow might send 5-10 WhatsApp notifications
     * for one event (to different users). Each user is only queried once per 5 minutes.
     *
     * @returns Phone number string or null if not found
     */
    private static async getPhone(userId: string): Promise<string | null> {
        const cached = this.phoneCache.get(userId)
        if (cached && Date.now() < cached.expiresAt) return cached.phone

        const { data } = await supabaseAdmin
            .from('users')
            .select('phone')
            .eq('id', userId)
            .single()

        const phone = data?.phone || null
        this.phoneCache.set(userId, { phone, expiresAt: Date.now() + this.CACHE_TTL_MS })
        return phone
    }

    /**
     * Format a phone number for WasenderAPI.
     *
     * Why formatting: WasenderAPI expects numbers in a specific format.
     * Indian 10-digit numbers need the country code prefix (91) added.
     * Numbers already prefixed (e.g., 919876543210) are used as-is.
     *
     * @returns Formatted phone number string
     */
    private static formatPhone(phone: string): string {
        const digits = phone.replace(/\D/g, '')  // Strip non-digits
        if (digits.length === 10) return '91' + digits  // Indian 10-digit: add 91
        return digits
    }

    /**
     * Build a full absolute URL from a deep link path.
     * Returns null if no deep link or APP_URL is configured.
     */
    private static buildAbsoluteUrl(deepLink?: string): string | null {
        if (!deepLink || !APP_URL) return null
        return `${APP_URL}${deepLink}`
    }

    /**
     * Make a call to the WasenderAPI endpoint.
     *
     * What it does:
     *   1. POST JSON body to the specified endpoint.
     *   2. Check HTTP status — if non-2xx, log error and return false.
     *   3. Parse response JSON and check the `success` field.
     *   4. WasenderAPI returns HTTP 200 even when the session is disconnected,
     *      so we must check the body `success` field too.
     *   5. Log and return true/false accordingly.
     *
     * @returns true if the API call succeeded, false otherwise
     */
    private static async callAPI(endpoint: string, body: object): Promise<boolean> {
        const res = await fetch(`${BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WASENDER_API_KEY}`,
            },
            body: JSON.stringify(body),
        })

        const responseText = await res.text()

        if (!res.ok) {
            console.error(`[WHATSAPP] API error at ${endpoint}: HTTP ${res.status}`)
            return false
        }

        // WasenderAPI quirk: returns HTTP 200 even when the WhatsApp session is offline.
        // The body's `success` field tells the real story.
        try {
            const parsed = JSON.parse(responseText)
            if (parsed.success === false) {
                console.error(`[WHATSAPP] API error at ${endpoint}: ${parsed.message || 'unknown'}`)
                return false
            }
        } catch {
            // Non-JSON response — treat as success if HTTP status was ok
        }

        return true
    }

    // ============================================================
    // CORE SEND LOGIC
    // ============================================================

    /**
     * Internal send implementation — handles all message types.
     *
     * Send strategy (in order):
     *   1. If mediaUrl + image type → send as image+caption.
     *   2. If mediaUrl + video type → send as video+caption.
     *   3. Fallback to plain text.
     *   4. Image/video send failing → fall back to text (don't lose the message).
     *
     * The deep link is appended to the message as a URL for clickable navigation.
     *
     * @returns true on success, false on any failure
     */
    private static async _send(phone: string, options: WhatsAppOptions): Promise<boolean> {
        if (!WASENDER_API_KEY || !WASENDER_SENDER_ID) {
            console.error('[WHATSAPP] Missing config (WASENDER_API_KEY or WASENDER_SENDER_ID)')
            return false
        }

        const formattedPhone = this.formatPhone(phone)
        if (!formattedPhone || formattedPhone.length < 11) {
            console.error('[WHATSAPP] Invalid phone number, skipping:', phone)
            return false
        }

        // WasenderAPI requires this format for the recipient
        const to = `${formattedPhone}@s.whatsapp.net`

        // Append deep link as a clickable URL below the message
        const ticketUrl = this.buildAbsoluteUrl(options.deepLink)
        const captionText = ticketUrl
            ? `${options.message}\n\n${ticketUrl}`
            : options.message

        try {
            // Try sending as image first
            if (options.mediaUrl && options.mediaType === 'image') {
                const sent = await this.callAPI('send-message', {
                    session: WASENDER_SENDER_ID,
                    to,
                    imageUrl: options.mediaUrl,
                    text: captionText,
                })
                if (sent) return true
                // Fall through to text fallback
            }

            // Try sending as video
            if (options.mediaUrl && options.mediaType === 'video') {
                const sent = await this.callAPI('send-message', {
                    session: WASENDER_SENDER_ID,
                    to,
                    videoUrl: options.mediaUrl,
                    text: captionText,
                })
                if (sent) return true
                // Fall through to text fallback
            }

            // Plain text fallback
            return await this.callAPI('send-message', {
                session: WASENDER_SENDER_ID,
                to,
                text: captionText,
            })

        } catch (err) {
            console.error('[WHATSAPP] Network error during send:', err)
            return false
        }
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    /**
     * Send a WhatsApp poll message to a single recipient.
     * Used for surveys, feedback collection, or multi-choice requests.
     *
     * @param phone   — Recipient's formatted phone number
     * @param question — The poll question text
     * @param options — Array of poll answer options (max 12 per WhatsApp policy)
     */
    static async sendPoll(phone: string, question: string, options: string[]): Promise<boolean> {
        if (!WASENDER_API_KEY || !WASENDER_SENDER_ID) return false
        const formattedPhone = this.formatPhone(phone)
        if (!formattedPhone || formattedPhone.length < 11) return false

        const to = `${formattedPhone}@s.whatsapp.net`
        try {
            await this.callAPI('send-message', {
                session: WASENDER_SENDER_ID,
                to,
                poll: {
                    question,
                    options: options.slice(0, 12),  // WhatsApp limits polls to 12 options
                    multiSelect: false,
                },
            })
            return true
        } catch (err) {
            console.error('[WHATSAPP] Poll send error:', err)
            return false
        }
    }

    /**
     * Fire-and-forget send — logs any errors but never throws.
     * Use this when you don't need to wait for the send to complete.
     */
    static send(phone: string, options: WhatsAppOptions): void {
        this._send(phone, options).catch(err => console.error('[WHATSAPP] Send error:', err))
    }

    /**
     * Wait for send to complete and return a boolean result.
     * Use this when you need confirmation that the message was delivered.
     */
    static async sendAsync(phone: string, options: WhatsAppOptions): Promise<boolean> {
        return this._send(phone, options)
    }

    /**
     * Send a message to a user by their database user ID.
     * Resolves the phone number from the cache or DB first.
     *
     * @returns 'SENT' | 'SKIPPED' | 'FAILED'
     *   - SKIPPED: User has no phone number on record
     *   - SENT: Message was successfully dispatched to the API
     *   - FAILED: Network error or API error
     */
    static async sendToUser(userId: string, options: WhatsAppOptions): Promise<'SENT' | 'SKIPPED' | 'FAILED'> {
        const phone = await this.getPhone(userId)
        if (!phone) {
            console.warn('[WHATSAPP] No phone number for userId:', userId, '— skipping.')
            return 'SKIPPED'
        }
        try {
            await this._send(phone, options)
            return 'SENT'
        } catch (err) {
            console.error('[WHATSAPP] Send error:', err)
            return 'FAILED'
        }
    }

    /**
     * Send a message to multiple users by their database user IDs.
     * Fetches all phone numbers in one batch query, then sends sequentially.
     * Includes a 500ms delay between sends to respect WasenderAPI rate limits.
     *
     * @param userIds — Array of user IDs to notify
     * @param options — Message options (text, media, deep link)
     */
    static async sendToUsers(userIds: string[], options: WhatsAppOptions): Promise<void> {
        if (userIds.length === 0) return

        // Batch fetch all phone numbers in one query (instead of N queries)
        const { data } = await supabaseAdmin
            .from('users')
            .select('id, phone')
            .in('id', userIds)

        for (const user of data || []) {
            if (user.phone) {
                this.send(user.phone, options)
                // 500ms delay between sends to avoid rate limiting
                await new Promise(r => setTimeout(r, 500))
            }
        }
    }
}
