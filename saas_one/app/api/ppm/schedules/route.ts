/**
 * GET /api/ppm/schedules?organization_id=&property_id=&month=3&year=2026
 * Returns all PPM (Preventive Planned Maintenance) schedules for a given month.
 * Filters by organization_id, optional property_id, and date range derived from month/year.
 * Includes vendor details (company_name, contact_person, phone) via join.
 * Auth: Supabase session required.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = request.nextUrl;
        const organizationId = searchParams.get('organization_id');
        const propertyId = searchParams.get('property_id');
        const month = parseInt(searchParams.get('month') || '0');
        const year = parseInt(searchParams.get('year') || '0');

        if (!organizationId || !month || !year) {
            return NextResponse.json({ error: 'organization_id, month, year are required' }, { status: 400 });
        }

        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // last day of month

        let query = supabase
            .from('ppm_schedules')
            .select('*, maintenance_vendors(id, company_name, contact_person, phone)')
            .eq('organization_id', organizationId)
            .gte('planned_date', startDate)
            .lte('planned_date', endDate)
            .order('planned_date', { ascending: true });

        if (propertyId) query = query.eq('property_id', propertyId);

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ schedules: data || [] });
    } catch (err) {
        console.error('PPM schedules fetch error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
