import { supabaseAdmin } from '@/backend/lib/supabase/admin';

export interface WhatsAppQueuePayload {
    ticketId?: string;
    userIds: string[];
    message: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video';
    eventType: string;
}

export class WhatsAppQueueService {
    /**
     * Batch-enqueue WhatsApp messages for multiple users.
     * Fetches all phone numbers in one query, then inserts all rows in one INSERT.
     * The Supabase DB webhook fires per-row and sends each message independently.
     */
    static async enqueue(payload: WhatsAppQueuePayload): Promise<void> {
        if (payload.userIds.length === 0) return;

        const { data: users } = await supabaseAdmin
            .from('users')
            .select('id, phone')
            .in('id', payload.userIds);

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
                status: 'pending',
            }));

        if (rows.length === 0) {
            console.log('[WhatsAppQueue] No users with phone numbers, skipping enqueue.');
            return;
        }

        const { error } = await supabaseAdmin.from('whatsapp_queue').insert(rows);
        if (error) {
            console.error('[WhatsAppQueue] Failed to insert queue rows:', error.message);
        } else {
            console.log(`[WhatsAppQueue] Enqueued ${rows.length} messages for event: ${payload.eventType}`);
        }
    }
}
