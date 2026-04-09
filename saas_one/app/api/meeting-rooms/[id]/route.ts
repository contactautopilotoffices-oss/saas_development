/**
 * Single meeting room CRUD API.
 * Updates and soft-deletes (deactivates) an individual meeting room.
 * PATCH: Update room details | DELETE: Soft delete room.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * PATCH /api/meeting-rooms/[id]
 * Update meeting room details
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient();
        const { id } = await params;
        const body = await request.json();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: room, error: fetchError } = await supabase
            .from('meeting_rooms')
            .select('property_id')
            .eq('id', id)
            .single();

        if (fetchError || !room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

        // Permission check
        const { data: membership } = await supabase
            .from('property_memberships')
            .select('role')
            .eq('user_id', user.id)
            .eq('property_id', room.property_id)
            .single();

        if (!membership || !['property_admin', 'staff', 'mst', 'admin', 'super_admin'].includes(membership.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const {
            name,
            photo_url,
            location,
            capacity,
            size,
            amenities,
            status,
            propertyId
        } = body;

        const updateData: any = {};
        if (name !== undefined) updateData.name = name;
        if (photo_url !== undefined) updateData.photo_url = photo_url;
        if (location !== undefined) updateData.location = location;
        if (capacity !== undefined) updateData.capacity = parseInt(capacity.toString());
        if (size !== undefined) updateData.size = size ? parseInt(size.toString()) : null;
        if (amenities !== undefined) updateData.amenities = amenities;
        if (status !== undefined) updateData.status = status;
        if (propertyId !== undefined) updateData.property_id = propertyId;

        const { data: updated, error: updateError } = await supabase
            .from('meeting_rooms')
            .update(updateData)
            .eq('id', id)
            .select('*')
            .single();

        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
        return NextResponse.json({ success: true, room: updated });
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/meeting-rooms/[id]
 * Soft delete by setting status to inactive
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient();
        const { id } = await params;

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: room, error: fetchError } = await supabase
            .from('meeting_rooms')
            .select('property_id')
            .eq('id', id)
            .single();

        if (fetchError || !room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

        // Permission check
        const { data: membership } = await supabase
            .from('property_memberships')
            .select('role')
            .eq('user_id', user.id)
            .eq('property_id', room.property_id)
            .single();

        if (!membership || !['property_admin', 'staff', 'mst', 'admin', 'super_admin'].includes(membership.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { error: deleteError } = await supabase
            .from('meeting_rooms')
            .update({ status: 'inactive' })
            .eq('id', id);

        if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
