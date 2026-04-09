/**
 * Meeting room bookings API.
 * GET: List bookings | POST: Create booking | DELETE: Cancel booking.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { NotificationService } from '@/backend/services/NotificationService';

/**
 * GET /api/meeting-room-bookings
 * Fetch bookings (filtered by tenant or all for admin)
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
        const tenantId = searchParams.get('tenantId');
        const status = searchParams.get('status');

        let query = supabase
            .from('meeting_room_bookings')
            .select('*, meeting_room:meeting_rooms(name, photo_url, location), tenant:users!user_id(full_name, email)')
            .order('booking_date', { ascending: true })
            .order('start_time', { ascending: true });

        if (propertyId) query = query.eq('property_id', propertyId);
        if (tenantId) query = query.eq('user_id', tenantId);
        if (status) query = query.eq('status', status);

        const { data: bookings, error: fetchError } = await query;

        if (fetchError) {
            console.error('Error fetching bookings:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 });
        }

        return NextResponse.json({ bookings: bookings || [] });
    } catch (error) {
        console.error('Bookings GET error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/meeting-room-bookings
 * Create a new booking
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
            meetingRoomId,
            propertyId,
            date,
            startTime,
            endTime
        } = body;

        if (!meetingRoomId || !propertyId || !date || !startTime || !endTime) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 1. Validate future date
        const bookingDateTime = new Date(`${date}T${startTime}`);
        if (bookingDateTime < new Date()) {
            return NextResponse.json({ error: 'Cannot book for a past date/time' }, { status: 400 });
        }

        // 2. Calculate duration in hours
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        const durationHours = (endH * 60 + endM - startH * 60 - startM) / 60;

        // 3. Check credit balance
        const { data: credit } = await supabaseAdmin
            .from('meeting_room_credits')
            .select('id, remaining_hours')
            .eq('property_id', propertyId)
            .eq('user_id', user.id)
            .single();

        // Only enforce credits if a record exists (admins without a record can still book)
        if (credit && credit.remaining_hours < durationHours) {
            return NextResponse.json({
                error: `Insufficient meeting room credits. You need ${durationHours}h but only have ${credit.remaining_hours}h remaining.`
            }, { status: 402 });
        }

        // 4. Check for overlaps (double check)
        const { data: overlaps, error: overlapError } = await supabase
            .from('meeting_room_bookings')
            .select('id')
            .eq('meeting_room_id', meetingRoomId)
            .eq('booking_date', date)
            .eq('status', 'confirmed')
            .lt('start_time', endTime)
            .gt('end_time', startTime);

        if (overlapError) {
            console.error('Overlap check error:', overlapError);
            return NextResponse.json({ error: 'Failed to validate availability' }, { status: 500 });
        }

        if (overlaps && overlaps.length > 0) {
            return NextResponse.json({ error: 'Room is already booked for this time slot' }, { status: 409 });
        }

        // 3. Create booking
        const { data: booking, error: insertError } = await supabase
            .from('meeting_room_bookings')
            .insert({
                meeting_room_id: meetingRoomId,
                property_id: propertyId,
                user_id: user.id,
                booking_date: date,
                start_time: startTime,
                end_time: endTime,
                status: 'confirmed'
            })
            .select('*')
            .single();

        if (insertError) {
            console.error('Booking creation error:', insertError);
            return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
        }

        // Deduct credits if tenant has a credit record
        if (credit) {
            const newRemaining = Math.max(0, credit.remaining_hours - durationHours);
            await supabaseAdmin
                .from('meeting_room_credits')
                .update({ remaining_hours: newRemaining, updated_at: new Date().toISOString() })
                .eq('id', credit.id);

            await supabaseAdmin.from('meeting_room_credit_log').insert({
                credit_id: credit.id,
                user_id: user.id,
                action: 'deducted',
                hours_changed: -durationHours,
                hours_after: newRemaining,
                booking_id: booking.id,
                performed_by: user.id,
                notes: `Booking deduction: ${durationHours}h`,
            });
        }

        // Trigger notification asynchronously
        NotificationService.afterRoomBooked(booking.id).catch(err => {
            console.error('[Booking API] Notification trigger error:', err);
        });

        return NextResponse.json({ success: true, booking }, { status: 201 });
    } catch (error) {
        console.error('Booking POST error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
