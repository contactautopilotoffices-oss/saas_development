/**
 * Assign user to property API.
 * POST: Assign a user to a property with a role.
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * POST /api/users/assign-property
 * Add or remove a property assignment for an existing user.
 * Used by org super admin to give a user access to multiple properties.
 *
 * Body:
 *   userId        - target user's ID
 *   propertyId    - property to assign/unassign
 *   role          - role to assign (e.g. 'property_admin', 'staff', 'mst')
 *   organizationId - org scope for auth check
 *   action        - 'add' | 'remove'  (default: 'add')
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { userId, propertyId, role, organizationId, action = 'add' } = body;

        if (!userId || !propertyId || !organizationId) {
            return NextResponse.json(
                { error: 'Missing required fields: userId, propertyId, organizationId' },
                { status: 400 }
            );
        }

        const adminClient = createAdminClient();

        // Verify caller is org_super_admin or master_admin for this org
        const { data: callerMembership } = await adminClient
            .from('organization_memberships')
            .select('role')
            .eq('user_id', user.id)
            .eq('organization_id', organizationId)
            .eq('is_active', true)
            .maybeSingle();

        const { data: callerProfile } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .maybeSingle();

        const isAuthorized =
            callerProfile?.is_master_admin === true ||
            callerMembership?.role === 'org_super_admin';

        if (!isAuthorized) {
            return NextResponse.json({ error: 'Only org super admins can assign properties' }, { status: 403 });
        }

        if (action === 'remove') {
            // Deactivate the membership (don't delete, preserves history)
            const { error } = await adminClient
                .from('property_memberships')
                .update({ is_active: false })
                .eq('user_id', userId)
                .eq('property_id', propertyId);

            if (error) {
                console.error('Remove property membership error:', error);
                return NextResponse.json({ error: 'Failed to remove property access' }, { status: 500 });
            }

            return NextResponse.json({ success: true, action: 'removed' });
        }

        // action === 'add': upsert the membership
        const { data: existing } = await adminClient
            .from('property_memberships')
            .select('user_id, is_active, role')
            .eq('user_id', userId)
            .eq('property_id', propertyId)
            .maybeSingle();

        if (existing) {
            // Reactivate and update role
            const { error } = await adminClient
                .from('property_memberships')
                .update({ is_active: true, role: role || existing.role })
                .eq('user_id', userId)
                .eq('property_id', propertyId);

            if (error) {
                console.error('Update property membership error:', error);
                return NextResponse.json({ error: 'Failed to update property access' }, { status: 500 });
            }
        } else {
            // Insert new membership
            const { error } = await adminClient
                .from('property_memberships')
                .insert({
                    user_id: userId,
                    property_id: propertyId,
                    organization_id: organizationId,
                    role: role || 'property_admin',
                    is_active: true,
                });

            if (error) {
                console.error('Insert property membership error:', error);
                return NextResponse.json({ error: 'Failed to assign property access' }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true, action: 'added' });
    } catch (error) {
        console.error('Assign property error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
