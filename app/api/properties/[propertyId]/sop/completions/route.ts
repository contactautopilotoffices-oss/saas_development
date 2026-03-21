import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

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
    const limit = parseInt(searchParams.get('limit') || '50');

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
            .select('id, frequency, start_time, items:sop_checklist_items(*)')
            .eq('id', templateId)
            .eq('property_id', propertyId)
            .single();

        if (templateError || !template) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        const finalCompletionDate = completionDate || new Date().toISOString().split('T')[0];

        // ── Compute slot_time for hourly templates ────────────────────────────
        // Slot = start of the current interval window (e.g. "13:00" for the 1 PM slot).
        // Daily/weekly templates use slot_time = null (one per day).
        let slotTime: string | null = null;
        const hourlyMatch = (template as any).frequency?.match(/^every_(\d+)_hours?$/);
        if (hourlyMatch && (template as any).start_time) {
            const intervalH = parseInt(hourlyMatch[1]);
            const [sH, sM] = (template as any).start_time.slice(0, 5).split(':').map(Number);
            const now = new Date();
            const startMins = sH * 60 + sM;
            const nowMins = now.getHours() * 60 + now.getMinutes();
            const elapsed = nowMins - startMins;
            if (elapsed >= 0) {
                const slotIndex = Math.floor(elapsed / (intervalH * 60));
                const slotStartMins = startMins + slotIndex * intervalH * 60;
                const h = Math.floor(slotStartMins / 60) % 24;
                const mn = slotStartMins % 60;
                slotTime = `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
            }
        }

        // ── Deduplicate: join any existing session for this slot ─────────────
        // Checks both in_progress AND completed so one slot = one shared completion.
        let dedupQuery = supabaseAdmin
            .from('sop_completions')
            .select('*, items:sop_completion_items(*)')
            .eq('template_id', templateId)
            .eq('property_id', propertyId)
            .eq('completion_date', finalCompletionDate)
            .in('status', ['in_progress', 'completed']);

        if (slotTime) {
            dedupQuery = (dedupQuery as any).eq('slot_time', slotTime);
        }

        const { data: existing } = await (dedupQuery as any).maybeSingle();

        if (existing) {
            return NextResponse.json({ success: true, completion: existing });
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
