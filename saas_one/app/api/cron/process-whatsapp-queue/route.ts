/**
 * @fileoverview WhatsApp Queue Processor Cron API
 * @route GET /api/cron/process-whatsapp-queue
 * @description
 *   Safety-net fallback processor for the WhatsApp message queue. Designed to
 *   handle any `pending` rows that were not successfully sent by the primary
 *   DB-change webhook handler (e.g., due to timeouts, server restarts, or
 *   missed events). Runs on a schedule (e.g., every minute via Vercel Cron).
 *
 *   Only processes rows older than 60 seconds (to avoid races with in-flight
 *   webhook processing) and with `retry_count < 3`. After 3 failed retries the
 *   row is marked `failed` and excluded from further processing.
 *   Protected by a bearer token matching the `CRON_SECRET` environment variable.
 * @requires_auth Bearer token (CRON_SECRET)
 * @response 200 { processed, sent, failed }
 * @response 401 Unauthorized — invalid or missing bearer token
 * @response 500 Internal Server Error
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { WhatsAppService } from '@/backend/services/WhatsAppService';

/**
 * GET /api/cron/process-whatsapp-queue
 * Fallback safety net — picks up any pending rows the DB webhook missed.
 * Runs every minute via Vercel Cron.
 * Only processes rows older than 60 seconds to avoid racing the webhook.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const cutoff = new Date(Date.now() - 60_000).toISOString();

    const { data: pending, error } = await supabaseAdmin
        .from('whatsapp_queue')
        .select('*')
        .eq('status', 'pending')
        .lt('created_at', cutoff)
        .lt('retry_count', 3)
        .order('created_at', { ascending: true })
        .limit(20);

    if (error) {
        console.error('[CRON] process-whatsapp-queue fetch error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
        return NextResponse.json({ processed: 0 });
    }

    console.log(`[CRON] process-whatsapp-queue: found ${pending.length} stuck pending rows`);

    let sent = 0;
    let failed = 0;

    for (const row of pending) {
        const success = await WhatsAppService.sendAsync(row.phone, {
            message: row.message,
            mediaUrl: row.media_url ?? undefined,
            mediaType: row.media_type ?? undefined,
        });

        if (success) {
            await supabaseAdmin
                .from('whatsapp_queue')
                .update({ status: 'sent', sent_at: new Date().toISOString() })
                .eq('id', row.id);
            sent++;
        } else {
            await supabaseAdmin
                .from('whatsapp_queue')
                .update({
                    status: row.retry_count + 1 >= 3 ? 'failed' : 'pending',
                    retry_count: row.retry_count + 1,
                    error: 'Cron retry failed',
                })
                .eq('id', row.id);
            failed++;
        }
    }

    console.log(`[CRON] process-whatsapp-queue: sent=${sent}, failed=${failed}`);
    return NextResponse.json({ processed: pending.length, sent, failed });
}
