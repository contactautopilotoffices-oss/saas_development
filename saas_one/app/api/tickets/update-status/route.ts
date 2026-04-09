/**
 * Ticket status update API.
 * Updates ticket status with validation.
 * POST /api/tickets/update-status
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * POST /api/tickets/update-status
 * Updates ticket status via Kanban drag-and-drop
 * PRD 5.3: Drag ticket between columns = status change
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { ticketId, newStatus, newAssignee } = body;

        if (!ticketId || !newStatus) {
            return NextResponse.json({ error: 'ticketId and newStatus are required' }, { status: 400 });
        }

        // Validate status
        const validStatuses = ['waitlist', 'open', 'assigned', 'in_progress', 'blocked', 'resolved', 'closed'];
        if (!validStatuses.includes(newStatus)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        // Build update object
        const updateData: Record<string, any> = {
            status: newStatus,
            updated_at: new Date().toISOString(),
        };

        // If moving to resolved, set resolved_at
        if (newStatus === 'resolved') {
            updateData.resolved_at = new Date().toISOString();
        }

        // If reassigning (moving between swimlanes)
        if (newAssignee !== undefined) {
            updateData.assigned_to = newAssignee;
            if (newAssignee) {
                updateData.assigned_at = new Date().toISOString();
                if (newStatus === 'waitlist' || newStatus === 'open') {
                    updateData.status = 'assigned';
                }
            }
        }

        const { data, error } = await supabase
            .from('tickets')
            .update(updateData)
            .eq('id', ticketId)
            .select('id, status, assigned_to, updated_at')
            .single();

        if (error) {
            console.error('[UpdateStatus] Error:', error);
            return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
        }

        // Log activity
        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: 'status_change',
            old_value: null,
            new_value: newStatus,
        });

        // 4. Trigger Notifications
        try {
            const { NotificationService } = await import('@/backend/services/NotificationService');

            if (newAssignee) {
                NotificationService.afterTicketAssigned(ticketId).catch(err => {
                    console.error('[UpdateStatus API] Assignment Notification error:', err);
                });
            }

            if (newStatus === 'waitlist') {
                NotificationService.afterTicketWaitlisted(ticketId).catch(err => {
                    console.error('[UpdateStatus API] Waitlist Notification error:', err);
                });
            }

            if (newStatus === 'resolved' || newStatus === 'closed') {
                NotificationService.afterTicketCompleted(ticketId).catch(err => {
                    console.error('[UpdateStatus API] Completion Notification error:', err);
                });
            }
        } catch (err) {
            console.error('[UpdateStatus API] Failed to load NotificationService:', err);
        }

        return NextResponse.json({
            success: true,
            ticket: data,
        });

    } catch (error) {
        console.error('[UpdateStatus] Error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
