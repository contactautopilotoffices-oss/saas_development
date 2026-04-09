/**
 * GET /api/vendors/maintenance/me - Current vendor profile for authenticated vendor user.
 * Returns vendor details, property associations, and task summary.
 * Auth: Supabase session (vendor role).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

export async function GET(_request: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: vendor, error } = await supabaseAdmin
        .from('maintenance_vendors')
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (error || !vendor) return NextResponse.json({ error: 'Vendor profile not found' }, { status: 404 });

    // Fetch the properties this vendor is assigned to
    const { data: assignments } = await supabaseAdmin
        .from('vendor_property_assignments')
        .select('property_id')
        .eq('vendor_id', vendor.id);
    const assignedPropertyIds = (assignments || []).map((a: any) => a.property_id);

    // Match tasks by vendor_name — works regardless of whether vendor_id column exists
    let taskQuery = supabaseAdmin
        .from('ppm_schedules')
        .select('id, system_name, detail_name, planned_date, done_date, status, verification_status, location, frequency, scope_of_work, remark, checker, attachments, property_id')
        .eq('organization_id', vendor.organization_id)
        .ilike('vendor_name', vendor.company_name);

    // Scope to assigned properties if any exist; otherwise show all org tasks
    if (assignedPropertyIds.length > 0) {
        taskQuery = taskQuery.in('property_id', assignedPropertyIds);
    }

    const { data: tasks } = await taskQuery.order('planned_date', { ascending: true });

    // Best-effort: try to set vendor_id if column exists (migration may not have run)
    if (tasks && tasks.length > 0) {
        try {
            await supabaseAdmin
                .from('ppm_schedules')
                .update({ vendor_id: vendor.id })
                .in('id', tasks.map((t: any) => t.id));
        } catch {
            // ignore — vendor_id column may not exist yet
        }
    }

    return NextResponse.json({ vendor, tasks: tasks || [], assigned_property_ids: assignedPropertyIds });
}
