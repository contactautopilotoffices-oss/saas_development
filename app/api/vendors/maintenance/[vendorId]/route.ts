import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

type Params = { params: Promise<{ vendorId: string }> };

/** GET /api/vendors/maintenance/[vendorId] — vendor profile + assigned PPM tasks */
export async function GET(request: NextRequest, { params }: Params) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { vendorId } = await params;

    const { data: vendor, error } = await supabaseAdmin
        .from('maintenance_vendors')
        .select('*')
        .eq('id', vendorId)
        .single();

    if (error || !vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });

    // Get tasks linked by vendor_id
    const { data: linkedTasks } = await supabaseAdmin
        .from('ppm_schedules')
        .select('id, system_name, detail_name, planned_date, done_date, status, verification_status, location, frequency, scope_of_work, remark')
        .eq('vendor_id', vendorId)
        .order('planned_date', { ascending: true });

    // Also find unlinked tasks matching by company_name and auto-link them
    const { data: nameTasks } = await supabaseAdmin
        .from('ppm_schedules')
        .select('id, system_name, detail_name, planned_date, done_date, status, verification_status, location, frequency, scope_of_work, remark')
        .eq('organization_id', vendor.organization_id)
        .ilike('vendor_name', vendor.company_name)
        .is('vendor_id', null)
        .order('planned_date', { ascending: true });

    if (nameTasks && nameTasks.length > 0) {
        await supabaseAdmin
            .from('ppm_schedules')
            .update({ vendor_id: vendorId })
            .in('id', nameTasks.map(t => t.id));
    }

    const allTasks = [...(linkedTasks || []), ...(nameTasks || [])];
    const seen = new Set<string>();
    const tasks = allTasks.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });

    return NextResponse.json({ vendor, tasks });
}

/** PATCH /api/vendors/maintenance/[vendorId] — update vendor (admin: any field; vendor: only kyc_status→submitted) */
export async function PATCH(request: NextRequest, { params }: Params) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { vendorId } = await params;
    const body = await request.json();

    // Check if caller is the vendor themselves (restrict updatable fields)
    const { data: vendorRow } = await supabaseAdmin
        .from('maintenance_vendors')
        .select('user_id, organization_id')
        .eq('id', vendorId)
        .single();

    if (!vendorRow) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });

    const isVendorSelf = vendorRow.user_id === user.id;

    // Check if user is org admin
    const { data: membership } = await supabaseAdmin
        .from('organization_memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', vendorRow.organization_id)
        .single();

    const isAdmin = membership && ['admin', 'property_admin', 'org_admin', 'org_super_admin', 'owner'].includes(membership.role);

    if (!isVendorSelf && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Vendors can only submit KYC (transition pending→submitted)
    // Admins can do full updates including kyc_status verification
    let updateData: Record<string, any> = {};

    if (isAdmin) {
        const allowed = [
            'company_name', 'contact_person', 'phone', 'email', 'whatsapp_number',
            'specialization', 'is_active', 'kyc_status', 'kyc_rejection_reason',
            'bank_name', 'bank_account_number', 'bank_ifsc',
        ];
        for (const key of allowed) {
            if (key in body) updateData[key] = body[key];
        }
    } else {
        // Vendor can only update their own contact details
        const vendorAllowed = ['contact_person', 'phone', 'whatsapp_number'];
        for (const key of vendorAllowed) {
            if (key in body) updateData[key] = body[key];
        }
        // Allow KYC submission: pending → submitted only
        if (body.kyc_status === 'submitted') {
            updateData.kyc_status = 'submitted';
        }
    }

    updateData.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await supabaseAdmin
        .from('maintenance_vendors')
        .update(updateData)
        .eq('id', vendorId)
        .select()
        .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ vendor: updated });
}

/** DELETE /api/vendors/maintenance/[vendorId] — soft delete (set is_active=false) */
export async function DELETE(request: NextRequest, { params }: Params) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { vendorId } = await params;

    const { error } = await supabaseAdmin
        .from('maintenance_vendors')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', vendorId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
