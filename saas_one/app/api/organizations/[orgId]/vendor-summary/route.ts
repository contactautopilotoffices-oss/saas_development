/**
 * Org-level vendor summary API.
 * Aggregated vendor performance across all org properties.
 * GET /api/organizations/[orgId]/vendor-summary
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

// GET: Organization-wide vendor revenue summary (Super Admin)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const { searchParams } = new URL(request.url);

    const period = searchParams.get('period') || 'today'; // 'today' | 'month' | 'year'

    // Fetch all properties in the org
    const { data: properties, error: propError } = await supabaseAdmin
        .from('properties')
        .select('id, name')
        .eq('organization_id', orgId);

    if (propError) {
        return NextResponse.json({ error: propError.message }, { status: 500 });
    }

    const propertyIds = properties?.map((p: any) => p.id) || [];

    if (propertyIds.length === 0) {
        return NextResponse.json({
            organization_id: orgId,
            period,
            total_revenue: 0,
            total_commission: 0,
            total_vendors: 0,
            properties: [],
        });
    }

    // Fetch vendors and revenue data IN PARALLEL (both depend only on propertyIds)
    const today = new Date().toISOString().split('T')[0];
    const monthStartStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split('T')[0];
    const yearStartStr = new Date(new Date().getFullYear(), 0, 1)
        .toISOString().split('T')[0];

    let revenueQuery = supabaseAdmin
        .from('vendor_daily_revenue')
        .select('vendor_id, property_id, revenue_amount')
        .in('property_id', propertyIds);

    if (period === 'today') revenueQuery = revenueQuery.eq('revenue_date', today);
    else if (period === 'month') revenueQuery = revenueQuery.gte('revenue_date', monthStartStr);
    else if (period === 'year') revenueQuery = revenueQuery.gte('revenue_date', yearStartStr);

    const [vendorsResult, revenueResult] = await Promise.all([
        supabaseAdmin.from('vendors').select('id, property_id, commission_rate').in('property_id', propertyIds),
        revenueQuery,
    ]);

    const vendors = vendorsResult.data;
    const vendorErr = vendorsResult.error;
    const revenueRows = revenueResult.data;
    const revErr = revenueResult.error;

    if (vendorErr) {
        return NextResponse.json({ error: vendorErr.message }, { status: 500 });
    }

    if (revErr) {
        return NextResponse.json({ error: revErr.message }, { status: 500 });
    }

    // Build commission lookup from parallel-fetched vendors
    const commissionMap: Record<string, number> = {};
    for (const v of vendors || []) {
        commissionMap[v.id] = v.commission_rate || 0;
    }

    // Aggregate per property
    const propRevenueMap: Record<string, { revenue: number; commission: number }> = {};
    for (const row of revenueRows || []) {
        const pid = row.property_id;
        if (!propRevenueMap[pid]) propRevenueMap[pid] = { revenue: 0, commission: 0 };
        const amount = row.revenue_amount || 0;
        propRevenueMap[pid].revenue += amount;
        propRevenueMap[pid].commission += amount * ((commissionMap[row.vendor_id] || 0) / 100);
    }

    let totalRevenue = 0;
    let totalCommission = 0;

    const propertyBreakdown = (properties || []).map((prop: any) => {
        const stats = propRevenueMap[prop.id] || { revenue: 0, commission: 0 };
        const vendorCount = (vendors || []).filter((v: any) => v.property_id === prop.id).length;
        totalRevenue += stats.revenue;
        totalCommission += stats.commission;
        return {
            property_id: prop.id,
            property_name: prop.name,
            vendor_count: vendorCount,
            total_revenue: stats.revenue,
            total_commission: stats.commission,
        };
    });

    propertyBreakdown.sort((a: any, b: any) => b.total_revenue - a.total_revenue);

    return NextResponse.json({
        organization_id: orgId,
        period,
        total_revenue: totalRevenue,
        total_commission: totalCommission,
        total_vendors: vendors?.length || 0,
        properties: propertyBreakdown,
    });
}
