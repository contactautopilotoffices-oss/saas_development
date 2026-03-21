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

    // --- DIAGNOSTIC START (Unauthenticated) ---
    const { searchParams } = request.nextUrl;
    const organizationId = searchParams.get('organizationId');
    if (organizationId) {
      const { data: diagMems } = await supabase
        .from('organization_memberships')
        .select('role, is_active, user_id')
        .eq('organization_id', organizationId);

      console.log(`[Escalation Employees] [DIAGNOSTIC] Members for Org ${organizationId}:`,
        diagMems?.map(m => `(role:${m.role}, active:${m.is_active}, uid:${m.user_id?.slice(0, 8)})`)
      );
    }
    // --- DIAGNOSTIC END ---

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[Escalation Employees] Auth error:', authError);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const propertyId = searchParams.get('propertyId');

    if (!organizationId) return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });

    console.log(`[Escalation Employees] Fetching for Org: ${organizationId}, Prop: ${propertyId}`);

    // 1. Determine requester's organizational role
    const { data: myOrgRole } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    const isOrgAdmin = myOrgRole?.role === 'org_super_admin';
    console.log(`[Escalation Employees] User ${user.email} | Role: ${myOrgRole?.role} | isOrgAdmin: ${isOrgAdmin}`);

    // 2. Fetch all Organization Super Admins (Always visible to everyone for escalation)
    // Use admin client to bypass RLS — property admins can only SELECT their own org_membership row,
    // so they'd see 0 org super admins otherwise.
    const adminClient = createAdminClient();
    const { data: orgAdmins, error: orgError } = await adminClient
      .from('organization_memberships')
      .select(`
        role,
        is_active,
        user:users(id, full_name, email, phone, metadata)
      `)
      .eq('organization_id', organizationId)
      .eq('role', 'org_super_admin');

    if (orgError) {
      console.error('[Escalation Employees] Org Admins Fetch Error:', orgError);
      return NextResponse.json({ error: `Org Admins Query Error: ${orgError.message}` }, { status: 500 });
    }
    console.log(`[Escalation Employees] Found ${orgAdmins?.length || 0} Org Super Admins (regardless of is_active)`);

    // 3. Fetch Property Members
    // - If Org Admin: Fetch ALL property members in the org
    // - If Property Admin: Fetch only for their specified property
    // Use admin client to bypass property_memberships RLS and users join RLS.
    // Filter via the `properties` join (not property_memberships.organization_id) because
    // some rows were inserted without organization_id set (e.g. via bulk scripts), and
    // .eq('organization_id', ...) would silently exclude those members.
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
      .not('role', 'in', '(tenant,vendor)'); // Safety: filter out tenants/vendors

    if (!isOrgAdmin && propertyId && propertyId !== 'all') {
      propQuery = propQuery.eq('property_id', propertyId);
    }

    const { data: propMems, error: propError } = await propQuery;

    if (propError) {
      console.error('[Escalation Employees] Prop Members Fetch Error:', propError);
      return NextResponse.json({ error: `Prop Query Error: ${propError.message}` }, { status: 500 });
    }
    console.log(`[Escalation Employees] Found ${propMems?.length || 0} property-level members`);

    // 4. Merge and Format
    const allMembers = [...(orgAdmins || []), ...(propMems || [])];

    const employees = allMembers
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
      });

    // 5. Deduplicate by User ID
    const seen = new Set<string>();
    const uniqueEmployees = employees.filter(e => {
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
