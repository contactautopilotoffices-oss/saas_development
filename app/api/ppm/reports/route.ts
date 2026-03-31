import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/ppm/reports?organization_id=&property_id=&from_date=YYYY-MM-DD&to_date=YYYY-MM-DD
 */
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
        const fromDate = searchParams.get('from_date');
        const toDate = searchParams.get('to_date');

        if (!organizationId || !fromDate || !toDate) {
            return NextResponse.json({ error: 'organization_id, from_date, to_date are required' }, { status: 400 });
        }

        let query = supabaseAdmin
            .from('ppm_schedules')
            .select('*')
            .eq('organization_id', organizationId)
            .gte('planned_date', fromDate)
            .lte('planned_date', toDate)
            .order('planned_date', { ascending: true });

        if (propertyId) query = query.eq('property_id', propertyId);

        const { data: tasks, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        const allTasks = tasks || [];
        const total = allTasks.length;
        const done = allTasks.filter(t => t.status === 'done').length;
        const pending = allTasks.filter(t => t.status === 'pending').length;
        const postponed = allTasks.filter(t => t.status === 'postponed').length;
        const skipped = allTasks.filter(t => t.status === 'skipped').length;
        const compliance_pct = total > 0 ? Math.round((done / total) * 1000) / 10 : 0;

        // By system
        const systemMap = new Map<string, { total: number; done: number; pending: number; postponed: number; skipped: number }>();
        for (const t of allTasks) {
            const sys = t.system_name || 'Unknown';
            if (!systemMap.has(sys)) {
                systemMap.set(sys, { total: 0, done: 0, pending: 0, postponed: 0, skipped: 0 });
            }
            const entry = systemMap.get(sys)!;
            entry.total++;
            if (t.status === 'done') entry.done++;
            else if (t.status === 'pending') entry.pending++;
            else if (t.status === 'postponed') entry.postponed++;
            else if (t.status === 'skipped') entry.skipped++;
        }

        const by_system = Array.from(systemMap.entries()).map(([system_name, counts]) => ({
            system_name,
            ...counts,
            compliance_pct: counts.total > 0 ? Math.round((counts.done / counts.total) * 1000) / 10 : 0,
        })).sort((a, b) => b.total - a.total);

        // By month
        const monthMap = new Map<string, { total: number; done: number; pending: number }>();
        for (const t of allTasks) {
            const d = new Date(t.planned_date + 'T12:00:00');
            const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); // e.g. "Mar 2026"
            if (!monthMap.has(label)) {
                monthMap.set(label, { total: 0, done: 0, pending: 0 });
            }
            const entry = monthMap.get(label)!;
            entry.total++;
            if (t.status === 'done') entry.done++;
            else entry.pending++;
        }

        const by_month = Array.from(monthMap.entries())
            .map(([month, counts]) => ({ month, ...counts }))
            .sort((a, b) => {
                const dateA = new Date(a.month);
                const dateB = new Date(b.month);
                return dateA.getTime() - dateB.getTime();
            });

        return NextResponse.json({
            summary: { total, done, pending, postponed, skipped, compliance_pct },
            by_system,
            by_month,
            tasks: allTasks,
        });
    } catch (err) {
        console.error('PPM reports error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
