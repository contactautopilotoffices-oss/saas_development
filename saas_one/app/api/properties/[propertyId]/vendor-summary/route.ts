/**
 * Vendor summary report for a property.
 * GET: Fetch vendor performance summary.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/properties/[propertyId]/vendor-summary
 * Property-level vendor revenue summary. Uses supabaseAdmin to bypass RLS.
 * Query params: period = 'today' | 'month' | 'all'
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;

    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

    const supabase = await createClient();
    const { data: { user }, error: authError } = token 
        ? await supabase.auth.getUser(token)
        : await supabase.auth.getUser();

    if (authError || !user) {
        console.error('[Vendor API] Auth error:', authError?.message || 'No user found');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'all';

    const today = new Date().toISOString().split('T')[0];
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split('T')[0];

    // Fetch vendors for count, commission rates, status
    const { data: vendors, error: vendorErr } = await supabaseAdmin
        .from('vendors')
        .select('id, commission_rate, status')
        .eq('property_id', propertyId);

    if (vendorErr) {
        return NextResponse.json({ error: vendorErr.message }, { status: 500 });
    }

    // Build commission map
    const commissionMap: Record<string, number> = {};
    for (const v of vendors || []) {
        commissionMap[v.id] = v.commission_rate || 0;
    }

    // Directly query vendor_daily_revenue with property_id + date filter
    let revenueQuery = supabaseAdmin
        .from('vendor_daily_revenue')
        .select('vendor_id, revenue_amount, revenue_date')
        .eq('property_id', propertyId);

    if (period === 'today') revenueQuery = revenueQuery.eq('revenue_date', today);
    else if (period === 'month') revenueQuery = revenueQuery.gte('revenue_date', monthStart);
    // 'all' → no date filter

    const { data: revenueRows, error: revErr } = await revenueQuery;

    if (revErr) {
        return NextResponse.json({ error: revErr.message }, { status: 500 });
    }

    let totalRevenue = 0;
    let totalCommission = 0;

    for (const row of revenueRows || []) {
        const amount = row.revenue_amount || 0;
        totalRevenue += amount;
        totalCommission += amount * ((commissionMap[row.vendor_id] || 0) / 100);
    }

    return NextResponse.json({
        property_id: propertyId,
        period,
        total_revenue: totalRevenue,
        total_commission: totalCommission,
        total_vendors: (vendors || []).length,
        active_vendors: (vendors || []).filter((v: any) => v.status === 'active').length,
    });
}
