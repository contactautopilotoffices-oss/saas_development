/**
 * Super tenant operations API.
 * Manages property assignments for super tenants.
 * GET: List assigned properties | POST: Assign properties | DELETE: Remove assignment.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * GET /api/super-tenant?user_id=<uuid>
 * Returns the list of properties assigned to a super tenant.
 * Master admins can query any user; super tenants can only query themselves.
 */
export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('user_id') || caller.id;

    // Permission: master admin OR self
    const { data: callerProfile } = await supabase
        .from('users').select('is_master_admin').eq('id', caller.id).single();

    const isMasterAdmin = !!callerProfile?.is_master_admin;

    // org_super_admin can also query their own org's super tenants
    const { data: orgMem } = await supabase
        .from('organization_memberships')
        .select('role, organization_id')
        .eq('user_id', caller.id)
        .eq('is_active', true)
        .maybeSingle();

    const isOrgSuperAdmin = orgMem?.role === 'org_super_admin';

    if (!isMasterAdmin && !isOrgSuperAdmin && caller.id !== targetUserId) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
        .from('super_tenant_properties')
        .select('id, property_id, organization_id, assigned_by, created_at, properties(id, name, code, status)')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ properties: data });
}

/**
 * POST /api/super-tenant
 * Assign one or more properties to a super_tenant user.
 * Body: { user_id, property_ids: string[], organization_id }
 * Only master admins can call this.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: callerProfile } = await supabase
        .from('users').select('is_master_admin').eq('id', caller.id).single();

    const isMasterAdmin = !!callerProfile?.is_master_admin;

    const { data: callerOrgMem } = await supabase
        .from('organization_memberships')
        .select('role, organization_id')
        .eq('user_id', caller.id)
        .eq('is_active', true)
        .maybeSingle();

    const isOrgSuperAdmin = callerOrgMem?.role === 'org_super_admin';

    if (!isMasterAdmin && !isOrgSuperAdmin) {
        return NextResponse.json({ error: 'Forbidden. Only super admins or master admins can assign super tenant properties.' }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, property_ids, organization_id } = body;

    if (!user_id || !Array.isArray(property_ids) || property_ids.length === 0 || !organization_id) {
        return NextResponse.json({ error: 'Missing required fields: user_id, property_ids, organization_id' }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Verify target user exists and has/will get super_tenant role
    const { data: targetUser } = await adminClient
        .from('users').select('id, full_name, email').eq('id', user_id).single();
    if (!targetUser) return NextResponse.json({ error: 'Target user not found' }, { status: 404 });

    // Upsert org membership with super_tenant role if not already present
    await adminClient
        .from('organization_memberships')
        .upsert({ user_id, organization_id, role: 'super_tenant', is_active: true }, { onConflict: 'user_id,organization_id' });

    // Insert super_tenant_properties rows (upsert to avoid duplicates)
    const rows = property_ids.map((pid: string) => ({
        user_id,
        property_id: pid,
        organization_id,
        assigned_by: caller.id,
    }));

    const { error: insertErr } = await adminClient
        .from('super_tenant_properties')
        .upsert(rows, { onConflict: 'user_id,property_id' });

    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });

    // Also ensure property_memberships exist so RLS policies work
    const propMemberRows = property_ids.map((pid: string) => ({
        user_id,
        property_id: pid,
        organization_id,
        role: 'super_tenant',
        is_active: true,
    }));

    await adminClient
        .from('property_memberships')
        .upsert(propMemberRows, { onConflict: 'user_id,property_id' });

    return NextResponse.json({
        success: true,
        message: `Assigned ${property_ids.length} property/properties to ${targetUser.email}`,
        user: targetUser,
    });
}

/**
 * DELETE /api/super-tenant
 * Remove a property assignment from a super tenant.
 * Body: { user_id, property_id }
 * Only master admins can call this.
 */
export async function DELETE(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user: caller }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: callerProfile } = await supabase
        .from('users').select('is_master_admin').eq('id', caller.id).single();

    const isMasterAdminDel = !!callerProfile?.is_master_admin;
    const { data: callerOrgMemDel } = await supabase
        .from('organization_memberships')
        .select('role')
        .eq('user_id', caller.id)
        .eq('is_active', true)
        .maybeSingle();

    if (!isMasterAdminDel && callerOrgMemDel?.role !== 'org_super_admin') {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { user_id, property_id } = body;
    if (!user_id || !property_id) return NextResponse.json({ error: 'Missing user_id or property_id' }, { status: 400 });

    const adminClient = createAdminClient();

    const { error } = await adminClient
        .from('super_tenant_properties')
        .delete()
        .eq('user_id', user_id)
        .eq('property_id', property_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Also remove from property_memberships
    await adminClient
        .from('property_memberships')
        .delete()
        .eq('user_id', user_id)
        .eq('property_id', property_id);

    return NextResponse.json({ success: true });
}
