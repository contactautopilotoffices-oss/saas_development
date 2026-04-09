/**
 * Escalation employee list API.
 * Returns employees eligible for escalation hierarchies.
 * GET /api/escalation/employees
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * GET /api/escalation/employees
 * Returns the employee pool for a given org/property.
 * 
 * Visibility Logic:
 * - If requester is an Org Super Admin: Sees all Org Admins + ALL property members in the organization.
 * - If requester is NOT an Org Super Admin (e.g. Property Admin): Sees all Org Admins + ONLY members in the specified property.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[Escalation Employees] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const organizationId = searchParams.get('organizationId');
    const propertyId = searchParams.get('propertyId');

    if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });

    console.log(`[Escalation Employees] Fetching for Org: ${organizationId}, Prop: ${propertyId}`);

    // 1. Determine requester's organizational role (sequential dependency)
    const { data: myOrgRole } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    const isOrgAdmin = myOrgRole?.role === 'org_super_admin';
    console.log(`[Escalation Employees] User ${user.email} | Role: ${myOrgRole?.role} | isOrgAdmin: ${isOrgAdmin}`);

    // 2. Fetch Org Super Admins AND Property Members in parallel for speed
    const adminClient = createAdminClient();

    let propQuery = adminClient
      .from('property_memberships')
      .select(`
        role,
        property_id,
        user:users(id, full_name, email, phone, metadata),
        property:properties!inner(organization_id)
      `)
      .eq('property.organization_id', organizationId)
      .eq('is_active', true)
      .not('role', 'in', '(tenant,vendor)');

    if (!isOrgAdmin && propertyId && propertyId !== 'all') {
      propQuery = propQuery.eq('property_id', propertyId);
    }

    const [orgAdminsRes, propMemsRes] = await Promise.all([
      adminClient
        .from('organization_memberships')
        .select(`
          role,
          is_active,
          user:users(id, full_name, email, phone, metadata)
        `)
        .eq('organization_id', organizationId)
        .eq('role', 'org_super_admin'),
      propQuery
    ]);

    if (orgAdminsRes.error) {
      console.error('[Escalation Employees] Org Admins Fetch Error:', orgAdminsRes.error);
      return NextResponse.json({ error: `Org Admins Query Error: ${orgAdminsRes.error.message}` }, { status: 500 });
    }

    if (propMemsRes.error) {
      console.error('[Escalation Employees] Prop Members Fetch Error:', propMemsRes.error);
      return NextResponse.json({ error: `Prop Query Error: ${propMemsRes.error.message}` }, { status: 500 });
    }

    // 3. Merge, Deduplicate, and Format
    const allMembers = [...(orgAdminsRes.data || []), ...(propMemsRes.data || [])];
    const seen = new Set<string>();
    
    const uniqueEmployees = allMembers
      .filter(m => m.user)
      .map(m => {
        const u = m.user as any;
        return {
          id: u.id,
          full_name: u.full_name || 'Unknown',
          email: u.email || '',
          phone: u.phone || '',
          membership_role: m.role,
          department: u.metadata?.department || null,
          status: 'active' as const,
        };
      })
      .filter(e => {
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
      });

    console.log(`[Escalation Employees] Returning ${uniqueEmployees.length} unique employees`);
    return NextResponse.json(uniqueEmployees);
  } catch (err: any) {
    console.error('[Escalation Employees] Server Side Error:', err);
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
