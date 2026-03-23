import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET: Organization-wide VMS summary (Super Admin)
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const period = searchParams.get('period') || 'today'; // 'today' | 'week' | 'month' | 'all'

    // Fetch all properties in the org
    const { data: properties, error: propError } = await supabase
        .from('properties')
        .select('id, name, code')
        .eq('organization_id', orgId);

    if (propError) {
        return NextResponse.json({ error: propError.message }, { status: 500 });
    }

    const propertyIds = properties?.map((p: any) => p.id) || [];

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
    // 'all' → startDate remains null → no date filter applied

    // Fetch all visitors for these properties (paginated to bypass 1000-row cap)
    let allVisitors: any[] = [];
    const PAGE_SIZE = 1000;
    let from = 0;

    while (true) {
        let pageQuery = supabase
            .from('visitor_logs')
            .select('id, property_id, status, checkin_time, checkout_time')
            .in('property_id', propertyIds)
            .range(from, from + PAGE_SIZE - 1);

        if (startDate) pageQuery = pageQuery.gte('checkin_time', startDate.toISOString());

        const { data: page, error: pageErr } = await pageQuery;
        if (pageErr || !page || page.length === 0) break;
        allVisitors = allVisitors.concat(page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    const visitors = allVisitors;

    // Process data per property
    const propertyBreakdown = properties?.map(prop => {
        const propVisitors = visitors?.filter((v: any) => v.property_id === prop.id) || [];
        const checkedIn = propVisitors.filter((v: any) => !v.checkout_time && v.status !== 'checked_out').length;
        const checkedOut = propVisitors.filter((v: any) => !!v.checkout_time || v.status === 'checked_out').length;

        // Calculate this week's visitors
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const thisWeek = propVisitors.filter((v: any) => new Date(v.checkin_time) >= weekAgo).length;

        return {
            property_id: prop.id,
            property_name: prop.name,
            property_code: prop.code,
            today: propVisitors.filter((v: any) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                return new Date(v.checkin_time) >= today;
            }).length,
            this_week: thisWeek,
            checked_in: checkedIn,
            checked_out: checkedOut,
            total: propVisitors.length,
        };
    }) || [];

    // Sort by today's visitors descending
    propertyBreakdown.sort((a, b) => b.today - a.today);

    // Calculate totals using checkout_time as the reliable indicator
    const totalVisitors = visitors?.length || 0;
    const totalCheckedIn = visitors?.filter((v: any) => !v.checkout_time && v.status !== 'checked_out').length || 0;
    const totalCheckedOut = visitors?.filter((v: any) => !!v.checkout_time || v.status === 'checked_out').length || 0;

    return NextResponse.json({
        organization_id: orgId,
        period,
        total_visitors: totalVisitors,
        total_checked_in: totalCheckedIn,
        total_checked_out: totalCheckedOut,
        properties: propertyBreakdown,
    });
}
