/**
 * POST /api/tickets/[id]/rating
 * Submit rating for a resolved ticket
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
 * Submit rating for a resolved ticket
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

        const body = await request.json();
        const { rating, comment } = body;

        if (!rating || rating < 1 || rating > 5) {
            return NextResponse.json({ error: 'Rating must be between 1 and 5' }, { status: 400 });
        }

        // Verify ticket exists and is resolved
        const { data: ticket } = await supabase
            .from('tickets')
            .select('id, status, created_by')
            .eq('id', ticketId)
            .single();

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        if (!['resolved', 'closed'].includes(ticket.status)) {
            return NextResponse.json({ error: 'Can only rate resolved tickets' }, { status: 400 });
        }

        // Only creator can rate
        if (ticket.created_by !== user.id) {
            return NextResponse.json({ error: 'Only ticket creator can rate' }, { status: 403 });
        }

        // Update ticket with rating
        const { data: updated, error } = await supabase
            .from('tickets')
            .update({
                rating,
                updated_at: new Date().toISOString(),
            })
            .eq('id', ticketId)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to save rating' }, { status: 500 });
        }

        // Log activity
        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: 'rated',
            new_value: `${rating}/5${comment ? ` - ${comment}` : ''}`,
        });

        return NextResponse.json({ success: true, ticket: updated });
    } catch (error) {
        console.error('Rating error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
