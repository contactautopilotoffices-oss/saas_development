-- Migration: SOP Videos Support
-- Description: Add video_url column to sop_completion_items and create sop-videos storage bucket

-- 1. Add video_url column to sop_completion_items
ALTER TABLE sop_completion_items ADD COLUMN IF NOT EXISTS video_url TEXT;

-- 2. Create the sop-videos bucket (public, 50MB file size limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('sop-videos', 'sop-videos', true, 52428800)
ON CONFLICT (id) DO NOTHING;

-- 3. Allow authenticated users to upload videos to 'sop-videos' bucket
DROP POLICY IF EXISTS "Allow authenticated uploads to sop-videos" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to sop-videos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'sop-videos');

-- 4. Allow public viewing of videos in 'sop-videos' bucket
DROP POLICY IF EXISTS "Allow public viewing of sop-videos" ON storage.objects;
CREATE POLICY "Allow public viewing of sop-videos" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'sop-videos');

-- 5. Allow owners to delete their own videos
DROP POLICY IF EXISTS "Allow owners to delete their own sop-videos" ON storage.objects;
CREATE POLICY "Allow owners to delete their own sop-videos" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'sop-videos' AND owner = auth.uid());
