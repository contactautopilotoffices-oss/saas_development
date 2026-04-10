/**
 * Available room search API.
 * Searches for available meeting rooms at a property on a given date/time,
 * filtering by capacity and excluding conflicting bookings.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/meeting-rooms/available
 * Search for available meeting rooms based on filters
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const propertyId = searchParams.get('propertyId');
        const date = searchParams.get('date');
        const startTime = searchParams.get('startTime');
        const endTime = searchParams.get('endTime');
        const capacity = parseInt(searchParams.get('capacity') || '0', 10);

        if (!propertyId || !date) {
            return NextResponse.json({ error: 'Missing required filters: propertyId, date' }, { status: 400 });
        }

        // 1. Fetch all active rooms for the property with capacity >= selected capacity
        const { data: allRooms, error: roomsError } = await supabase
            .from('meeting_rooms')
            .select('*')
            .eq('property_id', propertyId)
            .eq('status', 'active')
            .gte('capacity', capacity);

        if (roomsError) {
            console.error('Error fetching rooms:', roomsError);
            return NextResponse.json({ error: 'Failed to fetch rooms' }, { status: 500 });
        }

        // 2. Fetch all confirmed bookings for that property and date
        const { data: bookings, error: bookingsError } = await supabase
            .from('meeting_room_bookings')
            .select('meeting_room_id, start_time, end_time')
            .eq('property_id', propertyId)
            .eq('booking_date', date)
            .eq('status', 'confirmed');

        if (bookingsError) {
            console.error('Error fetching bookings:', bookingsError);
            return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
        }

        // 3. Attach bookings to rooms
        const roomsWithBookings = allRooms.map(room => {
            const roomBookings = bookings.filter(b => b.meeting_room_id === room.id);
            return {
                ...room,
                bookings: roomBookings
            };
        });

        return NextResponse.json({ rooms: roomsWithBookings });
    } catch (error) {
        console.error('Available Rooms GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
