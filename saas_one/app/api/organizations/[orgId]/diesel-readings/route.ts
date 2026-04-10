/**
 * Org-level diesel readings API.
 * Aggregated diesel data across all properties in an organization.
 * GET /api/organizations/[orgId]/diesel-readings
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
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const period = searchParams.get('period');

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

    let query = supabase
        .from('diesel_readings')
        .select('*, generator:generators(name)')
        .in('property_id', propertyIds);

    if (startDate) query = query.gte('reading_date', startDate);
    if (endDate) query = query.lte('reading_date', endDate);

    // Period logic if provided
    if (period === 'today') {
        const today = new Date().toISOString().split('T')[0];
        query = query.eq('reading_date', today);
    }

    const { data, error } = await query.order('reading_date', { ascending: false });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
}
