/**
 * Batch ticket assignment API.
 * Assigns multiple tickets at once to a user.
 * POST /api/tickets/batch-assign
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { NotificationService } from '@/backend/services/NotificationService';

/**
 * POST /api/tickets/batch-assign
 * Accepts an array of assignments: { ticket_id, assigned_to }
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { assignments } = body;

        if (!Array.isArray(assignments) || assignments.length === 0) {
            return NextResponse.json({ error: 'Invalid assignments data' }, { status: 400 });
        }

        const now = new Date().toISOString();
        const results = [];
        const auditLogs = [];

        // In a real production app, use an RPC or transaction
        // For this implementation, we'll iterate and update (Supabase doesn't support transactions via REST easily)
        for (const assignment of assignments) {
            const { ticket_id, assigned_to } = assignment;

            // 1. If assigned_to is provided, fetch MST's skill_group_id from resolver_stats
            let skillGroupId = null;
            if (assigned_to) {
                const { data: stats } = await supabase
                    .from('resolver_stats')
                    .select('skill_group_id')
                    .eq('user_id', assigned_to)
                    .limit(1)
                    .maybeSingle();

                if (stats?.skill_group_id) {
                    skillGroupId = stats.skill_group_id;
                }
            }

            // 2. Update Ticket
            const updates: any = {
                updated_at: now,
                assigned_to: assigned_to,
                status: assigned_to ? 'assigned' : 'waitlist',
                assigned_at: assigned_to ? now : null
            };

            if (skillGroupId) {
                updates.skill_group_id = skillGroupId;
                const { data: sg } = await supabase
                    .from('skill_groups')
                    .select('code')
                    .eq('id', skillGroupId)
                    .single();
                if (sg) updates.skill_group_code = sg.code;
            }

            const { data: ticket, error: updateError } = await supabase
                .from('tickets')
                .update(updates)
                .eq('id', ticket_id)
                .select('id, ticket_number, title')
                .single();

            if (updateError) {
                console.error(`[Batch Assign] Failed to update ticket ${ticket_id}:`, updateError);
                continue;
            }

            results.push(ticket);

            // 2. Prepare Audit Log
            auditLogs.push({
                ticket_id: ticket_id,
                user_id: user.id,
                action: assigned_to ? 'assigned' : 'unassigned',
                new_value: assigned_to || 'waitlist'
            });

            // 3. Trigger Notification if assigned
            if (assigned_to) {
                // Use the centralized NotificationService which handles DB insert + Push Notification
                // This replaces the previous incorrect manual insert
                await NotificationService.afterTicketAssigned(ticket_id);
            }
        }

        // Batch insert audit logs
        if (auditLogs.length > 0) {
            await supabase.from('ticket_activity_log').insert(auditLogs);
        }

        // Audit Event (PRD 8)
        console.log('[Audit] ticket.assignment_saved', {
            tickets: results.map(t => t.id),
            actor: user.id,
            timestamp: now
        });

        return NextResponse.json({
            success: true,
            updated_count: results.length
        });

    } catch (error) {
        console.error('[Batch Assign API] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
