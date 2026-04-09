/**
 * Organization storage management API.
 * Returns storage breakdown by property.
 * GET /api/admin/organizations/[orgId]/storage
 * Auth: Master Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/admin/organizations/[orgId]/storage
 * 
 * Get storage breakdown by property
 * Uses service role - bypasses RLS
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;

    // Get properties for storage calculation
    const { data: properties, error } = await supabaseAdmin
        .from('properties')
        .select('id, name')
        .eq('organization_id', orgId);

    if (error) {
        console.error('Storage fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Placeholder - storage is 0 for now
    const formattedProperties = (properties || []).map((prop) => ({
        id: prop.id,
        name: prop.name,
        storage_gb: 0
    }));

    return NextResponse.json({
        total_gb: 0,
        properties: formattedProperties
    });
}
