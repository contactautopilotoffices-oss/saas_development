-- =========================================================
-- FIX: TICKET PHOTOS, CLOSURE COLUMNS, AND NOTIFICATIONS
-- =========================================================

-- 1. Ensure all required columns exist on the tickets table
DO $$ 
BEGIN 
    -- Photo URLs
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='photo_before_url') THEN
        ALTER TABLE tickets ADD COLUMN photo_before_url text;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='photo_after_url') THEN
        ALTER TABLE tickets ADD COLUMN photo_after_url text;
    END IF;

    -- Timestamp Columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='work_started_at') THEN
        ALTER TABLE tickets ADD COLUMN work_started_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='resolved_at') THEN
        ALTER TABLE tickets ADD COLUMN resolved_at timestamptz;
    END IF;

    -- Created_by vs Raised_by Fix
    -- Many policies refer to 'created_by' but the table used 'raised_by'
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='created_by') THEN
        ALTER TABLE tickets ADD COLUMN created_by uuid REFERENCES users(id);
        -- Sync existing data
        UPDATE tickets SET created_by = raised_by WHERE created_by IS NULL;
    END IF;
END $$;

-- 2. Create Notifications Table for Tenant Alerts
CREATE TABLE IF NOT EXISTS public.notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title text NOT NULL,
    message text NOT NULL,
    type text DEFAULT 'info', -- 'info', 'success', 'warning', 'error'
    link text, -- Optional link to click
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" 
ON public.notifications FOR SELECT 
USING (auth.uid() = user_id);

-- 3. Fix Storage Permissions (Bucket and Policies)
-- Run this to ensure the bucket exists and is public for viewing
-- (Note: can also be done via Supabase Dashboard)

INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket_photos', 'ticket_photos', true)
ON CONFLICT (id) DO NOTHING;

-- Policy to allow authenticated users to upload
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
CREATE POLICY "Allow authenticated uploads" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'ticket_photos');

-- Policy to allow public viewing
DROP POLICY IF EXISTS "Allow public viewing" ON storage.objects;
CREATE POLICY "Allow public viewing" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'ticket_photos');
