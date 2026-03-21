import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * POST /api/tickets/reassign
 * Reassigns a ticket to a different MST via Kanban swimlane drag
 * PRD 5.3 & User Requirement: Manual ticket assignment override
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { ticketId, newAssigneeId, forceAssign } = body;

        if (!ticketId) {
            return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
        }

        // Get ticket details
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .select('id, skill_group_id, property_id, assigned_to')
            .eq('id', ticketId)
            .single();

        if (ticketError || !ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // If assigning to a new MST, check skill match (unless forced)
        let skillMismatchWarning = null;
        if (newAssigneeId && !forceAssign && ticket.skill_group_id) {
            const { data: resolverStats } = await supabase
                .from('resolver_stats')
                .select('skill_group_id')
                .eq('user_id', newAssigneeId)
                .eq('property_id', ticket.property_id);

            const hasMatchingSkill = resolverStats?.some(
                (rs: any) => rs.skill_group_id === ticket.skill_group_id
            );

            if (!hasMatchingSkill) {
                skillMismatchWarning = 'Assignee may not have the required skill for this ticket';
            }
        }

        // Update ticket assignment
        const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        if (newAssigneeId === null) {
            // Unassign → move to waitlist
            updateData.assigned_to = null;
            updateData.assigned_at = null;
            updateData.status = 'waitlist';
        } else {
            updateData.assigned_to = newAssigneeId;
            updateData.assigned_at = new Date().toISOString();
            updateData.status = 'assigned';
        }

        const { data, error } = await supabase
            .from('tickets')
            .update(updateData)
            .eq('id', ticketId)
            .select('id, status, assigned_to, updated_at')
            .single();

        if (error) {
            console.error('[Reassign] Error:', error);
            return NextResponse.json({ error: 'Failed to reassign ticket' }, { status: 500 });
        }

        // Log activity
        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: 'reassigned',
            old_value: ticket.assigned_to,
            new_value: newAssigneeId,
        });

        // Trigger Notifications
        try {
            const { NotificationService } = await import('@/backend/services/NotificationService');
            if (newAssigneeId) {
                NotificationService.afterTicketReassigned(ticketId).catch(err => {
                    console.error('[Reassign API] Reassign Notification error:', err);
                });
            } else {
                NotificationService.afterTicketWaitlisted(ticketId).catch(err => {
                    console.error('[Reassign API] Waitlist Notification error:', err);
                });
            }
        } catch (err) {
            console.error('[Reassign API] Failed to load NotificationService:', err);
        }

        return NextResponse.json({
            success: true,
            ticket: data,
            warning: skillMismatchWarning,
        });

    } catch (error) {
        console.error('[Reassign] Error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
