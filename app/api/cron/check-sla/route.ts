import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/cron/check-sla
 * Checks active tickets for approaching SLA breaches (e.g., due in < 30 mins).
 * Inserts notifications for assigned MSTs.
 * Intended to be called by an external cron service (e.g., Vercel Cron, GitHub Actions).
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const { data: tickets, error } = await supabaseAdmin
            .from('tickets')
            .select(`
                id, ticket_number, title, created_at, assigned_to
            `)
            .eq('status', 'in_progress')
            .not('assigned_to', 'is', null);

        if (error) throw error;

        const notifications = [];
        const now = new Date();

        // Build dedup set: ticket IDs that already received an SLA warning in the last 25 minutes.
        // This prevents the per-minute cron from spamming the same alert every tick.
        const candidateTicketIds = (tickets || [])
            .filter(t => {
                const dueAt = new Date(new Date(t.created_at).getTime() + 4 * 60 * 60 * 1000);
                const mins = (dueAt.getTime() - now.getTime()) / 60000;
                return mins > 0 && mins <= 30;
            })
            .map(t => t.id);

        const alreadyNotifiedIds = new Set<string>();
        if (candidateTicketIds.length > 0) {
            const dedupCutoff = new Date(now.getTime() - 25 * 60_000).toISOString();
            const { data: recentNotifs } = await supabaseAdmin
                .from('notifications')
                .select('entity_id')
                .eq('type', 'sla_warning')
                .in('entity_id', candidateTicketIds)
                .gte('created_at', dedupCutoff);
            for (const n of recentNotifs || []) alreadyNotifiedIds.add(n.entity_id);
        }

        for (const ticket of tickets || []) {
            const createdAt = new Date(ticket.created_at);
            const dueAt = new Date(createdAt.getTime() + 4 * 60 * 60 * 1000); // Mock 4h SLA
            const timeRemaining = dueAt.getTime() - now.getTime();
            const minutesRemaining = Math.floor(timeRemaining / 60000);

            if (minutesRemaining > 0 && minutesRemaining <= 30 && !alreadyNotifiedIds.has(ticket.id)) {
                notifications.push({
                    type: 'sla_warning',
                    recipient_role: 'MST',
                    recipient_id: ticket.assigned_to,
                    title: 'SLA At Risk',
                    body: `${ticket.ticket_number} is expiring in ${minutesRemaining} minutes.`,
                    entity_id: ticket.id
                });
            }
        }

        if (notifications.length > 0) {
            const { error: insertError } = await supabaseAdmin
                .from('notifications')
                .insert(notifications);

            if (insertError) throw insertError;
        }

        return NextResponse.json({
            success: true,
            checked: tickets?.length,
            notifications_sent: notifications.length
        });

    } catch (error) {
        console.error('[SLA Cron] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
