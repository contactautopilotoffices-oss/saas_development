/**
 * Meeting room photo upload API.
 * Uploads photos for meeting rooms to Supabase Storage.
 * POST: Upload photo.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

const BUCKET_NAME = 'meeting-rooms';

/**
 * POST /api/meeting-rooms/photos
 * General purpose photo upload for meeting rooms
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        // Generate unique filename
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;

        // Upload to Supabase Storage (Assumes bucket 'meeting_room_photos' exists)
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, file, {
                cacheControl: '3600',
                upsert: true,
            });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            // If bucket doesn't exist or RLS fails
            return NextResponse.json({ error: `Failed to upload photo. Ensure "${BUCKET_NAME}" bucket exists and has correct RLS policies.` }, { status: 500 });
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from(BUCKET_NAME)
            .getPublicUrl(fileName);

        return NextResponse.json({
            success: true,
            url: publicUrl
        });
    } catch (error) {
        console.error('Photo upload error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
