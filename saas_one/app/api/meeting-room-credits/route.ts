/**
 * Meeting room credits management API.
 * GET: List credits | PATCH: Update credit hours.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/meeting-room-credits?propertyId=&userId=
 * - Tenant: get their own credits for a property
 * - Admin: get all tenant credits for a property
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { searchParams } = request.nextUrl;
        const propertyId = searchParams.get('propertyId');
        const userId = searchParams.get('userId'); // admin querying specific tenant

        if (!propertyId) return NextResponse.json({ error: 'propertyId required' }, { status: 400 });

        // Check caller role
        const { data: membership } = await supabaseAdmin
            .from('property_memberships')
            .select('role')
            .eq('property_id', propertyId)
            .eq('user_id', user.id)
            .single();

        const isAdmin = ['property_admin', 'staff', 'org_admin'].includes(membership?.role || '');

        if (isAdmin) {
            // Admin: fetch all tenant credits with user info
            let query = supabaseAdmin
                .from('meeting_room_credits')
                .select('*, tenant:users!user_id(id, full_name, email), assigned_by_user:users!assigned_by(full_name)')
                .eq('property_id', propertyId)
                .order('updated_at', { ascending: false });

            if (userId) query = query.eq('user_id', userId);

            const { data: credits, error } = await query;
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            return NextResponse.json({ credits: credits || [] });
        } else {
            // Tenant: only own credits
            const { data: credit, error } = await supabaseAdmin
                .from('meeting_room_credits')
                .select('*')
                .eq('property_id', propertyId)
                .eq('user_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
            return NextResponse.json({ credit: credit || null });
        }
    } catch (err) {
        console.error('[Credits GET]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/meeting-room-credits
 * Admin assigns or updates credit hours for a tenant
 * Body: { propertyId, userId, monthlyHours }
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { propertyId, userId, monthlyHours } = body;

        if (!propertyId || !userId || monthlyHours == null) {
            return NextResponse.json({ error: 'propertyId, userId, monthlyHours required' }, { status: 400 });
        }

        // Only admins can assign credits
        const { data: membership } = await supabaseAdmin
            .from('property_memberships')
            .select('role')
            .eq('property_id', propertyId)
            .eq('user_id', user.id)
            .single();

        if (!['property_admin', 'staff', 'org_admin'].includes(membership?.role || '')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const hours = parseFloat(monthlyHours);
        if (isNaN(hours) || hours < 0) {
            return NextResponse.json({ error: 'Invalid monthlyHours value' }, { status: 400 });
        }

        // Upsert credit record
        const nextReset = new Date();
        nextReset.setMonth(nextReset.getMonth() + 1);
        nextReset.setDate(1);
        nextReset.setHours(0, 0, 0, 0);

        const { data: existing } = await supabaseAdmin
            .from('meeting_room_credits')
            .select('id, remaining_hours, monthly_hours')
            .eq('property_id', propertyId)
            .eq('user_id', userId)
            .single();

        let credit;
        if (existing) {
            // Update monthly allocation; adjust remaining proportionally
            const diff = hours - existing.monthly_hours;
            const newRemaining = Math.max(0, existing.remaining_hours + diff);
            const { data, error } = await supabaseAdmin
                .from('meeting_room_credits')
                .update({
                    monthly_hours: hours,
                    remaining_hours: newRemaining,
                    assigned_by: user.id,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', existing.id)
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            credit = data;

            // Log
            await supabaseAdmin.from('meeting_room_credit_log').insert({
                credit_id: existing.id,
                user_id: userId,
                action: 'assigned',
                hours_changed: diff,
                hours_after: newRemaining,
                performed_by: user.id,
                notes: `Monthly hours updated to ${hours}h`,
            });
        } else {
            const { data, error } = await supabaseAdmin
                .from('meeting_room_credits')
                .insert({
                    property_id: propertyId,
                    user_id: userId,
                    assigned_by: user.id,
                    monthly_hours: hours,
                    remaining_hours: hours,
                    last_reset_at: new Date().toISOString(),
                    next_reset_at: nextReset.toISOString(),
                })
                .select()
                .single();
            if (error) return NextResponse.json({ error: error.message }, { status: 500 });
            credit = data;

            // Log
            await supabaseAdmin.from('meeting_room_credit_log').insert({
                credit_id: credit.id,
                user_id: userId,
                action: 'assigned',
                hours_changed: hours,
                hours_after: hours,
                performed_by: user.id,
                notes: `Initial allocation of ${hours}h/month`,
            });
        }

        return NextResponse.json({ success: true, credit }, { status: 200 });
    } catch (err) {
        console.error('[Credits POST]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
