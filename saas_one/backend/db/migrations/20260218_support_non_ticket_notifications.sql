-- Migration: Support Non-Ticket Notifications
-- Created: 2026-02-18

-- 1. Make ticket_id nullable (for room bookings, etc.)
ALTER TABLE notifications ALTER COLUMN ticket_id DROP NOT NULL;

-- 2. Add booking_id column
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES meeting_room_bookings(id) ON DELETE CASCADE;

-- 3. Add index for performance
CREATE INDEX IF NOT EXISTS idx_notifications_booking ON notifications(booking_id);
