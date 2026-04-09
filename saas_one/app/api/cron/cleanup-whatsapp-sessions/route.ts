/**
 * WhatsApp session cleanup cron.
 * Deletes expired WhatsApp property-selection sessions.
 * POST /api/cron/cleanup-whatsapp-sessions
 * Auth: Cron secret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/cron/cleanup-whatsapp-sessions
 * Deletes expired whatsapp_sessions rows.
 * Run every 30 minutes via Vercel Cron.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { error, count } = await supabaseAdmin
        .from('whatsapp_sessions')
        .delete({ count: 'exact' })
        .lt('expires_at', new Date().toISOString());

    if (error) {
        console.error('[CRON] cleanup-whatsapp-sessions error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[CRON] Deleted ${count} expired whatsapp sessions`);
    return NextResponse.json({ deleted: count });
}
