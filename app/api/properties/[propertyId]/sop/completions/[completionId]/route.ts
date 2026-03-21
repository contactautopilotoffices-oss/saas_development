import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ propertyId: string; completionId: string }> }
) {
    const { completionId } = await params;

    try {
        // Use admin client to bypass RLS — runner must always be able to read its own session
        const { data: completion, error } = await supabaseAdmin
            .from('sop_completions')
            .select(`
                *,
                template:sop_templates(*, items:sop_checklist_items(*)),
                user:users(full_name),
                items:sop_completion_items(
                    *,
                    checklist_item:sop_checklist_items(*),
                    checked_by_user:users!checked_by(full_name)
                )
            `)
            .eq('id', completionId)
            .single();

        if (error) {
            return NextResponse.json({ error: 'Completion not found' }, { status: 404 });
        }

        // ── Self-heal: insert any missing sop_completion_items rows ──────────
        // This handles completions created before the template had checklist items.
        const templateItems: any[] = completion.template?.items || [];
        const existingIds = new Set((completion.items || []).map((i: any) => i.checklist_item_id));
        const missing = templateItems.filter((ti: any) => !existingIds.has(ti.id));

        if (missing.length > 0) {
            await supabaseAdmin
                .from('sop_completion_items')
                .insert(missing.map((ti: any) => ({
                    completion_id: completionId,
                    checklist_item_id: ti.id,
                    is_checked: false,
                })));

            // Re-fetch with healed items
            const { data: healed } = await supabaseAdmin
                .from('sop_completions')
                .select(`
                    *,
                    template:sop_templates(*, items:sop_checklist_items(*)),
                    user:users(full_name),
                    items:sop_completion_items(
                        *,
                        checklist_item:sop_checklist_items(*),
                        checked_by_user:users!checked_by(full_name)
                    )
                `)
                .eq('id', completionId)
                .single();

            return NextResponse.json({ success: true, completion: healed });
        }

        return NextResponse.json({ success: true, completion });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string; completionId: string }> }
) {
    const { propertyId, completionId } = await params;
    const supabase = await createClient();

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { status, notes, item } = body;

        // Update completion status/notes
        if (status || notes !== undefined) {
            const updates: any = {};
            if (status) updates.status = status;
            if (notes !== undefined) updates.notes = notes;
            if (status === 'completed') updates.completed_at = new Date().toISOString();

            const { error: updateError } = await supabase
                .from('sop_completions')
                .update(updates)
                .eq('id', completionId)
                .eq('property_id', propertyId);

            if (updateError) {
                return NextResponse.json({ error: updateError.message }, { status: 500 });
            }
        }

        // Update individual item if provided (use admin to bypass RLS)
        if (item) {
            const { completionItemId, is_checked, comment, photo_url, value } = item;

            const itemUpdates: any = {};
            if (is_checked !== undefined) itemUpdates.is_checked = is_checked;
            if (comment !== undefined) itemUpdates.comment = comment;
            if (photo_url !== undefined) itemUpdates.photo_url = photo_url;
            if (value !== undefined) itemUpdates.value = value;
            if (is_checked) {
                itemUpdates.checked_at = new Date().toISOString();
                itemUpdates.checked_by = user.id;
            }

            const { error: itemError } = await supabaseAdmin
                .from('sop_completion_items')
                .update(itemUpdates)
                .eq('id', completionItemId);

            if (itemError) {
                return NextResponse.json({ error: itemError.message }, { status: 500 });
            }
        }

        // Fetch updated completion (admin bypasses RLS)
        const { data: completion } = await supabaseAdmin
            .from('sop_completions')
            .select(`
                *,
                template:sop_templates(title, frequency),
                items:sop_completion_items(*)
            `)
            .eq('id', completionId)
            .single();

        return NextResponse.json({ success: true, completion });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
