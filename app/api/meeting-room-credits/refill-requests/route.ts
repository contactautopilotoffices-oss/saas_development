import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/meeting-room-credits/refill-requests?propertyId=&status=
 * Admin: see all requests for property
 * Tenant: see own requests
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = request.nextUrl;
        const propertyId = searchParams.get('propertyId');
        const status = searchParams.get('status'); // pending | approved | rejected

        if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

        const { data: membership } = await supabaseAdmin
            .from('property_memberships')
            .select('role')
            .eq('property_id', propertyId)
            .eq('user_id', user.id)
            .single();

        const isAdmin = ['property_admin', 'staff', 'org_admin'].includes(membership?.role || '');

        let query = supabaseAdmin
            .from('meeting_room_credit_requests')
            .select('*, tenant:users!user_id(id, full_name, email), reviewer:users!reviewed_by(full_name)')
            .eq('property_id', propertyId)
            .order('created_at', { ascending: false });

        if (!isAdmin) query = query.eq('user_id', user.id);
        if (status) query = query.eq('status', status);

        const { data: requests, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ requests: requests || [] });
    } catch (err) {
        console.error('[Refill Requests GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/meeting-room-credits/refill-requests
 * Tenant raises a refill request
 * Body: { propertyId, reason? }
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { propertyId, reason } = body;

        if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

        // Check tenant has a credit record
        const { data: credit } = await supabaseAdmin
            .from('meeting_room_credits')
            .select('id, remaining_hours')
            .eq('property_id', propertyId)
            .eq('user_id', user.id)
            .single();

        if (!credit) {
            return NextResponse.json({ error: 'No credit allocation found for your account' }, { status: 404 });
        }

        // Prevent duplicate pending requests
        const { data: existing } = await supabaseAdmin
            .from('meeting_room_credit_requests')
            .select('id')
            .eq('property_id', propertyId)
            .eq('user_id', user.id)
            .eq('status', 'pending')
            .single();

        if (existing) {
            return NextResponse.json({ error: 'You already have a pending refill request' }, { status: 409 });
        }

        const { data: newRequest, error } = await supabaseAdmin
            .from('meeting_room_credit_requests')
            .insert({
                property_id: propertyId,
                user_id: user.id,
                reason: reason || null,
                status: 'pending',
            })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ success: true, request: newRequest }, { status: 201 });
    } catch (err) {
        console.error('[Refill Requests POST]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
