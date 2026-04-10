-- Create meeting_rooms table
CREATE TABLE IF NOT EXISTS meeting_rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    photo_url TEXT NOT NULL,
    location TEXT NOT NULL,
    capacity INT4 NOT NULL,
    size INT4, -- sqft
    amenities JSONB DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'active', -- active, inactive
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create meeting_room_bookings table
CREATE TABLE IF NOT EXISTS meeting_room_bookings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_room_id UUID NOT NULL REFERENCES meeting_rooms(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status TEXT NOT NULL DEFAULT 'confirmed', -- confirmed, cancelled
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraint to prevent overlapping bookings for the same room
    CONSTRAINT no_overlapping_bookings EXCLUDE USING gist (
        meeting_room_id WITH =,
        booking_date WITH =,
        tsrange(
            (booking_date + start_time)::timestamp,
            (booking_date + end_time)::timestamp
        ) WITH &&
    ) WHERE (status = 'confirmed')
);

-- Note: The above exclusion constraint requires the btree_gist extension.
-- CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Enable RLS
ALTER TABLE meeting_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_room_bookings ENABLE ROW LEVEL SECURITY;

-- Basic Policies (Update these based on your specific role requirements)
-- For meeting_rooms:
CREATE POLICY "Enable read access for all authenticated users" ON meeting_rooms
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable CRUD for admins and staff" ON meeting_rooms
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_memberships
            WHERE user_id = auth.uid()
            AND property_id = meeting_rooms.property_id
            AND role IN ('admin', 'staff', 'super_admin')
        )
    );

-- For meeting_room_bookings:
CREATE POLICY "Enable read for own bookings or admins" ON meeting_room_bookings
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM user_memberships
            WHERE user_id = auth.uid()
            AND property_id = meeting_room_bookings.property_id
            AND role IN ('admin', 'staff', 'super_admin')
        )
    );

CREATE POLICY "Enable insert for tenants" ON meeting_room_bookings
    FOR INSERT WITH CHECK (user_id = auth.uid());
