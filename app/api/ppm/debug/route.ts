import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/ppm/debug?organization_id=&limit=20
 * Returns raw planned_date and done_date values from DB — for debugging timezone issues.
 * Remove this route after debugging.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = request.nextUrl;
    const organizationId = searchParams.get('organization_id');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (!organizationId) {
        return NextResponse.json({ error: 'organization_id required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
        .from('ppm_schedules')
        .select('id, system_name, planned_date, done_date, status')
        .eq('organization_id', organizationId)
        .order('planned_date', { ascending: true })
        .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
        serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        serverNow: new Date().toISOString(),
        count: data?.length,
        records: data,
    });
}
