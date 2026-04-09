/**
 * Org-level electricity readings API.
 * Aggregated electricity data across all properties.
 * GET /api/organizations/[orgId]/electricity-readings
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

    // Select all fields including relations so OCR dashboard receives full data
    let query = supabase
        .from('electricity_readings')
        .select('*, meter:electricity_meters(name, meter_type, meter_number), property:properties!inner(id, organization_id), created_by_user:users(full_name)')
        .eq('property.organization_id', orgId)
        .order('reading_date', { ascending: false });

    if (startDate) query = query.gte('reading_date', startDate);
    if (endDate) query = query.lte('reading_date', endDate);

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
}
