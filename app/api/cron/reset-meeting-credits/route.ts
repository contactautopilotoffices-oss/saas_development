import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/cron/reset-meeting-credits
 * Called by a cron job monthly. Resets remaining_hours to monthly_hours
 * for all tenants whose next_reset_at <= now.
 * Secured by CRON_SECRET header.
 */
export async function GET(request: NextRequest) {
    const secret = request.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const now = new Date().toISOString();

        const { data: dueCredits, error: fetchErr } = await supabaseAdmin
            .from('meeting_room_credits')
            .select('id, user_id, monthly_hours, remaining_hours')
            .lte('next_reset_at', now);

        if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
        if (!dueCredits || dueCredits.length === 0) {
            return NextResponse.json({ message: 'No credits due for reset', count: 0 });
        }

        const nextReset = new Date();
        nextReset.setMonth(nextReset.getMonth() + 1);
        nextReset.setDate(1);
        nextReset.setHours(0, 0, 0, 0);
        const nextResetIso = nextReset.toISOString();

        let resetCount = 0;
        for (const credit of dueCredits) {
            const { error } = await supabaseAdmin
                .from('meeting_room_credits')
                .update({
                    remaining_hours: credit.monthly_hours,
                    last_reset_at: now,
                    next_reset_at: nextResetIso,
                    updated_at: now,
                })
                .eq('id', credit.id);

            if (!error) {
                resetCount++;
                await supabaseAdmin.from('meeting_room_credit_log').insert({
                    credit_id: credit.id,
                    user_id: credit.user_id,
                    action: 'monthly_reset',
                    hours_changed: credit.monthly_hours - credit.remaining_hours,
                    hours_after: credit.monthly_hours,
                    performed_by: null,
                    notes: 'Monthly credit reset',
                });
            }
        }

        console.log(`[Credit Reset] Reset ${resetCount}/${dueCredits.length} records`);
        return NextResponse.json({ success: true, reset: resetCount, total: dueCredits.length });
    } catch (err) {
        console.error('[Credit Reset] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
