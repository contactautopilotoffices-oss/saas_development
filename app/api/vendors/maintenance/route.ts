import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { WhatsAppQueueService } from '@/backend/services/WhatsAppQueueService';

/** GET /api/vendors/maintenance?organization_id=X[&property_id=Y] */
export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = request.nextUrl;
    const organizationId = searchParams.get('organization_id');
    const propertyId = searchParams.get('property_id');
    const userId = searchParams.get('user_id');

    if (userId) {
        const { data, error } = await supabaseAdmin
            .from('maintenance_vendors')
            .select('*')
            .eq('user_id', userId)
            .single();
        if (error) return NextResponse.json({ vendor: null });
        return NextResponse.json({ vendor: data });
    }

    if (!organizationId) return NextResponse.json({ error: 'organization_id required' }, { status: 400 });

    let vendors: any[] = [];

    if (propertyId) {
        // Fetch only vendors assigned to this specific property via junction table
        const { data, error } = await supabaseAdmin
            .from('vendor_property_assignments')
            .select('vendor_id, maintenance_vendors!inner(*)')
            .eq('maintenance_vendors.organization_id', organizationId)
            .eq('property_id', propertyId)
            .order('vendor_id');
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        vendors = (data || []).map((row: any) => row.maintenance_vendors);
    } else {
        // Fetch all vendors for the org (with property assignments for display)
        const { data, error } = await supabaseAdmin
            .from('maintenance_vendors')
            .select('*, vendor_property_assignments(property_id)')
            .eq('organization_id', organizationId)
            .order('company_name');
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        vendors = (data || []).map((v: any) => ({
            ...v,
            property_ids: (v.vendor_property_assignments || []).map((a: any) => a.property_id),
        }));
    }

    // For each vendor, count assigned PPM tasks (scoped to property if provided)
    const vendorIds = vendors.map((v: any) => v.id);
    let taskCounts: Record<string, { total: number; pending: number; done: number }> = {};
    if (vendorIds.length > 0) {
        let taskQuery = supabaseAdmin
            .from('ppm_schedules')
            .select('vendor_id, status')
            .in('vendor_id', vendorIds);
        if (propertyId) taskQuery = taskQuery.eq('property_id', propertyId);
        const { data: tasks } = await taskQuery;
        (tasks || []).forEach((t: any) => {
            if (!taskCounts[t.vendor_id]) taskCounts[t.vendor_id] = { total: 0, pending: 0, done: 0 };
            taskCounts[t.vendor_id].total++;
            if (t.status === 'pending') taskCounts[t.vendor_id].pending++;
            if (t.status === 'done') taskCounts[t.vendor_id].done++;
        });
    }

    return NextResponse.json({
        vendors: vendors.map((v: any) => ({ ...v, task_counts: taskCounts[v.id] || { total: 0, pending: 0, done: 0 } }))
    });
}

/** POST /api/vendors/maintenance — create vendor + Supabase auth account */
export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { organization_id, company_name, contact_person, phone, email, whatsapp_number, specialization, property_ids } = body;

    if (!organization_id || !company_name || !contact_person || !phone) {
        return NextResponse.json({ error: 'organization_id, company_name, contact_person, phone are required' }, { status: 400 });
    }

    // Generate temp password: first 4 chars of company + last 4 digits of phone
    const cleanCompany = company_name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4);
    const cleanPhone = phone.replace(/\D/g, '').slice(-4);
    const tempPassword = `${cleanCompany}@${cleanPhone}`;

    // Create Supabase auth user (only if email provided)
    let authUserId: string | null = null;
    const debug: Record<string, any> = { email_provided: !!email };

    if (email) {
        // Check if user with this email already exists in our users table
        const { data: existingDbUser, error: lookupError } = await supabaseAdmin
            .from('users')
            .select('id, email')
            .ilike('email', email)
            .maybeSingle();

        debug.lookup_error = lookupError?.message || null;
        debug.existing_user_found = !!existingDbUser;
        debug.existing_user_id = existingDbUser?.id || null;

        if (existingDbUser) {
            authUserId = existingDbUser.id;
        } else {
            const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                password: tempPassword,
                email_confirm: true,
                user_metadata: { full_name: contact_person, vendor: true, company_name },
            });
            debug.create_error = createError?.message || null;
            debug.new_user_id = newUser?.user?.id || null;
            if (!createError) authUserId = newUser!.user.id;
        }

        debug.auth_user_id = authUserId;

        if (authUserId) {
            const { error: delError } = await supabaseAdmin
                .from('organization_memberships')
                .delete()
                .eq('user_id', authUserId)
                .eq('organization_id', organization_id);
            debug.delete_error = delError?.message || null;

            const { error: memError } = await supabaseAdmin
                .from('organization_memberships')
                .insert({
                    user_id: authUserId,
                    organization_id,
                    role: 'maintenance_vendor',
                    is_active: true,
                });
            debug.membership_error = memError?.message || null;
            debug.membership_inserted = !memError;

            if (memError) {
                return NextResponse.json({ error: `Membership insert failed: ${memError.message}`, debug }, { status: 500 });
            }
        } else {
            debug.skipped_membership = 'authUserId was null';
        }
    }

    // Create vendor profile
    const { data: vendor, error: vendorError } = await supabaseAdmin
        .from('maintenance_vendors')
        .insert({
            organization_id,
            company_name,
            contact_person,
            phone,
            email: email || null,
            whatsapp_number: whatsapp_number || phone,
            specialization: specialization || [],
            user_id: authUserId,
            created_by: user.id,
        })
        .select()
        .single();

    if (vendorError) return NextResponse.json({ error: vendorError.message }, { status: 500 });

    // Assign vendor to properties (many-to-many junction table)
    if (Array.isArray(property_ids) && property_ids.length > 0) {
        await supabaseAdmin
            .from('vendor_property_assignments')
            .insert(property_ids.map((pid: string) => ({ vendor_id: vendor.id, property_id: pid })));
    }

    // Auto-link existing ppm_schedules by vendor_name match
    const { error: rpcError } = await supabaseAdmin.rpc('match_vendor_name_to_id', {
        p_org_id: organization_id,
        p_company_name: company_name,
        p_vendor_id: vendor.id,
    });
    if (rpcError) {
        // RPC may not exist yet — fallback manual update
        await supabaseAdmin
            .from('ppm_schedules')
            .update({ vendor_id: vendor.id })
            .eq('organization_id', organization_id)
            .ilike('vendor_name', company_name)
            .is('vendor_id', null);
    }

    // Send WhatsApp notification if auth user was created
    if (authUserId) {
        const message = [
            `👋 Welcome to the Vendor Portal!`,
            ``,
            `You have been registered as a maintenance vendor.`,
            ``,
            `🏢 Company: ${company_name}`,
            `👤 Contact: ${contact_person}`,
            ``,
            `Login to the app to view your assigned tasks and complete KYC:`,
            `📧 Email: ${email}`,
            `🔑 Password: ${tempPassword}`,
            ``,
            `Please change your password after first login.`,
        ].join('\n');

        WhatsAppQueueService.enqueue({
            ticketId: '',
            userIds: [authUserId],
            message,
            eventType: 'VENDOR_WELCOME',
        }).catch(console.error);
    }

    return NextResponse.json({ vendor, temp_password: email ? tempPassword : null, debug }, { status: 201 });
}
