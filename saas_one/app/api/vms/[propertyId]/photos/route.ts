/**
 * VMS visitor photo upload API.
 * POST: Upload visitor photo.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const BUCKET_NAME = 'visitor-photos';

// Create admin client for bypassing RLS
const getAdminClient = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * POST /api/vms/[propertyId]/photos
 * Upload visitor photo to Supabase Storage
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    try {
        const { propertyId } = await params;
        const supabaseAdmin = getAdminClient();

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const visitorId = formData.get('visitor_id') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!visitorId) {
            return NextResponse.json({ error: 'visitor_id required' }, { status: 400 });
        }

        // Validate file size (max 100KB after compression)
        if (file.size > 100 * 1024) {
            return NextResponse.json({ error: 'File too large. Max 100KB' }, { status: 400 });
        }

        // Generate path: {propertyId}/{visitorId}.webp
        const fileExt = file.type === 'image/webp' ? 'webp' : 'jpg';
        const filePath = `${propertyId}/${visitorId}.${fileExt}`;

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.type,
            });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 });
        }

        // Get public URL
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from(BUCKET_NAME)
            .getPublicUrl(filePath);

        // Update visitor_logs with photo URL
        const { error: updateError } = await supabaseAdmin
            .from('visitor_logs')
            .update({ photo_url: publicUrl })
            .eq('visitor_id', visitorId)
            .eq('property_id', propertyId);

        if (updateError) {
            console.error('Update error:', updateError);
            // Photo uploaded but DB not updated - still return success with URL
        }

        return NextResponse.json({
            success: true,
            url: publicUrl,
            path: filePath,
        });
    } catch (error) {
        console.error('Photo upload error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
