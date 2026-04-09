/**
 * SOP completions API.
 * GET: List completions | POST: Create completion record.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * SOP Checklist Completion API — records of staff completing SOP checklists.
 *
 * GET  — List completion records for the property with optional filters:
 *         templateId, completionDate (YYYY-MM-DD), userId, and limit (1–200, default 50).
 *         Returns each completion with its template, completing user, and completion items.
 * POST — Start a new SOP completion session for a given template. Handles:
 *         - Time-window enforcement for hourly/daily/weekly frequencies (admin bypass),
 *         - Slot-time computation for hourly templates,
 *         - Deduplication (one record per slot for hourly; resume in_progress for daily/weekly),
 *         - Auto-creation of completion items from the template's checklist.
 *
 * Auth: Supabase session (user must be authenticated for all methods).
 */

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const templateId = searchParams.get('templateId');
    const completionDate = searchParams.get('completionDate');
    const userId = searchParams.get('userId');
    const rawLimit = parseInt(searchParams.get('limit') || '50');
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

    // Validate completionDate format to prevent injection / unexpected query results
    if (completionDate && !/^\d{4}-\d{2}-\d{2}$/.test(completionDate)) {
        return NextResponse.json({ error: 'completionDate must be YYYY-MM-DD' }, { status: 400 });
    }

    try {
        let query = supabase
            .from('sop_completions')
            .select(`
                *,
                template:sop_templates(title, frequency),
                user:users(id, full_name),
                items:sop_completion_items(*)
            `)
            .eq('property_id', propertyId)
            .order('completion_date', { ascending: false })
            .limit(limit);

        if (templateId) {
            query = query.eq('template_id', templateId);
        }

        if (completionDate) {
            query = query.eq('completion_date', completionDate);
        }

        if (userId) {
            query = query.eq('completed_by', userId);
        }

        const { data: completions, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            completions,
            total: completions?.length || 0,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { templateId, completionDate, notes } = body;

        // Fetch user role for this property to allow admin bypass
        const { data: membership } = await supabaseAdmin
            .from('memberships')
            .select('role')
            .eq('property_id', propertyId)
            .eq('user_id', user.id)
            .maybeSingle();
        
        const userRole = (membership?.role || '').toLowerCase();
        const isAdmin = ['property_admin', 'org_admin', 'org_super_admin', 'master_admin'].includes(userRole);

        if (!templateId) {
            return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
        }

        // Use admin client to bypass RLS for all data operations
        const { data: property, error: propError } = await supabaseAdmin
            .from('properties')
            .select('organization_id')
            .eq('id', propertyId)
            .single();

        if (propError || !property) {
            return NextResponse.json({ error: 'Property not found' }, { status: 404 });
        }

        // Verify template exists and get its items (admin bypasses RLS)
        const { data: template, error: templateError } = await supabaseAdmin
            .from('sop_templates')
            .select('id, frequency, start_time, end_time, items:sop_checklist_items(*)')
            .eq('id', templateId)
            .eq('property_id', propertyId)
            .single();

        if (templateError || !template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        const finalCompletionDate = completionDate || new Date().toISOString().split('T')[0];
        const isHistorical = finalCompletionDate !== new Date().toISOString().split('T')[0];

        // ── Time Window Enforcement (Global) ──────────────────────────────────
        // If start_time/end_time are set, strictly enforce the window for ALL frequencies.
        // BYPASS window enforcement if it's a historical completion (Resume Late)
        const startTime = (template as any).start_time;
        const endTime = (template as any).end_time;
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();

        if ((startTime || endTime) && !isAdmin && !isHistorical) {
            const [sH, sM] = (startTime ?? '00:00').slice(0, 5).split(':').map(Number);
            const [eH, eM] = (endTime ?? '23:59').slice(0, 5).split(':').map(Number);
            const startMins = sH * 60 + sM;
            const endMins = eH * 60 + eM;
            
            const isOvernight = endMins <= startMins;
            const withinWindow = isOvernight
                ? (nowMins >= startMins || nowMins < endMins)
                : (nowMins >= startMins && nowMins <= endMins);
            
            if (!withinWindow) {
                // If it's before the start of a non-overnight window
                if (!isOvernight && nowMins < startMins) {
                    return NextResponse.json({ error: 'Checklist window has not started yet' }, { status: 400 });
                }
                return NextResponse.json({ error: 'Checklist window is currently closed' }, { status: 400 });
            }
        }

        // ── Compute slot_time for hourly templates ────────────────────────────
        // Slot = start of the current interval window (e.g. "13:00" for the 1 PM slot).
        // Daily/weekly templates use slot_time = null (one per day).
        let slotTime: string | null = null;
        const hourlyMatch = (template as any).frequency?.match(/^every_(\d+)_hours?$/);
        if (hourlyMatch && startTime) {
            const intervalH = parseInt(hourlyMatch[1]);
            const [sH, sM] = startTime.slice(0, 5).split(':').map(Number);
            const startMins = sH * 60 + sM;
            const elapsed = nowMins - startMins;

            const slotIndex = Math.floor(elapsed / (intervalH * 60));
            const slotStartMins = startMins + slotIndex * intervalH * 60;

            // Strict hourly-end check: the slot must fully FIT within the window
            if (endTime) {
                const [eH, eM] = endTime.slice(0, 5).split(':').map(Number);
                const endMins = eH * 60 + eM;
                const lastValidSlotStart = startMins + Math.floor((endMins - startMins - intervalH * 60) / (intervalH * 60)) * intervalH * 60;

                if (slotStartMins > lastValidSlotStart && !isAdmin) {
                    return NextResponse.json({ error: 'Checklist window has closed for today' }, { status: 400 });
                }
            }

            const h = Math.floor(slotStartMins / 60) % 24;
            const mn = slotStartMins % 60;
            slotTime = `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
        }

        // ── Deduplicate: one record per slot ─────────────────────────────────
        // Three cases:
        //   1. Hourly WITH start_time  → match exact slot_time column (any status)
        //   2. Hourly WITHOUT start_time → any record created within the last intervalH hours
        //   3. Daily/weekly/monthly → resume in_progress from today only
        let existingCompletion: any = null;

        if (slotTime) {
            // Case 1: slot_time-based dedup — one record per labelled slot window
            const { data } = await supabaseAdmin
                .from('sop_completions')
                .select('*, items:sop_completion_items(*)')
                .eq('template_id', templateId)
                .eq('property_id', propertyId)
                .eq('completion_date', finalCompletionDate)
                .eq('slot_time', slotTime)
                .order('created_at', { ascending: false })
                .limit(1);
            existingCompletion = data?.[0] ?? null;
        } else if (hourlyMatch) {
            // Case 2: floating hourly — block if any record (any status) was created
            // within the last intervalH hours (i.e. within the same effective window)
            const intervalH = parseInt(hourlyMatch[1]);
            const cutoff = new Date(Date.now() - intervalH * 3_600_000).toISOString();
            const { data } = await supabaseAdmin
                .from('sop_completions')
                .select('*, items:sop_completion_items(*)')
                .eq('template_id', templateId)
                .eq('property_id', propertyId)
                .gte('created_at', cutoff)
                .order('created_at', { ascending: false })
                .limit(1);
            existingCompletion = data?.[0] ?? null;
        } else {
            // Case 3: daily/weekly/monthly — resume in_progress only
            const { data } = await supabaseAdmin
                .from('sop_completions')
                .select('*, items:sop_completion_items(*)')
                .eq('template_id', templateId)
                .eq('property_id', propertyId)
                .eq('completion_date', finalCompletionDate)
                .eq('status', 'in_progress')
                .order('created_at', { ascending: false })
                .limit(1);
            existingCompletion = data?.[0] ?? null;
        }

        if (existingCompletion) {
            return NextResponse.json({ success: true, completion: existingCompletion });
        }

        // Create completion (use admin so open-template staff can always insert)
        const { data: completion, error: completionError } = await supabaseAdmin
            .from('sop_completions')
            .insert({
                template_id: templateId,
                property_id: propertyId,
                organization_id: property.organization_id,
                completed_by: user.id,
                completion_date: finalCompletionDate,
                status: 'in_progress',
                notes,
                ...(slotTime ? { slot_time: slotTime } : {}),
            })
            .select()
            .single();

        if (completionError) {
            return NextResponse.json({ error: completionError.message }, { status: 500 });
        }

        // Create completion items from template items (admin bypasses RLS)
        const items: any[] = (template as any).items || [];
        if (items.length > 0) {
            const completionItemsToInsert = items.map((item: any) => ({
                completion_id: completion.id,
                checklist_item_id: item.id,
                is_checked: false,
            }));

            const { error: insertError } = await supabaseAdmin
                .from('sop_completion_items')
                .insert(completionItemsToInsert);

            if (insertError) {
                return NextResponse.json({ error: insertError.message }, { status: 500 });
            }
        }

        // Fetch full completion with items (admin bypasses RLS)
        const { data: completeCompletion } = await supabaseAdmin
            .from('sop_completions')
            .select('*, items:sop_completion_items(*)')
            .eq('id', completion.id)
            .single();

        return NextResponse.json(
            { success: true, completion: completeCompletion },
            { status: 201 }
        );
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
