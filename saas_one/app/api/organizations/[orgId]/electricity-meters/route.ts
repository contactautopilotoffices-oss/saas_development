/**
 * Org-level electricity meters API.
 * Lists all electricity meters across an organization's properties.
 * GET /api/organizations/[orgId]/electricity-meters
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const supabase = await createClient();

    // Get all properties for this org
    const { data: properties, error: propError } = await supabase
        .from('properties')
        .select('id')
        .eq('organization_id', orgId);

    if (propError) {
        return NextResponse.json({ error: propError.message }, { status: 500 });
    }

    if (!properties || properties.length === 0) {
        return NextResponse.json([]);
    }

    const propertyIds = properties.map(p => p.id);

    // Get all electricity meters for these properties (exclude soft-deleted)
    const { data, error } = await supabase
        .from('electricity_meters')
        .select('*')
        .in('property_id', propertyIds)
        .is('deleted_at', null);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
}
