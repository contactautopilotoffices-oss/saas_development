/**
 * Property VMS summary API.
 * GET: Fetch visitor management stats for a property.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/properties/[propertyId]/vms-summary
 * Property-level visitor summary. Uses supabaseAdmin to bypass visitor_logs RLS.
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
        console.error('[VMS API] Auth error:', authError?.message || 'No user found');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'today';

    // Build date filter
    let startDate: Date | null = null;
    if (period === 'today') {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        startDate.setHours(0, 0, 0, 0);
    }
    // 'all' → no date filter

    // Paginate to bypass 1000-row cap
    const PAGE_SIZE = 1000;
    let allVisitors: any[] = [];
    let from = 0;

    while (true) {
        let q = supabaseAdmin
            .from('visitor_logs')
            .select('id, status, checkin_time, checkout_time, category')
            .eq('property_id', propertyId)
            .range(from, from + PAGE_SIZE - 1);

        if (startDate) q = q.gte('checkin_time', startDate.toISOString());

        const { data: page, error } = await q;
        if (error || !page || page.length === 0) break;
        allVisitors = allVisitors.concat(page);
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const total = allVisitors.length;
    const todayCount = allVisitors.filter(v => new Date(v.checkin_time) >= todayStart).length;

    // Use checkout_time as the single source of truth.
    // checkout_time is always set on checkout (force or regular), status string is unreliable.
    const checkedIn = allVisitors.filter(v => !v.checkout_time).length;   // still inside
    const checkedOut = allVisitors.filter(v => !!v.checkout_time).length; // left

    return NextResponse.json({
        property_id: propertyId,
        period,
        total_visitors: total,
        visitors_today: todayCount,
        checked_in: checkedIn,
        checked_out: checkedOut,
    });
}
