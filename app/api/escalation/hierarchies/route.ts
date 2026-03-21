import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * GET /api/escalation/hierarchies
 * List escalation hierarchies for an org or property
 * Query params: organizationId, propertyId (optional)
 */
export async function GET(request: NextRequest) {
  console.log('>>> [Escalation Hierarchies] GET API START');
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[Escalation Hierarchies] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const organizationId = searchParams.get('organizationId');
    const propertyId = searchParams.get('propertyId');

    if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });

    console.log(`[Escalation Hierarchies] Fetching for Org: ${organizationId}, Prop: ${propertyId}`);

    // Use admin client so the nested employee join isn't blocked by users RLS
    // (users table only allows SELECT WHERE id = auth.uid(), so joins return null otherwise)
    const adminClient = createAdminClient();
    let query = adminClient
      .from('escalation_hierarchies')
      .select(`
        *,
        levels:escalation_levels(
          id, level_number, employee_id, escalation_time_minutes, notification_channels,
          employee:users!escalation_levels_employee_id_fkey(id, full_name, email, phone, metadata)
        )
      `)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (propertyId && propertyId !== 'all') {
      query = query.eq('property_id', propertyId);
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Escalation Hierarchies] Query Error:', error);
      return NextResponse.json({ error: `Query Error: ${error.message}` }, { status: 500 });
    }

    // Sort levels by level_number within each hierarchy
    const normalized = (data || []).map(h => ({
      ...h,
      levels: (h.levels || []).sort((a: any, b: any) => a.level_number - b.level_number),
    }));

    console.log(`[Escalation Hierarchies] Returning ${normalized.length} hierarchies`);
    return NextResponse.json(normalized);
  } catch (err: any) {
    console.error('[Escalation Hierarchies] Server Side Error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/escalation/hierarchies
 * Create a new escalation hierarchy with its levels
 * Body: { organizationId, propertyId?, name, description?, levels: [{ level_number, employee_id, escalation_time_minutes, notification_channels }] }
 */
export async function POST(request: NextRequest) {
  console.log('>>> [Escalation Hierarchies] POST API START');
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[Escalation Hierarchies] POST Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    console.log('[Escalation Hierarchies] POST Body:', JSON.stringify(body, null, 2));
    const { organizationId, propertyId, name, description, levels = [], trigger_after_minutes, is_default } = body;

    if (!organizationId || !name) {
      return NextResponse.json({ error: 'organizationId and name are required' }, { status: 400 });
    }
    if (!Array.isArray(levels) || levels.length === 0) {
      return NextResponse.json({ error: 'At least one escalation level is required' }, { status: 400 });
    }

    // If marked as default, unset any existing default for this property/org scope
    if (is_default) {
      const adminClient = createAdminClient();
      const unsetQuery = adminClient
        .from('escalation_hierarchies')
        .update({ is_default: false })
        .eq('organization_id', organizationId)
        .eq('is_default', true);
      propertyId
        ? await unsetQuery.eq('property_id', propertyId)
        : await unsetQuery.is('property_id', null);
    }

    // Create the hierarchy
    console.log('[Escalation Hierarchies] Creating hierarchy record...');
    const { data: hierarchy, error: hierErr } = await supabase
      .from('escalation_hierarchies')
      .insert({
        organization_id: organizationId,
        property_id: propertyId || null,
        name: name.trim(),
        description: description?.trim() || null,
        created_by: user.id,
        is_active: true,
        trigger_after_minutes: trigger_after_minutes ?? 30,
        is_default: is_default ?? false,
      })
      .select()
      .single();

    if (hierErr) {
      console.error('[Escalation Hierarchies] Hierarchy Insert Error:', hierErr);
      return NextResponse.json({ error: `Hierarchy Create Error: ${hierErr.message}` }, { status: 500 });
    }

    console.log('[Escalation Hierarchies] Hierarchy created with ID:', hierarchy.id);

    // Insert all levels
    const levelRows = levels.map((lvl: any, i: number) => ({
      hierarchy_id: hierarchy.id,
      level_number: lvl.level_number ?? i + 1,
      employee_id: lvl.employee_id || null,
      escalation_time_minutes: lvl.escalation_time_minutes ?? 30,
      notification_channels: lvl.notification_channels ?? ['push', 'email'],
    }));

    console.log('[Escalation Hierarchies] Inserting levels...', levelRows);
    const { error: levelsErr } = await supabase
      .from('escalation_levels')
      .insert(levelRows);

    if (levelsErr) {
      console.error('[Escalation Hierarchies] Levels Insert Error:', levelsErr);
      // Rollback: delete the hierarchy if levels failed
      await supabase.from('escalation_hierarchies').delete().eq('id', hierarchy.id);
      return NextResponse.json({ error: `Levels Create Error: ${levelsErr.message}` }, { status: 500 });
    }

    console.log('[Escalation Hierarchies] Hierarchy and levels saved successfully');
    return NextResponse.json({ id: hierarchy.id, ...hierarchy }, { status: 201 });
  } catch (err: any) {
    console.error('[Escalation Hierarchies] POST Server Side Error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
