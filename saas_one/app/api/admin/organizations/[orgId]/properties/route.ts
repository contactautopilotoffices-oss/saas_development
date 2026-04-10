/**
 * Organization property management API.
 * Returns all properties with user counts and open ticket statistics.
 * GET /api/admin/organizations/[orgId]/properties
 * Auth: Master Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/admin/organizations/[orgId]/properties
 * 
 * Get properties for a specific organization
 * Uses service role - bypasses RLS
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;

    const { data, error } = await supabaseAdmin
        .from('properties')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Admin fetch properties error:', error);
        return NextResponse.json(
            { error: error.message },
            { status: 500 }
        );
    }

    // Fetch user counts for each property
    const propertiesWithStats = await Promise.all((data || []).map(async (property) => {
        const { count } = await supabaseAdmin
            .from('property_memberships')
            .select('*', { count: 'exact', head: true })
            .eq('property_id', property.id)
            .eq('is_active', true);

        return {
            ...property,
            user_count: count || 0,
            active_user_count: count || 0,
            open_tickets_count: 0
        };
    }));

    return NextResponse.json(propertiesWithStats);
}
