-- Migration: SOP Photos Storage Bucket
-- Description: Ensure the sop-photos bucket exists and has correct RLS policies

-- 1. Create the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('sop-photos', 'sop-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 2. allow authenticated users to upload photos to 'sop-photos' bucket
DROP POLICY IF EXISTS "Allow authenticated uploads to sop-photos" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to sop-photos" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'sop-photos');

-- 3. allow public viewing of photos in 'sop-photos' bucket
DROP POLICY IF EXISTS "Allow public viewing of sop-photos" ON storage.objects;
CREATE POLICY "Allow public viewing of sop-photos" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'sop-photos');

-- 4. allow owners to delete their own photos
DROP POLICY IF EXISTS "Allow owners to delete their own sop-photos" ON storage.objects;
CREATE POLICY "Allow owners to delete their own sop-photos" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'sop-photos' AND owner = auth.uid());
