import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/properties/[propertyId]/tenants
 * Returns all users with 'tenant' role in the property.
 * Only accessible by admins/staff of that property.
 */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    try {
        const { propertyId } = await params;

        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Verify caller is admin/staff
        const { data: membership } = await supabaseAdmin
            .from('property_memberships')
            .select('role')
            .eq('property_id', propertyId)
            .eq('user_id', user.id)
            .single();

        if (!['property_admin', 'staff', 'org_admin'].includes(membership?.role || '')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Fetch all tenants for this property
        const { data: tenants, error } = await supabaseAdmin
            .from('property_memberships')
            .select('user_id, users!user_id(id, full_name, email, user_photo_url)')
            .eq('property_id', propertyId)
            .eq('role', 'tenant')
            .eq('is_active', true);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const result = (tenants || []).map((m: any) => m.users).filter(Boolean);
        return NextResponse.json({ tenants: result });
    } catch (err) {
        console.error('[Property Tenants GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
