/**
 * PATCH /api/tickets/[id]/pause-sla
 * Pause or resume SLA for a ticket
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
 * Pause or resume SLA for a ticket
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { pause, reason } = body;

        // Get current ticket
        const { data: ticket } = await supabase
            .from('tickets')
            .select('*')
            .eq('id', ticketId)
            .single();

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        const updates: Record<string, unknown> = {
            sla_paused: pause,
            updated_at: new Date().toISOString(),
        };

        if (pause) {
            // Pausing SLA
            updates.sla_paused_at = new Date().toISOString();
            updates.sla_pause_reason = reason || 'Paused by admin';
        } else {
            // Resuming SLA - calculate paused duration and extend deadline
            if (ticket.sla_paused_at) {
                const pausedAt = new Date(ticket.sla_paused_at);
                const pausedMinutes = Math.floor((Date.now() - pausedAt.getTime()) / 60000);
                updates.total_paused_minutes = (ticket.total_paused_minutes || 0) + pausedMinutes;

                // Extend SLA deadline by paused duration
                if (ticket.sla_deadline) {
                    const newDeadline = new Date(ticket.sla_deadline);
                    newDeadline.setMinutes(newDeadline.getMinutes() + pausedMinutes);
                    updates.sla_deadline = newDeadline.toISOString();
                }
            }
            updates.sla_paused_at = null;
            updates.sla_pause_reason = null;
        }

        const { data: updated, error } = await supabase
            .from('tickets')
            .update(updates)
            .eq('id', ticketId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to update SLA' }, { status: 500 });
        }

        // Log activity
        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: pause ? 'sla_paused' : 'sla_resumed',
            new_value: reason || (pause ? 'SLA paused' : 'SLA resumed'),
        });

        return NextResponse.json({ success: true, ticket: updated });
    } catch (error) {
        console.error('SLA pause error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
