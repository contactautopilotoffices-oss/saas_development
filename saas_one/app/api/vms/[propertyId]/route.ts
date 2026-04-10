/**
 * @fileoverview Visitor Management System (VMS) API
 * @route GET  /api/vms/[propertyId]  — List visitors with optional filters and daily stats
 * @route POST /api/vms/[propertyId]  — Check in a visitor
 * @route PATCH /api/vms/[propertyId] — Check out a visitor by visitor_id
 * @description
 *   Handles visitor lifecycle management for a property: check-in, check-out, and
 *   listing with filtering by status (checked_in/checked_out/all), date range
 *   (today/week/specific date), and text search (by visitor ID or name).
 *   Also returns real-time daily stats (total visitors, currently checked in,
 *   and checked out) alongside the visitor list.
 *
 *   All operations use an admin client to bypass RLS.
 * @requires_auth None (RLS bypassed via admin client)
 * @response 200 { visitors, stats } — list endpoint
 * @response 200 { success, visitor_id, message, visitor } — check-in/check-out
 * @response 400 Bad Request — missing required fields or already checked out
 * @response 401 Unauthorized
 * @response 404 Not Found — property or visitor not found
 * @response 500 Internal Server Error
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

// Create admin client for operations that need to bypass RLS
const getAdminClient = () => createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

// POST: Check-in a visitor
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabaseAdmin = getAdminClient(); // Use admin client for check-in
    const body = await request.json();

    try {
        // Get property and org info
        const { data: property, error: propError } = await supabaseAdmin
            .from('properties')
            .select('organization_id, code')
            .eq('id', propertyId)
            .single();

        if (propError || !property) {
            return NextResponse.json({ error: 'Property not found' }, { status: 404 });
        }

        // Use provided visitor ID or generate one
        let visitorId = body.visitor_id;

        if (!visitorId) {
            const { data: visitorIdData, error: idError } = await supabaseAdmin
                .rpc('generate_visitor_id', { p_property_id: propertyId });

            if (idError) {
                console.error('Error generating visitor ID:', idError);
                return NextResponse.json({ error: 'Failed to generate visitor ID' }, { status: 500 });
            }
            visitorId = visitorIdData;
        }

        // Insert visitor log
        const { data: visitor, error: insertError } = await supabaseAdmin
            .from('visitor_logs')
            .insert({
                property_id: propertyId,
                organization_id: property.organization_id,
                visitor_id: visitorId,
                category: body.category,
                name: body.name,
                mobile: body.mobile || null,
                coming_from: body.coming_from || null,
                whom_to_meet: body.whom_to_meet,
                photo_url: body.photo_url || null,
                checkin_time: new Date().toISOString(),
                status: 'checked_in',
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error creating visitor log:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            visitor_id: visitorId,
            message: `Welcome ${body.name}! Your visit is logged.`,
            visitor,
        }, { status: 201 });
    } catch (err) {
        console.error('Check-in error:', err);
        return NextResponse.json({ error: 'Check-in failed' }, { status: 500 });
    }
}

// GET: List visitors for a property
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabaseAdmin = getAdminClient(); // Use admin client for listing
    const { searchParams } = new URL(request.url);

    const status = searchParams.get('status'); // 'checked_in' | 'checked_out' | 'all'
    const date = searchParams.get('date'); // 'today' | 'week' | specific date
    const search = searchParams.get('search'); // Visitor ID or name

    let query = supabaseAdmin
        .from('visitor_logs')
        .select('*')
        .eq('property_id', propertyId)
        .order('checkin_time', { ascending: false });

    // Apply status filter
    if (status && status !== 'all') {
        query = query.eq('status', status);
    }

    // Apply date filter
    if (date === 'today') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        query = query.gte('checkin_time', today.toISOString());
    } else if (date === 'week') {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        query = query.gte('checkin_time', weekAgo.toISOString());
    } else if (date) {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);
        query = query.gte('checkin_time', startDate.toISOString()).lte('checkin_time', endDate.toISOString());
    }

    // Apply search filter
    if (search) {
        query = query.or(`visitor_id.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data, error } = await query.limit(100);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate accurate stats for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [{ count: totalToday }, { count: checkedIn }, { count: checkedOut }] = await Promise.all([
        supabaseAdmin
            .from('visitor_logs')
            .select('*', { count: 'exact', head: true })
            .eq('property_id', propertyId)
            .gte('checkin_time', today.toISOString()),
        supabaseAdmin
            .from('visitor_logs')
            .select('*', { count: 'exact', head: true })
            .eq('property_id', propertyId)
            .eq('status', 'checked_in')
            .gte('checkin_time', today.toISOString()),
        supabaseAdmin
            .from('visitor_logs')
            .select('*', { count: 'exact', head: true })
            .eq('property_id', propertyId)
            .eq('status', 'checked_out')
            .gte('checkin_time', today.toISOString())
    ]);

    return NextResponse.json({
        visitors: data,
        stats: {
            total_today: totalToday || 0,
            checked_in: checkedIn || 0,
            checked_out: checkedOut || 0,
        },
    });
}

// PATCH: Check-out a visitor
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabaseAdmin = getAdminClient(); // Use admin client for checkout
    const body = await request.json();

    if (!body.visitor_id) {
        return NextResponse.json({ error: 'Visitor ID is required' }, { status: 400 });
    }

    // Find visitor
    const { data: visitor, error: findError } = await supabaseAdmin
        .from('visitor_logs')
        .select('*')
        .eq('visitor_id', body.visitor_id)
        .eq('property_id', propertyId)
        .single();

    if (findError || !visitor) {
        return NextResponse.json({ error: 'Visitor not found' }, { status: 404 });
    }

    if (visitor.status === 'checked_out') {
        return NextResponse.json({ error: 'Visitor already checked out' }, { status: 400 });
    }

    // Update checkout time
    const { data, error } = await supabaseAdmin
        .from('visitor_logs')
        .update({
            checkout_time: new Date().toISOString(),
            status: 'checked_out',
        })
        .eq('id', visitor.id)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
        success: true,
        message: `Goodbye ${visitor.name}! Your visit has been logged.`,
        visitor: data,
    });
}
