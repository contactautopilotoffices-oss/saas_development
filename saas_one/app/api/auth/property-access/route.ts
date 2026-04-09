/**
 * Property access management API.
 * Checks whether the authenticated user has access to a given property.
 * Supports master admin bypass, org-level admin access, and property membership.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * GET /api/auth/property-access?propertyId=<uuid>
 *
 * Checks whether the authenticated user has access to a given property.
 * Uses the admin client for the properties lookup so RLS cannot block
 * org-level admins who have no direct property_memberships entry.
 *
 * Returns: { authorized: boolean, role?: string }
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const propertyId = searchParams.get('propertyId');

        if (!propertyId) {
            return NextResponse.json({ authorized: false }, { status: 400 });
        }

        // Authenticated server client (respects session, subject to RLS on some tables)
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ authorized: false }, { status: 401 });
        }

        // Admin client — bypasses RLS so we can read the property's org regardless
        const adminSupabase = createAdminClient();

        // 1. Master admin bypass
        const { data: userProfile } = await adminSupabase
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .maybeSingle();

        if (userProfile?.is_master_admin) {
            return NextResponse.json({ authorized: true, role: 'master_admin' });
        }

        // 2. Get property's organization (admin client, no RLS)
        const { data: property } = await adminSupabase
            .from('properties')
            .select('organization_id')
            .eq('id', propertyId)
            .maybeSingle();

        // 3. Org-level access check (org_admin / org_super_admin / owner)
        if (property?.organization_id) {
            const { data: orgMembership } = await adminSupabase
                .from('organization_memberships')
                .select('role')
                .eq('user_id', user.id)
                .eq('organization_id', property.organization_id)
                .eq('is_active', true)
                .maybeSingle();

            if (orgMembership && ['org_admin', 'org_super_admin', 'owner'].includes(orgMembership.role)) {
                return NextResponse.json({ authorized: true, role: orgMembership.role });
            }
        }

        // 4. Property-level membership check (staff, tenant, etc.)
        const { data: propMembership } = await adminSupabase
            .from('property_memberships')
            .select('role')
            .eq('user_id', user.id)
            .eq('property_id', propertyId)
            .eq('is_active', true)
            .maybeSingle();

        if (propMembership) {
            return NextResponse.json({ authorized: true, role: propMembership.role });
        }

        return NextResponse.json({ authorized: false });

    } catch (err) {
        console.error('property-access check error:', err);
        return NextResponse.json({ authorized: false }, { status: 500 });
    }
}
