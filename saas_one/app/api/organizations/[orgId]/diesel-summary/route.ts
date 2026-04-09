/**
 * Org-level diesel summary API.
 * Summary stats for diesel consumption across all org properties.
 * GET /api/organizations/[orgId]/diesel-summary
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET: Cross-property diesel summary for Super Admin
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const period = searchParams.get('period') || 'month'; // 'today' | 'week' | 'month'

    // Get all properties for this org
    const { data: properties, error: propError } = await supabase
        .from('properties')
        .select('id, name, code')
        .eq('organization_id', orgId);

    if (propError) {
        return NextResponse.json({ error: propError.message }, { status: 500 });
    }

    if (!properties || properties.length === 0) {
        return NextResponse.json([]);
    }

    // Calculate date range
    let startDate: string;
    const today = new Date().toISOString().split('T')[0];

    if (period === 'today') {
        startDate = today;
    } else if (period === 'week') {
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    } else {
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    }

    // Get diesel readings aggregated by property
    const propertyIds = properties.map(p => p.id);

    const { data: readings, error: readingsError } = await supabase
        .from('diesel_readings')
        .select('property_id, computed_consumed_litres, reading_date')
        .in('property_id', propertyIds)
        .gte('reading_date', startDate);

    if (readingsError) {
        return NextResponse.json({ error: readingsError.message }, { status: 500 });
    }

    // Get generators for tank capacity
    const { data: generators } = await supabase
        .from('generators')
        .select('property_id, tank_capacity_litres')
        .in('property_id', propertyIds);

    // Aggregate by property
    const aggregated = properties.map(property => {
        const propReadings = (readings || []).filter(r => r.property_id === property.id);
        const totalConsumed = propReadings.reduce((sum, r) => sum + (r.computed_consumed_litres || 0), 0);
        const todayReading = propReadings.find(r => r.reading_date === today);

        const propGenerators = (generators || []).filter(g => g.property_id === property.id);
        const totalCapacity = propGenerators.reduce((sum, g) => sum + (g.tank_capacity_litres || 1000), 0);

        return {
            property_id: property.id,
            property_name: property.name,
            property_code: property.code,
            period_total_litres: Math.round(totalConsumed),
            today_litres: todayReading?.computed_consumed_litres || 0,
            readings_count: propReadings.length,
            tank_capacity_litres: totalCapacity,
        };
    });

    // Sort by total consumption descending
    aggregated.sort((a, b) => b.period_total_litres - a.period_total_litres);

    // Add rankings
    const ranked = aggregated.map((item, index) => ({
        ...item,
        rank: index + 1,
    }));

    // Calculate org totals
    const orgTotal = {
        total_litres: ranked.reduce((sum, p) => sum + p.period_total_litres, 0),
        today_total: ranked.reduce((sum, p) => sum + p.today_litres, 0),
        properties_count: ranked.length,
        total_capacity_litres: ranked.reduce((sum, p) => sum + p.tank_capacity_litres, 0),
    };

    return NextResponse.json({
        period,
        org_summary: orgTotal,
        properties: ranked,
    });
}
