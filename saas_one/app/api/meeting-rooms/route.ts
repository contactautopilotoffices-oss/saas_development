/**
 * @fileoverview Meeting Room Listing and Creation API
 * @route GET  /api/meeting-rooms — List meeting rooms for a property
 * @route POST /api/meeting-rooms — Create a new meeting room (admin/staff only)
 * @description
 *   Lists meeting rooms for a given property, optionally filtered by status.
 *   POST creates a new room and enforces role-based permissions: only users with
 *   the `property_admin`, `staff`, or `mst` role on the property, or an
 *   `org_admin` at the parent organization, may create rooms.
 * @requires_auth Yes (both GET and POST)
 * @response 200 { rooms } — list of meeting rooms
 * @response 200 { success, room } — created room on POST
 * @response 400 Bad Request — missing required fields
 * @response 401 Unauthorized
 * @response 403 Forbidden — insufficient permissions to create
 * @response 500 Internal Server Error
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/meeting-rooms
 * Fetch meeting rooms for a property
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const propertyId = searchParams.get('propertyId') || searchParams.get('property_id');
        const status = searchParams.get('status');

        if (!propertyId) {
            return NextResponse.json({ error: 'Missing propertyId' }, { status: 400 });
        }

        let query = supabase
            .from('meeting_rooms')
            .select('*')
            .eq('property_id', propertyId)
            .order('name', { ascending: true });

        if (status) {
            query = query.eq('status', status);
        }

        const { data: rooms, error: fetchError } = await query;

        if (fetchError) {
            console.error('Error fetching meeting rooms:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch meeting rooms' }, { status: 500 });
        }

        return NextResponse.json({ rooms: rooms || [] });
    } catch (error) {
        console.error('Meeting Rooms GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/meeting-rooms
 * Create a new meeting room (Admin/Staff only)
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            name,
            photo_url,
            propertyId,
            location,
            capacity,
            size,
            amenities,
            status = 'active'
        } = body;

        if (!name || !photo_url || !propertyId || !capacity) {
            return NextResponse.json(
                { error: 'Missing required fields: name, photo_url, propertyId, capacity' },
                { status: 400 }
            );
        }

        // Check permissions (must be property_admin/staff for the property OR org_admin for the organization)
        const { data: membership, error: memError } = await supabase
            .from('property_memberships')
            .select('role')
            .eq('user_id', user.id)
            .eq('property_id', propertyId)
            .single();

        if (memError || !membership || !['property_admin', 'staff', 'mst'].includes(membership.role)) {
            // Check if user is an org_admin for this property's organization
            const { data: property, error: propError } = await supabase
                .from('properties')
                .select('organization_id')
                .eq('id', propertyId)
                .single();

            if (!propError && property) {
                const { data: orgMembership } = await supabase
                    .from('organization_memberships')
                    .select('role')
                    .eq('user_id', user.id)
                    .eq('organization_id', property.organization_id)
                    .single();

                if (orgMembership?.role === 'org_admin') {
                    // Org admin has access - proceed
                } else {
                    return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
                }
            } else {
                return NextResponse.json({ error: 'Forbidden: Insufficient permissions' }, { status: 403 });
            }
        }

        const { data: room, error: insertError } = await supabase
            .from('meeting_rooms')
            .insert({
                name,
                photo_url,
                property_id: propertyId,
                location,
                capacity,
                size,
                amenities: amenities || [],
                status,
                created_by: user.id
            })
            .select('*')
            .single();

        if (insertError) {
            console.error('Error creating meeting room:', insertError);
            return NextResponse.json({ error: 'Failed to create meeting room' }, { status: 500 });
        }

        return NextResponse.json({ success: true, room }, { status: 201 });
    } catch (error) {
        console.error('Meeting Rooms POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
