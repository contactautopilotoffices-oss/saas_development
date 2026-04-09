/**
 * Single SOP template management.
 * GET: Get template | PATCH: Update | DELETE: Remove.
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string; templateId: string }> }
) {
    const { propertyId, templateId } = await params;
    const supabase = await createClient();

    try {
        const { data: template, error } = await supabase
            .from('sop_templates')
            .select(`
                *,
                items:sop_checklist_items(*)
            `)
            .eq('id', templateId)
            .eq('property_id', propertyId)
            .single();

        if (error) {
            return NextResponse.json({ error: 'Template not found' }, { status: 404 });
        }

        return NextResponse.json({ success: true, template });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string; templateId: string }> }
) {
    const { propertyId, templateId } = await params;
    const supabase = await createClient();

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { title, description, category, frequency, assigned_to, is_active, items, start_time, end_time } = body;



        const { data: template, error: updateError } = await supabase
            .from('sop_templates')
            .update({
                ...(title && { title }),
                ...(description !== undefined && { description }),
                ...(category && { category }),
                ...(frequency && { frequency }),
                ...(assigned_to !== undefined && { assigned_to }),
                ...(is_active !== undefined && { is_active }),
                start_time: start_time || '09:00',
                end_time: end_time || '17:00',
                updated_at: new Date().toISOString(),
            })
            .eq('id', templateId)
            .eq('property_id', propertyId)
            .select()
            .single();

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Update items if provided
        if (items && Array.isArray(items)) {
            // Delete existing items (use supabaseAdmin to bypass RLS)
            const { error: deleteItemsError } = await supabaseAdmin
                .from('sop_checklist_items')
                .delete()
                .eq('template_id', templateId);

            if (deleteItemsError) {
                return NextResponse.json({ error: 'Failed to update items: ' + deleteItemsError.message }, { status: 500 });
            }

            // Insert new items (use supabaseAdmin to bypass RLS)
            if (items.length > 0) {
                const itemsToInsert = items.map((item: any, index: number) => ({
                    template_id: templateId,
                    title: item.title,
                    description: item.description || '',
                    order_index: index,
                    type: item.type || 'checkbox',
                    is_optional: item.is_optional || false,
                    requires_photo: item.requires_photo || false,
                    requires_comment: item.requires_comment || false,
                    is_mandatory: item.is_mandatory !== false,
                    start_time: item.start_time || null,
                    end_time: item.end_time || null,
                }));

                const { error: itemsError } = await supabaseAdmin
                    .from('sop_checklist_items')
                    .insert(itemsToInsert);

                if (itemsError) {
                    return NextResponse.json({ error: 'Failed to insert items: ' + itemsError.message }, { status: 500 });
                }
            }
        }

        // Fetch final template with items
        const { data: finalTemplate } = await supabase
            .from('sop_templates')
            .select(`
                *,
                items:sop_checklist_items(*)
            `)
            .eq('id', templateId)
            .single();

        return NextResponse.json({ success: true, template: finalTemplate });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string; templateId: string }> }
) {
    const { propertyId, templateId } = await params;
    const supabase = await createClient();

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { is_running } = body;

        if (typeof is_running !== 'boolean') {
            return NextResponse.json({ error: 'is_running must be a boolean' }, { status: 400 });
        }

        const patchFields: any = { is_running, updated_at: new Date().toISOString() };
        if (is_running) patchFields.started_at = new Date().toISOString(); // track when schedule went live

        const { data: template, error: updateError } = await supabase
            .from('sop_templates')
            .update(patchFields)
            .eq('id', templateId)
            .eq('property_id', propertyId)
            .select()
            .single();

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, template });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string; templateId: string }> }
) {
    const { propertyId, templateId } = await params;
    const supabase = await createClient();

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Soft delete (set is_active = false)
        const { error: deleteError } = await supabase
            .from('sop_templates')
            .update({ is_active: false })
            .eq('id', templateId)
            .eq('property_id', propertyId);

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Template deactivated' });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
