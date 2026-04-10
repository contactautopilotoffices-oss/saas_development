/**
 * Org-level VMS summary API.
 * Aggregated visitor management stats across all org properties.
 * GET /api/organizations/[orgId]/vms-summary
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET: Organization-wide VMS summary (Super Admin)
// HIGH PERFORMANCE: Uses SQL-side count queries instead of fetching all rows.
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const period = searchParams.get('period') || 'today';

    // Fetch all properties in the org
    const { data: properties, error: propError } = await supabase
        .from('properties')
        .select('id, name, code')
        .eq('organization_id', orgId);

    if (propError) {
        return NextResponse.json({ error: propError.message }, { status: 500 });
    }

    const propertyIds = properties?.map((p: any) => p.id) || [];

    if (propertyIds.length === 0) {
        return NextResponse.json({
            organization_id: orgId,
            period,
            total_visitors: 0,
            total_checked_in: 0,
            total_checked_out: 0,
            properties: [],
        });
    }

    // Calculate date range
    let startDate: Date | null = null;
    if (period === 'today') {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
    }

    const periodFilter = startDate ? startDate.toISOString() : null;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    // Use parallel SQL-side count queries instead of fetching all rows
    const [totalRes, checkedInRes, checkedOutRes] = await Promise.all([
        // Total visitors in period
        supabase.from('visitor_logs').select('id', { count: 'exact', head: true })
            .in('property_id', propertyIds)
            .gte('checkin_time', periodFilter || '1970-01-01'),
        // Currently checked in (no checkout_time and not checked_out status)
        supabase.from('visitor_logs').select('id', { count: 'exact', head: true })
            .in('property_id', propertyIds)
            .is('checkout_time', null)
            .neq('status', 'checked_out')
            .gte('checkin_time', periodFilter || '1970-01-01'),
        // Checked out
        supabase.from('visitor_logs').select('id', { count: 'exact', head: true })
            .in('property_id', propertyIds)
            .not('checkout_time', 'is', null)
            .gte('checkin_time', periodFilter || '1970-01-01'),
    ]);

    // Per-property breakdown: use a single lightweight query
    // Only fetch property_id, status, checkout_time for grouping — limited to today for "today" count
    const { data: propVisitorData } = await supabase
        .from('visitor_logs')
        .select('property_id, status, checkout_time, checkin_time')
        .in('property_id', propertyIds)
        .gte('checkin_time', periodFilter || '1970-01-01')
        .limit(5000); // Cap to prevent memory issues on large orgs

    const propStats: Record<string, { total: number; checked_in: number; checked_out: number; today: number }> = {};
    for (const pid of propertyIds) {
        propStats[pid] = { total: 0, checked_in: 0, checked_out: 0, today: 0 };
    }

    (propVisitorData || []).forEach((v: any) => {
        const ps = propStats[v.property_id];
        if (!ps) return;
        ps.total++;
        if (!v.checkout_time && v.status !== 'checked_out') ps.checked_in++;
        else ps.checked_out++;
        if (v.checkin_time >= todayISO) ps.today++;
    });

    const propertyBreakdown = (properties || []).map((prop: any) => {
        const stats = propStats[prop.id] || { total: 0, checked_in: 0, checked_out: 0, today: 0 };
        return {
            property_id: prop.id,
            property_name: prop.name,
            property_code: prop.code,
            today: stats.today,
            checked_in: stats.checked_in,
            checked_out: stats.checked_out,
            total: stats.total,
        };
    });

    propertyBreakdown.sort((a: any, b: any) => b.today - a.today);

    return NextResponse.json({
        organization_id: orgId,
        period,
        total_visitors: totalRes.count || 0,
        total_checked_in: checkedInRes.count || 0,
        total_checked_out: checkedOutRes.count || 0,
        properties: propertyBreakdown,
    });
}
