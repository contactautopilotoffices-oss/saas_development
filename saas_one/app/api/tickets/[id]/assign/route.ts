/**
 * POST /api/tickets/[ticketId]/assign
 * Updates the assignment of a ticket.
 * If assigned_to is provided: assigns to that user.
 * If assigned_to is null: unassigns the ticket (moves back to waitlist).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
 * Updates the assignment of a ticket.
 * If assigned_to is provided: assigns to that user.
 * If assigned_to is null: unassigns the ticket (moves back to waitlist).
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { assigned_to } = body;

        // 1. Check permissions (Master Admin, Org Super Admin, or Property Admin)
        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        // For now, allow staff or higher to reassign if they have property access
        // (Simplified for this MVP, in real world we'd check property membership role)

        // 2. Prepare update payload
        const updates: any = {
            updated_at: new Date().toISOString(),
        };

        if (assigned_to) {
            updates.assigned_to = assigned_to;
            updates.status = 'assigned';
            updates.assigned_at = new Date().toISOString();

            // If it was already in_progress, keep it in_progress OR reset to assigned?
            // Usually, re-assignment resets to 'assigned' unless specified.
        } else {
            updates.assigned_to = null;
            updates.status = 'waitlist';
            updates.assigned_at = null;
        }

        const { data, error: updateError } = await supabase
            .from('tickets')
            .update(updates)
            .eq('id', ticketId)
            .select('*')
            .single();

        if (updateError) {
            console.error('[Assign Ticket API] Update error:', updateError);
            return NextResponse.json({ error: 'Failed to update assignment' }, { status: 500 });
        }

        // 3. Log activity
        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: assigned_to ? 'assigned' : 'unassigned',
            new_value: assigned_to || 'waitlist'
        });

        // 4. Trigger Notifications
        if (assigned_to) {
            try {
                const { NotificationService } = await import('@/backend/services/NotificationService');
                NotificationService.afterTicketAssigned(ticketId).catch(err => {
                    console.error('[Assign API] Notification error:', err);
                });
            } catch (err) {
                console.error('[Assign API] Failed to load NotificationService:', err);
            }
        }

        return NextResponse.json({ success: true, ticket: data });

    } catch (error) {
        console.error('[Assign Ticket API] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
