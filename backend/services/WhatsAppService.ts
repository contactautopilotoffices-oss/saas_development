import { supabaseAdmin } from '@/backend/lib/supabase/admin';

const WASENDER_API_KEY = process.env.WASENDER_API_KEY!;
const WASENDER_SENDER_ID = process.env.WASENDER_SENDER_ID!;
const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');

const BASE_URL = 'https://wasenderapi.com/api';

export interface WhatsAppOptions {
    message: string;
    deepLink?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video';
}

export class WhatsAppService {


    private static async getPhone(userId: string): Promise<string | null> {
        const { data } = await supabaseAdmin
            .from('users')
            .select('phone')
            .eq('id', userId)
            .single();
        return data?.phone || null;
    }

    private static formatPhone(phone: string): string {
        const digits = phone.replace(/\D/g, '');
        // Indian 10-digit numbers → prepend country code 91
        if (digits.length === 10) return '91' + digits;
        return digits;
    }

    private static buildAbsoluteUrl(deepLink?: string): string | null {
        if (!deepLink || !APP_URL) return null;
        return `${APP_URL}${deepLink}`;
    }

    private static async callAPI(endpoint: string, body: object): Promise<boolean> {
        const res = await fetch(`${BASE_URL}/${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${WASENDER_API_KEY}`,
            },
            body: JSON.stringify(body),
        });

        const responseText = await res.text();

        if (!res.ok) {
            console.error(`>>>>>>>>>> [WHATSAPP] ❌ [${endpoint}] FAILED — Status: ${res.status}`);
            console.error('>>>>>>>>>> [WHATSAPP] Response:', responseText);
            return false;
        }

        // WasenderAPI returns HTTP 200 even when session is disconnected.
        // Must also check the body's success field.
        try {
            const parsed = JSON.parse(responseText);
            if (parsed.success === false) {
                console.error(`>>>>>>>>>> [WHATSAPP] ❌ [${endpoint}] API ERROR — ${parsed.message || 'unknown'}`);
                return false;
            }
        } catch {
            // Non-JSON response — treat as success if HTTP was ok
        }

        console.log(`>>>>>>>>>> [WHATSAPP] ✅ [${endpoint}] SENT SUCCESSFULLY`);
        console.log('>>>>>>>>>> [WHATSAPP] Response:', responseText);
        return true;
    }

    // The actual send logic — runs inside the serial queue
    private static async _send(phone: string, options: WhatsAppOptions): Promise<void> {
        if (!WASENDER_API_KEY || !WASENDER_SENDER_ID) {
            console.error('>>>>>>>>>> [WHATSAPP] ❌ MISSING CONFIG');
            return;
        }

        const formattedPhone = this.formatPhone(phone);
        if (!formattedPhone || formattedPhone.length < 11) {
            console.error('>>>>>>>>>> [WHATSAPP] ❌ Invalid phone number, skipping:', phone);
            return;
        }

        const to = `${formattedPhone}@s.whatsapp.net`;
        const ticketUrl = this.buildAbsoluteUrl(options.deepLink);
        const captionText = ticketUrl
            ? `${options.message}\n\n${ticketUrl}`
            : options.message;

        console.log('>>>>>>>>>> [WHATSAPP] To:', to);
        console.log('>>>>>>>>>> [WHATSAPP] Media:', options.mediaUrl || 'none');
        console.log('>>>>>>>>>> [WHATSAPP] Message:', captionText);

        try {
            if (options.mediaUrl && options.mediaType === 'image') {
                console.log('>>>>>>>>>> [WHATSAPP] Sending as image+caption message...');
                const sent = await this.callAPI('send-message', {
                    session: WASENDER_SENDER_ID,
                    to,
                    imageUrl: options.mediaUrl,
                    text: captionText,
                });
                if (sent) return;
                console.log('>>>>>>>>>> [WHATSAPP] Image send failed, falling back to text...');
            }

            if (options.mediaUrl && options.mediaType === 'video') {
                console.log('>>>>>>>>>> [WHATSAPP] Sending as video+caption message...');
                const sent = await this.callAPI('send-message', {
                    session: WASENDER_SENDER_ID,
                    to,
                    videoUrl: options.mediaUrl,
                    text: captionText,
                });
                if (sent) return;
                console.log('>>>>>>>>>> [WHATSAPP] Video send failed, falling back to text...');
            }

            // Plain text fallback
            console.log('>>>>>>>>>> [WHATSAPP] Sending as text message...');
            await this.callAPI('send-message', {
                session: WASENDER_SENDER_ID,
                to,
                text: captionText,
            });

        } catch (err) {
            console.error('>>>>>>>>>> [WHATSAPP] ❌ NETWORK ERROR:', err);
        }
    }

    static sendPoll(phone: string, question: string, options: string[]): void {
        if (!WASENDER_API_KEY || !WASENDER_SENDER_ID) return;
        const formattedPhone = this.formatPhone(phone);
        if (!formattedPhone || formattedPhone.length < 11) return;
        const to = `${formattedPhone}@s.whatsapp.net`;
        this.callAPI('send-message', {
            session: WASENDER_SENDER_ID,
            to,
            poll: {
                question,
                options: options.slice(0, 12), // WasenderAPI max is 12
                multiSelect: false,
            },
        }).catch((err: unknown) => console.error('>>>>>>>>>> [WHATSAPP] Poll send error:', err));
    }

    static send(phone: string, options: WhatsAppOptions): void {
        WhatsAppService._send(phone, options).catch((err: unknown) =>
            console.error('>>>>>>>>>> [WHATSAPP] Send error:', err)
        );
    }

    static async sendToUser(userId: string, options: WhatsAppOptions): Promise<void> {
        console.log('>>>>>>>>>> [WHATSAPP] sendToUser() for userId:', userId);
        const phone = await this.getPhone(userId);
        if (!phone) {
            console.warn('>>>>>>>>>> [WHATSAPP] ⚠️ No phone number for userId:', userId, '— skipping.');
            return;
        }
        console.log('>>>>>>>>>> [WHATSAPP] Phone found:', phone);
        this.send(phone, options);
    }

    static async sendToUsers(userIds: string[], options: WhatsAppOptions): Promise<void> {
        if (userIds.length === 0) return;
        // Batch fetch all phone numbers in one query instead of N sequential queries
        const { data } = await supabaseAdmin
            .from('users')
            .select('id, phone')
            .in('id', userIds);
        for (const user of data || []) {
            if (user.phone) this.send(user.phone, options);
        }
    }
}
