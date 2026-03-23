import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';
import { NotificationService } from '@/backend/services/NotificationService';

/**
 * GET /api/cron/check-escalation
 * Escalation Engine — runs every minute via Vercel Cron.
 *
 * Optimised: fetches all tickets, hierarchies, and levels in 3 flat queries
 * then joins in memory — O(1) DB calls regardless of ticket count.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();
    const results: { ticketId: string; from: number; to: number | 'final' }[] = [];
    const errors: { ticketId: string; error: string }[] = [];

    try {
        // ── 1. Fetch all tickets eligible for escalation ─────────────────────
        const { data: tickets, error: ticketsErr } = await admin
            .from('tickets')
            .select(`
                id, ticket_number, title, status,
                property_id, organization_id, assigned_to,
                hierarchy_id, current_escalation_level,
                escalation_last_action_at, created_at
            `)
            .not('hierarchy_id', 'is', null)
            .eq('escalation_paused', false)
            .not('status', 'in', '(resolved,closed)');

        if (ticketsErr) throw new Error(`Tickets fetch failed: ${ticketsErr.message}`);
        if (!tickets || tickets.length === 0) {
            return NextResponse.json({ success: true, checked: 0, escalated: 0 });
        }

        // ── 2. Batch-fetch all referenced hierarchies (1 query) ──────────────
        const hierarchyIds = [...new Set(tickets.map(t => t.hierarchy_id).filter(Boolean))];

        const { data: hierarchies, error: hierErr } = await admin
            .from('escalation_hierarchies')
            .select('id, trigger_after_minutes')
            .in('id', hierarchyIds);

        if (hierErr) throw new Error(`Hierarchies fetch failed: ${hierErr.message}`);

        const hierMap: Record<string, { trigger_after_minutes: number }> = {};
        for (const h of hierarchies || []) hierMap[h.id] = h;

        // ── 3. Batch-fetch all levels for those hierarchies (1 query) ────────
        const { data: allLevels, error: levelsErr } = await admin
            .from('escalation_levels')
            .select('hierarchy_id, level_number, employee_id, notification_channels, escalation_time_minutes')
            .in('hierarchy_id', hierarchyIds);

        if (levelsErr) throw new Error(`Levels fetch failed: ${levelsErr.message}`);

        // Build map: hierarchyId → { levelNumber → level }
        const levelMap: Record<string, Record<number, any>> = {};
        for (const lvl of allLevels || []) {
            if (!levelMap[lvl.hierarchy_id]) levelMap[lvl.hierarchy_id] = {};
            levelMap[lvl.hierarchy_id][lvl.level_number] = lvl;
        }

        const now = new Date();

        // ── 4. Process each ticket using in-memory lookups (no extra DB calls) ─
        for (const ticket of tickets) {
            try {
                const currentLevel: number = ticket.current_escalation_level ?? 0;
                // Fall back to created_at so brand-new tickets actually escalate
                const lastAction = new Date(ticket.escalation_last_action_at ?? ticket.created_at ?? now);
                const elapsedMinutes = (now.getTime() - lastAction.getTime()) / 60000;

                // Determine timeout for current level
                let timeoutMinutes: number;

                if (currentLevel === 0) {
                    if (!['open', 'waitlist', 'assigned'].includes(ticket.status ?? '')) continue;
                    const hier = hierMap[ticket.hierarchy_id];
                    if (!hier) {
                        console.warn(`[Escalation] Hierarchy not found for ticket ${ticket.ticket_number}`);
                        continue;
                    }
                    timeoutMinutes = hier.trigger_after_minutes;
                } else {
                    const currentLevelRow = levelMap[ticket.hierarchy_id]?.[currentLevel];
                    if (!currentLevelRow) {
                        console.warn(`[Escalation] No level ${currentLevel} for ticket ${ticket.ticket_number}`);
                        continue;
                    }
                    timeoutMinutes = currentLevelRow.escalation_time_minutes;
                }

                if (elapsedMinutes < timeoutMinutes) continue;

                const nextLevel = currentLevel === 0 ? 1 : currentLevel + 1;
                const nextLevelRow = levelMap[ticket.hierarchy_id]?.[nextLevel];

                if (!nextLevelRow) {
                    // Final level — pause so the cron never re-checks this ticket
                    await admin.from('tickets').update({ escalation_paused: true }).eq('id', ticket.id);
                    results.push({ ticketId: ticket.id, from: currentLevel, to: 'final' });
                    continue;
                }

                const fromEmployeeId: string | null = ticket.assigned_to ?? null;
                const toEmployeeId: string | null = nextLevelRow.employee_id ?? null;
                // notification_channels reserved for future multi-channel support

                // Write audit log
                const { error: logErr } = await admin
                    .from('ticket_escalation_logs')
                    .insert({
                        ticket_id: ticket.id,
                        hierarchy_id: ticket.hierarchy_id,
                        from_employee_id: fromEmployeeId,
                        to_employee_id: toEmployeeId,
                        from_level: currentLevel,
                        to_level: nextLevel,
                        reason: 'timeout',
                        escalated_at: now.toISOString(),
                    });

                if (logErr) {
                    errors.push({ ticketId: ticket.id, error: `Audit log failed: ${logErr.message}` });
                    continue;
                }

                // Advance escalation level
                const { error: updateErr } = await admin
                    .from('tickets')
                    .update({ current_escalation_level: nextLevel, escalation_last_action_at: now.toISOString() })
                    .eq('id', ticket.id);

                if (updateErr) {
                    errors.push({ ticketId: ticket.id, error: `Ticket update failed: ${updateErr.message}` });
                    continue;
                }

                // Notify — each send is isolated so one failure doesn't kill the rest
                if (ticket.property_id) {
                    if (toEmployeeId) {
                        try {
                            await NotificationService.send({
                                userId: toEmployeeId,
                                ticketId: ticket.id,
                                propertyId: ticket.property_id,
                                organizationId: ticket.organization_id ?? undefined,
                                type: 'TICKET_ESCALATED',
                                title: 'Ticket Escalated — Attention Required',
                                message: `${ticket.ticket_number || 'A ticket'} has been escalated to your attention after ${timeoutMinutes} min.`,
                                deepLink: `/tickets/${ticket.id}?via=escalation`,
                            });
                        } catch (notifErr: any) {
                            console.error(`[Escalation] Notify to-employee failed for ${ticket.ticket_number}:`, notifErr.message);
                        }
                    }

                    if (fromEmployeeId && fromEmployeeId !== toEmployeeId) {
                        try {
                            await NotificationService.send({
                                userId: fromEmployeeId,
                                ticketId: ticket.id,
                                propertyId: ticket.property_id,
                                organizationId: ticket.organization_id ?? undefined,
                                type: 'TICKET_ESCALATED',
                                title: 'Your Ticket Has Been Escalated',
                                message: `${ticket.ticket_number || 'A ticket'} escalated after ${timeoutMinutes} min with no resolution.`,
                                deepLink: `/tickets/${ticket.id}?via=escalation`,
                            });
                        } catch (notifErr: any) {
                            console.error(`[Escalation] Notify from-employee failed for ${ticket.ticket_number}:`, notifErr.message);
                        }
                    }
                }

                results.push({ ticketId: ticket.id, from: currentLevel, to: nextLevel });

            } catch (ticketErr: any) {
                errors.push({ ticketId: ticket.id, error: ticketErr.message });
            }
        }

        return NextResponse.json({
            success: true,
            checked: tickets.length,
            escalated: results.filter(r => r.to !== 'final').length,
            final_level_reached: results.filter(r => r.to === 'final').length,
            details: results,
            errors: errors.length > 0 ? errors : undefined,
        });

    } catch (err: any) {
        console.error('[Escalation Engine] Fatal error:', err);
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
