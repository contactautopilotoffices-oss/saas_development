/**
 * Ticket acceptance API.
 * MST accepts an assigned ticket to start work.
 * POST /api/tickets/[id]/accept
 * Auth: MST/Staff role.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * POST /api/tickets/[id]/accept
 * Resolver accepts assigned ticket and starts work
 */
export async function POST(
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

        // Get current ticket
        const { data: ticket } = await supabase
            .from('tickets')
            .select('*')
            .eq('id', ticketId)
            .single();

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        if (ticket.assigned_to !== user.id) {
            return NextResponse.json({ error: 'Ticket not assigned to you' }, { status: 403 });
        }

        if (ticket.status === 'in_progress') {
            return NextResponse.json({ error: 'Ticket already in progress' }, { status: 400 });
        }

        // Accept and start work
        const { data: updated, error } = await supabase
            .from('tickets')
            .update({
                status: 'in_progress',
                accepted_at: new Date().toISOString(),
                work_started_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', ticketId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to accept ticket' }, { status: 500 });
        }

        // Log activity
        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: 'accepted',
            new_value: 'in_progress',
        });

        return NextResponse.json({ success: true, ticket: updated });
    } catch (error) {
        console.error('Accept ticket error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
