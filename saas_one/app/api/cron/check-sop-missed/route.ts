/**
 * SOP missed deadline cron job.
 * Detects and alerts on SOP tasks past their due date.
 * POST /api/cron/check-sop-missed
 * Auth: Cron secret.
 */

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
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
            .select('template_id, completed_at, completion_date, slot_time')
            .in('template_id', templates.map(t => t.id))
            .eq('status', 'completed')
            .order('completed_at', { ascending: false });

        if (cplError) throw cplError;

        const templateCompletionsMap: Record<string, any[]> = {};
        for (const c of completions || []) {
            if (!templateCompletionsMap[c.template_id]) templateCompletionsMap[c.template_id] = [];
            templateCompletionsMap[c.template_id].push(c);
        }

        let alertsSent = 0;

        for (const template of templates) {
            // Check for missed slots in the last 24 hours (today and yesterday)
            const missedSlots = getMissedSlots(template, templateCompletionsMap[template.id] || [], now, windowStart);
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

                // ── Send to all recipients — isolate each so one failure doesn't block the rest ──
                for (const userId of recipientIds) {
                    try {
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
                    } catch (notifErr: any) {
                        console.error(`[SOP Missed] Failed to notify user ${userId} for template ${template.id}:`, notifErr.message);
                    }
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
    templateCompletions: any[],
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
        
        // Build slots for BOTH today and yesterday to cover cross-day edge cases and missed cron runs
        const days = [
            new Date(now.getFullYear(), now.getMonth(), now.getDate()), // Today
            new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1), // Yesterday
        ];

        for (const day of days) {
            const slots = buildDaySlots(template.start_time, template.end_time, intervalHours, day, template.started_at);
            
            for (const slot of slots) {
                // A slot is "missed" if we are past the slot start time + interval (i.e. slot window closed)
                const slotEnd = new Date(slot.getTime() + intervalHours * 3_600_000);
                if (slotEnd > now) continue; // window still open

                // Check if this specific slot was completed
                const h = slot.getHours();
                const m = slot.getMinutes();
                const slotTimeStrShort = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                const completionDateStr = slot.toISOString().slice(0, 10);
                
                const done = templateCompletions.some(c => 
                    c.slot_time && 
                    c.slot_time.startsWith(slotTimeStrShort) && 
                    c.completion_date === completionDateStr
                );

                if (!done) {
                    missed.push(slot);
                }
            }
        }
        return missed;
    }

    // ── Hourly without time window ───────────────────────────────────────────
    if (hourlyMatch) {
        const intervalMs = parseInt(hourlyMatch[1], 10) * 3_600_000;
        // Without a fixed window, we rely on the gap since the last completion
        const lastCompleted = templateCompletions[0] ? new Date(templateCompletions[0].completed_at) : null;
        if (!lastCompleted) return []; // Never completed — skip first-ever miss

        const overdueSince = new Date(lastCompleted.getTime() + intervalMs);
        if (overdueSince <= now) {
            // Only alert if it just happened in the current window to avoid notification flood
            if (overdueSince >= windowStart) missed.push(overdueSince);
        }
        return missed;
    }

    // ── Daily ─────────────────────────────────────────────────────────────────
    // Missed = end_time passed without completion
    if (template.frequency === 'daily') {
        const [eH, eM] = template.end_time ? template.end_time.slice(0, 5).split(':').map(Number) : [23, 59];
        const [sH, sM] = template.start_time ? template.start_time.slice(0, 5).split(':').map(Number) : [0, 0];
        // Overnight = end_time is on the next calendar day (e.g., 22:00 → 07:00)
        const isOvernight = template.start_time && template.end_time && (sH * 60 + sM) > (eH * 60 + eM);

        // For overnight: missed check is done at end_time on the NEXT day (start_time's day + 1)
        // For normal: missed check is done at end_time on the same day
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const missedTodayDate = isOvernight
            ? new Date(todayMidnight.getTime() + 86400_000) // tomorrow
            : todayMidnight;
        const missedAtToday = new Date(missedTodayDate.getFullYear(), missedTodayDate.getMonth(), missedTodayDate.getDate(), eH, eM, 0, 0);

        // Yesterday always checked: missed_at for yesterday's window
        const missedAtYesterday = new Date(todayMidnight.getTime() - 86400_000 + (eH * 60 + eM) * 60_000);

        const days = [{ date: missedAtYesterday, completionDate: new Date(todayMidnight.getTime() - 86400_000) }];
        if (missedAtToday <= now) {
            days.push({ date: missedAtToday, completionDate: missedTodayDate });
        }

        for (const { date: missedAt, completionDate: dayDate } of days) {
            // Don't fire if template was started after the missed deadline
            const tmplStartedAt = template.started_at ? new Date(template.started_at) : null;
            if (tmplStartedAt) {
                if (tmplStartedAt > missedAt) continue; // template didn't exist yet
                // If started today after end_time, skip (template wasn't active for this window)
                const startedMins = tmplStartedAt.getHours() * 60 + tmplStartedAt.getMinutes();
                const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate()).getTime();
                if (tmplStartedAt.getTime() >= dayStart && startedMins >= eH * 60 + eM) continue;
            }

            const dayStr = dayDate.toISOString().slice(0, 10);
            const doneToday = templateCompletions.some(c => c.completion_date === dayStr);
            if (!doneToday) missed.push(missedAt);
        }
        return missed;
    }

    return missed;
}

/** Build scheduled slot array for hourly+window templates on a specific day */
function buildDaySlots(startTime: string, endTime: string, intervalHours: number, day: Date, startedAtStr?: string | null): Date[] {
    const [sH, sM] = startTime.slice(0, 5).split(':').map(Number);
    const [eH, eM] = endTime.slice(0, 5).split(':').map(Number);
    const startMins = sH * 60 + sM;
    const endMins = eH * 60 + eM;
    const slots: Date[] = [];

    const startedAt = startedAtStr ? new Date(startedAtStr) : null;

    // Each slot starts at 't' and lasts 'intervalHours'.
    // The last slot MUST start such that it ends at or before 'endMins'.
    // Overnight ranges (endMins <= startMins) are not supported for hourly templates;
    // guard against misconfigured data by returning empty.
    if (endMins <= startMins) return [];
    for (let t = startMins; t + intervalHours * 60 <= endMins; t += intervalHours * 60) {
        const slotDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(t / 60), t % 60, 0, 0);

        // Only include slots that start AFTER the template was started
        if (startedAt && slotDate < startedAt) continue;

        slots.push(slotDate);
    }
    return slots;
}
