/**
 * Org-level VMS API.
 * GET: Fetch org visitor management summary.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/vms/org/[orgId]
 * Returns all visitor logs across all properties in an organization.
 * Intended for org_super_admin.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status') || 'all';
    const date = searchParams.get('date') || 'today';
    const customDate = searchParams.get('customDate') || '';
    const search = searchParams.get('search') || '';
    const propertyId = searchParams.get('propertyId') || '';

    let query = supabaseAdmin
        .from('visitor_logs')
        .select('*, properties(id, name)')
        .eq('organization_id', orgId)
        .order('checkin_time', { ascending: false });

    // Status filter
    if (status !== 'all') {
        query = query.eq('status', status);
    }

    // Property filter
    if (propertyId) {
        query = query.eq('property_id', propertyId);
    }

    // Date filter
    if (date === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.gte('checkin_time', today.toISOString());
    } else if (date === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(0, 0, 0, 0);
        const end = new Date(yesterday);
        end.setHours(23, 59, 59, 999);
        query = query.gte('checkin_time', yesterday.toISOString()).lte('checkin_time', end.toISOString());
    } else if (date === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('checkin_time', weekAgo.toISOString());
    } else if (date === 'month') {
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);
        query = query.gte('checkin_time', monthAgo.toISOString());
    } else if (date === 'custom' && customDate) {
        const start = new Date(customDate);
        start.setHours(0, 0, 0, 0);
        const end = new Date(customDate);
        end.setHours(23, 59, 59, 999);
        query = query.gte('checkin_time', start.toISOString()).lte('checkin_time', end.toISOString());
    }

    // Search filter
    if (search) {
        query = query.or(`visitor_id.ilike.%${search}%,name.ilike.%${search}%,mobile.ilike.%${search}%`);
    }

    const { data, error } = await query.limit(200);

    if (error) {
        console.error('[VMS Org] Error fetching visitors:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Today stats for entire org
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [{ count: totalToday }, { count: checkedIn }, { count: checkedOut }] = await Promise.all([
        supabaseAdmin
            .from('visitor_logs')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .gte('checkin_time', todayStart.toISOString()),
        supabaseAdmin
            .from('visitor_logs')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('status', 'checked_in')
            .gte('checkin_time', todayStart.toISOString()),
        supabaseAdmin
            .from('visitor_logs')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .eq('status', 'checked_out')
            .gte('checkin_time', todayStart.toISOString()),
    ]);

    // Fetch all properties in this org for filter dropdown
    const { data: properties } = await supabaseAdmin
        .from('properties')
        .select('id, name')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('name');

    return NextResponse.json({
        visitors: data || [],
        stats: {
            total_today: totalToday || 0,
            checked_in: checkedIn || 0,
            checked_out: checkedOut || 0,
        },
        properties: properties || [],
    });
}
