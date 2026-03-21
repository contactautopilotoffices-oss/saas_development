import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';
import { NotificationService } from '@/backend/services/NotificationService';

/**
 * GET /api/cron/check-escalation
 * Escalation Engine — runs every minute via external cron (Vercel Cron / pg_cron).
 *
 * For each open ticket with an active hierarchy, checks if the current level's
 * timeout has expired. If so, moves the ticket to the next level, notifies the
 * next assignee, and writes an audit log.
 *
 * Uses admin client throughout — this is a system-level operation and must
 * bypass RLS.
 */
export async function GET(request: NextRequest) {
    const admin = createAdminClient();
    const results: { ticketId: string; from: number; to: number | 'final' }[] = [];
    const errors: { ticketId: string; error: string }[] = [];

    try {
        // ── 1. Fetch all tickets eligible for escalation check ──────────────────
        const { data: tickets, error: ticketsErr } = await admin
            .from('tickets')
            .select(`
                id,
                ticket_number,
                title,
                status,
                property_id,
                organization_id,
                assigned_to,
                hierarchy_id,
                current_escalation_level,
                escalation_last_action_at
            `)
            .not('hierarchy_id', 'is', null)
            .eq('escalation_paused', false)
            .not('status', 'in', '(resolved,closed)');

        if (ticketsErr) throw new Error(`Tickets fetch failed: ${ticketsErr.message}`);
        if (!tickets || tickets.length === 0) {
            return NextResponse.json({ success: true, checked: 0, escalated: 0 });
        }

        console.log(`[Escalation Engine] Checking ${tickets.length} ticket(s)`);

        const now = new Date();

        for (const ticket of tickets) {
            try {
                const currentLevel: number = ticket.current_escalation_level ?? 0;
                const lastAction = new Date(ticket.escalation_last_action_at ?? now);
                const elapsedMinutes = (now.getTime() - lastAction.getTime()) / 60000;

                // ── 2. Determine the timeout for the current level ───────────────
                let timeoutMinutes: number;

                if (currentLevel === 0) {
                    // Level 0: escalate if ticket is idle (open / waitlist / assigned but not yet worked on)
                    if (!['open', 'waitlist', 'assigned'].includes(ticket.status ?? '')) {
                        continue; // MST already working (in_progress / paused / pending_validation) — don't escalate
                    }
                    // Timeout comes from the hierarchy's trigger_after_minutes
                    const { data: hier, error: hierErr } = await admin
                        .from('escalation_hierarchies')
                        .select('trigger_after_minutes')
                        .eq('id', ticket.hierarchy_id)
                        .single();
                    if (hierErr || !hier) {
                        console.warn(`[Escalation Engine] Hierarchy not found for ticket ${ticket.ticket_number}`);
                        continue;
                    }
                    timeoutMinutes = hier.trigger_after_minutes;
                } else {
                    // Level 1+ — timeout comes from the current level's config
                    const { data: currentLevelRow, error: clErr } = await admin
                        .from('escalation_levels')
                        .select('escalation_time_minutes')
                        .eq('hierarchy_id', ticket.hierarchy_id)
                        .eq('level_number', currentLevel)
                        .maybeSingle();

                    if (clErr || !currentLevelRow) {
                        console.warn(`[Escalation Engine] No level ${currentLevel} config for ticket ${ticket.ticket_number}`);
                        continue;
                    }
                    timeoutMinutes = currentLevelRow.escalation_time_minutes;
                }

                // ── 3. Check if timeout has expired ──────────────────────────────
                if (elapsedMinutes < timeoutMinutes) {
                    continue; // Not yet due
                }

                console.log(`[Escalation Engine] Ticket ${ticket.ticket_number} timed out at level ${currentLevel} (${Math.floor(elapsedMinutes)}/${timeoutMinutes} min)`);

                // ── 4. Fetch the next escalation level ───────────────────────────
                // Level 0 → Level 1 is the first entry into the hierarchy
                const nextLevel = currentLevel === 0 ? 1 : currentLevel + 1;
                const { data: nextLevelRow, error: nlErr } = await admin
                    .from('escalation_levels')
                    .select('employee_id, notification_channels')
                    .eq('hierarchy_id', ticket.hierarchy_id)
                    .eq('level_number', nextLevel)
                    .maybeSingle();

                if (nlErr) {
                    errors.push({ ticketId: ticket.id, error: `Next level fetch error: ${nlErr.message}` });
                    continue;
                }

                if (!nextLevelRow) {
                    // Already at final level — nothing to escalate to
                    console.log(`[Escalation Engine] Ticket ${ticket.ticket_number} is at final escalation level. No further escalation.`);
                    results.push({ ticketId: ticket.id, from: currentLevel, to: 'final' });
                    continue;
                }

                const fromEmployeeId: string | null = ticket.assigned_to ?? null;
                const toEmployeeId: string | null = nextLevelRow.employee_id ?? null;
                const channels: string[] = nextLevelRow.notification_channels ?? ['push', 'email'];

                // ── 5. Write audit log ───────────────────────────────────────────
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
                    errors.push({ ticketId: ticket.id, error: `Audit log insert failed: ${logErr.message}` });
                    continue;
                }

                // ── 6. Advance the escalation level (do NOT change assignee or status) ──
                const { error: updateErr } = await admin
                    .from('tickets')
                    .update({
                        current_escalation_level: nextLevel,
                        escalation_last_action_at: now.toISOString(),
                    })
                    .eq('id', ticket.id);

                if (updateErr) {
                    errors.push({ ticketId: ticket.id, error: `Ticket update failed: ${updateErr.message}` });
                    continue;
                }

                // ── 7. Send web push notifications ──────────────────────────────
                if (ticket.property_id) {
                    try {
                        // Notify the hierarchy person being escalated to
                        if (toEmployeeId) {
                            await NotificationService.send({
                                userId: toEmployeeId,
                                ticketId: ticket.id,
                                propertyId: ticket.property_id,
                                organizationId: ticket.organization_id ?? undefined,
                                type: 'TICKET_ESCALATED',
                                title: 'Ticket Escalated — Attention Required',
                                message: `${ticket.ticket_number || 'A ticket'} has been escalated to your attention after ${timeoutMinutes} min. Please review it.`,
                                deepLink: `/tickets/${ticket.id}?via=escalation`,
                            });
                            console.log(`[Escalation Engine] Notified hierarchy member ${toEmployeeId} for ticket ${ticket.ticket_number}`);
                        }

                        // Also notify the current assignee (MST) that their ticket has been escalated
                        if (fromEmployeeId && fromEmployeeId !== toEmployeeId) {
                            await NotificationService.send({
                                userId: fromEmployeeId,
                                ticketId: ticket.id,
                                propertyId: ticket.property_id,
                                organizationId: ticket.organization_id ?? undefined,
                                type: 'TICKET_ESCALATED',
                                title: 'Your Ticket Has Been Escalated',
                                message: `${ticket.ticket_number || 'A ticket'} has been escalated to the next level after ${timeoutMinutes} min with no resolution.`,
                                deepLink: `/tickets/${ticket.id}?via=escalation`,
                            });
                            console.log(`[Escalation Engine] Notified current assignee ${fromEmployeeId} about escalation`);
                        }
                    } catch (notifErr: any) {
                        // Notification failure should not block the escalation itself
                        console.error(`[Escalation Engine] Notification failed for ticket ${ticket.ticket_number}:`, notifErr.message);
                    }
                }

                results.push({ ticketId: ticket.id, from: currentLevel, to: nextLevel });
                console.log(`[Escalation Engine] ✓ Ticket ${ticket.ticket_number} escalated L${currentLevel} → L${nextLevel}`);

            } catch (ticketErr: any) {
                errors.push({ ticketId: ticket.id, error: ticketErr.message });
                console.error(`[Escalation Engine] Error processing ticket ${ticket.id}:`, ticketErr.message);
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
