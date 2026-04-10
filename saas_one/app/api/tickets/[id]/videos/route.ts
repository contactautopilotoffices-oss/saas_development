/**
 * GET /api/tickets/[id]/videos
 * Returns the current before/after video URLs for a ticket.
 *
 * POST /api/tickets/[id]/videos
 * Upload before/after video for a ticket. Stores in Supabase Storage (ticket_videos bucket).
 * Body (FormData): file, type ('before'|'after'), takenAt?
 * Validates: video only, max 50MB. Only ticket creator or assignee can upload.
 * Logs video upload to ticket_activity_log.
 *
 * DELETE /api/tickets/[id]/videos?type=before|after
 * Remove a video from storage and clear the URL on the ticket.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

const BUCKET_NAME = 'ticket_videos';
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: ticket, error } = await supabase
            .from('tickets')
            .select('id, video_before_url, video_after_url')
            .eq('id', ticketId)
            .single();

        if (error || !ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        return NextResponse.json({
            before: ticket.video_before_url ?? null,
            after: ticket.video_after_url ?? null,
        });
    } catch (error) {
        console.error('Video fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/tickets/[id]/videos
 * Upload before/after video for a ticket
 * Body (multipart): file, type ('before' | 'after')
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File;
        const videoType = formData.get('type') as string;
        const takenAt = formData.get('takenAt') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!['before', 'after'].includes(videoType)) {
            return NextResponse.json({ error: 'Invalid video type. Use "before" or "after"' }, { status: 400 });
        }

        if (!file.type.startsWith('video/')) {
            return NextResponse.json({ error: 'File must be a video' }, { status: 400 });
        }

        if (file.size > 50 * 1024 * 1024) {
            return NextResponse.json({ error: 'Video must be under 50MB' }, { status: 400 });
        }

        const { data: ticket } = await supabase
            .from('tickets')
            .select('id, property_id, raised_by, assigned_to')
            .eq('id', ticketId)
            .single();

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        if (ticket.raised_by !== user.id && ticket.assigned_to !== user.id) {
            return NextResponse.json({ error: 'Not authorized to upload videos for this ticket' }, { status: 403 });
        }

        const fileExt = file.name.split('.').pop() || 'mp4';
        const fileName = `${ticketId}/${videoType}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, file, { cacheControl: '3600', upsert: true });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return NextResponse.json({ error: 'Failed to upload video' }, { status: 500 });
        }

        const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);

        const updateField = videoType === 'before' ? 'video_before_url' : 'video_after_url';
        const { error: updateError } = await supabase
            .from('tickets')
            .update({ [updateField]: publicUrl, updated_at: new Date().toISOString() })
            .eq('id', ticketId);

        if (updateError) {
            console.error('Update error:', updateError);
            return NextResponse.json({ error: 'Failed to save video URL' }, { status: 500 });
        }

        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: `video_${videoType}_uploaded`,
            new_value: publicUrl,
            old_value: takenAt || new Date().toISOString(),
        });

        return NextResponse.json({ success: true, url: publicUrl, type: videoType });
    } catch (error) {
        console.error('Video upload error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/tickets/[id]/videos?type=before|after
 * Remove a video from storage and clear the URL on the ticket
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const { searchParams } = new URL(request.url);
        const videoType = searchParams.get('type');

        if (!videoType || !['before', 'after'].includes(videoType)) {
            return NextResponse.json({ error: 'Invalid video type. Use ?type=before or ?type=after' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: ticket } = await supabase
            .from('tickets')
            .select('id, raised_by, assigned_to, video_before_url, video_after_url')
            .eq('id', ticketId)
            .single();

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        if (ticket.raised_by !== user.id && ticket.assigned_to !== user.id) {
            return NextResponse.json({ error: 'Not authorized to delete videos for this ticket' }, { status: 403 });
        }

        const urlField = videoType === 'before' ? 'video_before_url' : 'video_after_url';
        const existingUrl: string | null = ticket[urlField];

        // Remove from storage if we have a URL
        if (existingUrl) {
            // Extract storage path: .../storage/v1/object/public/ticket_videos/<path>
            const marker = `/ticket_videos/`;
            const pathStart = existingUrl.indexOf(marker);
            if (pathStart !== -1) {
                const storagePath = existingUrl.slice(pathStart + marker.length);
                const { error: removeError } = await supabase.storage
                    .from(BUCKET_NAME)
                    .remove([storagePath]);
                if (removeError) {
                    console.error('Storage remove error:', removeError);
                    // Don't fail — still clear the DB field
                }
            }
        }

        const { error: updateError } = await supabase
            .from('tickets')
            .update({ [urlField]: null, updated_at: new Date().toISOString() })
            .eq('id', ticketId);

        if (updateError) {
            return NextResponse.json({ error: 'Failed to clear video URL' }, { status: 500 });
        }

        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: `video_${videoType}_deleted`,
            old_value: existingUrl,
        });

        return NextResponse.json({ success: true, type: videoType });
    } catch (error) {
        console.error('Video delete error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
