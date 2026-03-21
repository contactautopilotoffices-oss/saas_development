import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { NotificationService } from '@/backend/services/NotificationService';

/**
 * GET /api/cron/check-sop-missed
 * Runs every minute (Vercel Cron). Detects checklist slots that were missed
 * (not completed in time) and fires a WhatsApp + in-app alert to:
 *   – Staff assigned to the checklist (if assigned_to is set)
 *   – All property_admin / manager members of the property
 *   – All org_admin / org_super_admin / owner members of the organisation
 *
 * Deduplication: a row is inserted into `sop_missed_alerts(template_id, slot_time)`.
 * The unique constraint ensures each missed slot triggers at most one alert batch.
 */
export async function GET(_request: NextRequest) {
    try {
        const now = new Date();
        const windowStart = new Date(now.getTime() - 60_000); // 1-minute cron window

        // ── 1. Fetch all active, non-on-demand templates ──────────────────────
        const { data: templates, error: tplError } = await supabaseAdmin
            .from('sop_templates')
            .select('id, title, frequency, assigned_to, property_id, organization_id, start_time, end_time, started_at')
            .eq('is_active', true)
            .eq('is_running', true)
            .neq('frequency', 'on_demand');

        if (tplError) throw tplError;
        if (!templates || templates.length === 0) {
            return NextResponse.json({ success: true, checked: 0, alerts_sent: 0 });
        }

        // ── 2. Latest completed completion per template ────────────────────────
        const { data: completions, error: cplError } = await supabaseAdmin
            .from('sop_completions')
            .select('template_id, completed_at, completion_date')
            .in('template_id', templates.map(t => t.id))
            .eq('status', 'completed')
            .order('completed_at', { ascending: false });

        if (cplError) throw cplError;

        const lastCompletedMap: Record<string, Date> = {};
        const lastDateMap: Record<string, string> = {};
        for (const c of completions || []) {
            if (!lastCompletedMap[c.template_id]) {
                if (c.completed_at) lastCompletedMap[c.template_id] = new Date(c.completed_at);
                if (c.completion_date) lastDateMap[c.template_id] = c.completion_date;
            }
        }

        let alertsSent = 0;

        for (const template of templates) {
            const missedSlots = getMissedSlots(template, lastCompletedMap[template.id] ?? null, now, windowStart);
            if (missedSlots.length === 0) continue;

            for (const slotTime of missedSlots) {
                // Try to claim this slot atomically — unique constraint rejects duplicates
                const { error: insertError } = await supabaseAdmin
                    .from('sop_missed_alerts')
                    .insert({ template_id: template.id, slot_time: slotTime.toISOString() });

                if (insertError) continue; // already alerted for this slot

                // ── Build recipient list ──────────────────────────────────────
                const recipientIds = new Set<string>();

                // Assigned staff (if any)
                if (Array.isArray(template.assigned_to) && template.assigned_to.length > 0) {
                    for (const uid of template.assigned_to) recipientIds.add(uid);
                }

                // Property admins
                const { data: propMembers } = await supabaseAdmin
                    .from('property_memberships')
                    .select('user_id')
                    .eq('property_id', template.property_id)
                    .in('role', ['property_admin', 'manager'])
                    .eq('is_active', true);

                for (const m of propMembers || []) recipientIds.add(m.user_id);

                // Org admins / super admins / owner
                if (template.organization_id) {
                    const { data: orgMembers } = await supabaseAdmin
                        .from('organization_memberships')
                        .select('user_id')
                        .eq('organization_id', template.organization_id)
                        .in('role', ['org_admin', 'org_super_admin', 'owner'])
                        .eq('is_active', true);

                    for (const m of orgMembers || []) recipientIds.add(m.user_id);
                }

                // Master admins (system-wide super admins)
                const { data: masterAdmins } = await supabaseAdmin
                    .from('users')
                    .select('id')
                    .eq('is_master_admin', true);

                for (const u of masterAdmins || []) recipientIds.add(u.id);

                // ── Format slot time for display ─────────────────────────────
                const slotLabel = slotTime.toLocaleString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                });

                const title = '⚠️ Missed Checklist';
                const message =
                    `"${template.title}" scheduled for ${slotLabel} was NOT completed on time. ` +
                    `Please complete it immediately or take corrective action.`;

                // ── Send to all recipients ────────────────────────────────────
                for (const userId of recipientIds) {
                    await NotificationService.send({
                        userId,
                        propertyId: template.property_id,
                        organizationId: template.organization_id ?? undefined,
                        type: 'SOP_MISSED',
                        title,
                        message,
                        deepLink: `/properties/${template.property_id}/sop?via=missed-alert`,
                    });
                    alertsSent++;
                }
            }
        }

        return NextResponse.json({ success: true, checked: templates.length, alerts_sent: alertsSent });
    } catch (error) {
        console.error('[SOP Missed Cron] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * Returns the list of scheduled slot times that:
 *  1. Fell within the 1-minute cron window (windowStart → now)
 *  2. Have no completion covering them
 */
function getMissedSlots(
    template: { frequency: string; start_time?: string | null; end_time?: string | null; started_at?: string | null },
    lastCompleted: Date | null,
    now: Date,
    windowStart: Date,
): Date[] {
    const missed: Date[] = [];

    const hourlyMatch = template.frequency.match(/^every_(\d+)_hours?$/);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Helper: was template started today? If so, first slot starts at started_at time, not start_time
    const startedAt = template.started_at ? new Date(template.started_at) : null;
    const startedToday = startedAt
        ? new Date(startedAt.getFullYear(), startedAt.getMonth(), startedAt.getDate()).getTime() === today.getTime()
        : false;

    // ── Hourly + time window → slot-based schedule ───────────────────────────
    if (hourlyMatch && template.start_time && template.end_time) {
        const intervalHours = parseInt(hourlyMatch[1], 10);
        const [sH, sM] = template.start_time.slice(0, 5).split(':').map(Number);
        const startMins = sH * 60 + sM;

        // On the first day, first slot = max(start_time, started_at_time)
        let effectiveStartMins = startMins;
        if (startedToday && startedAt) {
            const startedMins = startedAt.getHours() * 60 + startedAt.getMinutes();
            if (startedMins > startMins) effectiveStartMins = startedMins;
        }

        const slots = buildTodaySlots(template.start_time, template.end_time, intervalHours, now, effectiveStartMins);

        for (const slot of slots) {
            if (slot < windowStart || slot > now) continue;
            if (!lastCompleted || lastCompleted < slot) {
                missed.push(slot);
            }
        }
        return missed;
    }

    // ── Hourly without time window ───────────────────────────────────────────
    if (hourlyMatch) {
        const intervalMs = parseInt(hourlyMatch[1], 10) * 3_600_000;
        if (!lastCompleted) return []; // Never completed — skip first-ever miss
        const overdueSince = new Date(lastCompleted.getTime() + intervalMs);
        if (overdueSince >= windowStart && overdueSince <= now) missed.push(overdueSince);
        return missed;
    }

    // ── Daily ─────────────────────────────────────────────────────────────────
    // Missed = end_time passed without completion (user has whole window to complete)
    if (template.frequency === 'daily') {
        const [eH, eM] = template.end_time
            ? template.end_time.slice(0, 5).split(':').map(Number)
            : [23, 59];
        const missedAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), eH, eM, 0, 0);

        if (missedAt < windowStart || missedAt > now) return [];

        // Don't fire if template was started today after end_time (no chance to complete)
        if (startedToday && startedAt) {
            const startedMins = startedAt.getHours() * 60 + startedAt.getMinutes();
            const endMins = eH * 60 + eM;
            if (startedMins >= endMins) return []; // started after window closed today
        }

        const todayStr = now.toISOString().slice(0, 10);
        const lastDate = lastCompleted ? lastCompleted.toISOString().slice(0, 10) : null;
        if (lastDate !== todayStr) missed.push(missedAt);
        return missed;
    }

    return missed;
}

/** Build today's scheduled slot array for hourly+window templates */
function buildTodaySlots(startTime: string, endTime: string, intervalHours: number, now: Date, effectiveStartMins?: number): Date[] {
    const [sH, sM] = startTime.slice(0, 5).split(':').map(Number);
    const [eH, eM] = endTime.slice(0, 5).split(':').map(Number);
    const startMins = effectiveStartMins ?? (sH * 60 + sM);
    const endMins = eH * 60 + eM;
    const slots: Date[] = [];
    for (let t = startMins; t <= endMins; t += intervalHours * 60) {
        slots.push(new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(t / 60), t % 60, 0, 0));
    }
    return slots;
}
