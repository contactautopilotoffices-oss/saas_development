import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * GET /api/escalation/hierarchies/[id]
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log(`>>> [Escalation Hierarchy] GET ID: ${id}`);
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Use admin client so the nested employee join isn't blocked by users RLS
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from('escalation_hierarchies')
      .select(`
        *,
        levels:escalation_levels(
          id, level_number, employee_id, escalation_time_minutes, notification_channels,
          employee:users!escalation_levels_employee_id_fkey(id, full_name, email, phone, metadata)
        )
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('[Escalation Hierarchy] GET Error:', error);
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    const sortedLevels = (data.levels || []).sort((a: any, b: any) => a.level_number - b.level_number);
    console.log(`[Escalation Hierarchy] GET Success for ID: ${id}`);

    return NextResponse.json({
      ...data,
      levels: sortedLevels,
    });
  } catch (err: any) {
    console.error('[Escalation Hierarchy] GET Server Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PUT /api/escalation/hierarchies/[id]
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log(`>>> [Escalation Hierarchy] PUT ID: ${id}`);
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    console.log('[Escalation Hierarchy] PUT Body:', JSON.stringify(body, null, 2));
    const { name, description, is_active, levels, trigger_after_minutes, is_default } = body;

    // If marking as default, unset any existing default for this property/org scope first
    if (is_default === true) {
      const adminClient = createAdminClient();
      // Fetch the hierarchy to know its org + property scope
      const { data: existing } = await adminClient
        .from('escalation_hierarchies')
        .select('organization_id, property_id')
        .eq('id', id)
        .single();
      if (existing) {
        const unsetQuery = adminClient
          .from('escalation_hierarchies')
          .update({ is_default: false })
          .eq('organization_id', existing.organization_id)
          .eq('is_default', true)
          .neq('id', id);
        existing.property_id
          ? await unsetQuery.eq('property_id', existing.property_id)
          : await unsetQuery.is('property_id', null);
      }
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (is_active !== undefined) updates.is_active = is_active;
    if (trigger_after_minutes !== undefined) updates.trigger_after_minutes = trigger_after_minutes;
    if (is_default !== undefined) updates.is_default = is_default;

    const { data: updated, error: updateErr } = await supabase
      .from('escalation_hierarchies')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('[Escalation Hierarchy] PUT Meta Error:', updateErr);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    if (Array.isArray(levels)) {
      console.log('[Escalation Hierarchy] PUT Replacing levels...');
      await supabase.from('escalation_levels').delete().eq('hierarchy_id', id);

      if (levels.length > 0) {
        const levelRows = levels.map((lvl: any, i: number) => ({
          hierarchy_id: id,
          level_number: lvl.level_number ?? i + 1,
          employee_id: lvl.employee_id || null,
          escalation_time_minutes: lvl.escalation_time_minutes ?? 30,
          notification_channels: lvl.notification_channels ?? ['push', 'email'],
        }));

        const { error: levelsErr } = await supabase.from('escalation_levels').insert(levelRows);
        if (levelsErr) {
          console.error('[Escalation Hierarchy] PUT Levels Error:', levelsErr);
          return NextResponse.json({ error: levelsErr.message }, { status: 500 });
        }
      }
    }

    console.log(`[Escalation Hierarchy] PUT Success for ID: ${id}`);
    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('[Escalation Hierarchy] PUT Server Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/escalation/hierarchies/[id]
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log(`>>> [Escalation Hierarchy] DELETE ID: ${id}`);
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { error } = await supabase
      .from('escalation_hierarchies')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Escalation Hierarchy] DELETE Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[Escalation Hierarchy] DELETE Success for ID: ${id}`);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[Escalation Hierarchy] DELETE Server Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
