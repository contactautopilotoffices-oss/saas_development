/**
 * WhatsApp queue webhook API.
 * Receives queued WhatsApp message events.
 * POST /api/webhooks/whatsapp-queue
 * Auth: Webhook secret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { WhatsAppService } from '@/backend/services/WhatsAppService';

/**
 * POST /api/webhooks/whatsapp-queue
 * Triggered by Supabase DB webhook on INSERT into whatsapp_queue.
 * Sends the WhatsApp message and marks the row as sent or failed.
 */
export async function POST(request: NextRequest) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Supabase DB webhook payload: { type, table, schema, record, old_record }
    const row = body?.record;

    if (!row?.id) {
        return NextResponse.json({ error: 'No record in payload' }, { status: 400 });
    }

    // Only process pending rows — ignore if already sent/failed (safety guard)
    if (row.status !== 'pending') {
        console.log(`[WhatsAppQueue] Skipping row ${row.id} — status is already: ${row.status}`);
        return NextResponse.json({ ok: true, skipped: true });
    }

    console.log(`[WhatsAppQueue] Processing row ${row.id} for event: ${row.event_type}, phone: ${row.phone}`);

    try {
        const sent = await WhatsAppService.sendAsync(row.phone, {
            message: row.message,
            mediaUrl: row.media_url ?? undefined,
            mediaType: row.media_type ?? undefined,
        });

        if (sent) {
            await supabaseAdmin
                .from('whatsapp_queue')
                .update({ status: 'sent', sent_at: new Date().toISOString() })
                .eq('id', row.id);
            console.log(`[WhatsAppQueue] ✅ Sent and marked row ${row.id}`);
            return NextResponse.json({ ok: true });
        } else {
            await supabaseAdmin
                .from('whatsapp_queue')
                .update({
                    status: 'failed',
                    retry_count: (row.retry_count ?? 0) + 1,
                    error: 'WasenderAPI returned failure',
                })
                .eq('id', row.id);
            console.error(`[WhatsAppQueue] ❌ WasenderAPI rejected send for row ${row.id}`);
            return NextResponse.json({ error: 'Send failed' }, { status: 500 });
        }

    } catch (err: any) {
        console.error(`[WhatsAppQueue] ❌ Exception for row ${row.id}:`, err?.message);

        await supabaseAdmin
            .from('whatsapp_queue')
            .update({
                status: 'failed',
                retry_count: (row.retry_count ?? 0) + 1,
                error: err?.message ?? 'Unknown error',
            })
            .eq('id', row.id);

        return NextResponse.json({ error: err?.message }, { status: 500 });
    }
}
