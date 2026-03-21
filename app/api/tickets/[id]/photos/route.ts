import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

const BUCKET_NAME = 'ticket_photos';

/**
 * GET /api/tickets/[id]/photos
 * Returns the current before/after photo URLs for a ticket
 */
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
            .select('id, photo_before_url, photo_after_url')
            .eq('id', ticketId)
            .single();

        if (error || !ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        return NextResponse.json({
            before: ticket.photo_before_url ?? null,
            after: ticket.photo_after_url ?? null,
        });
    } catch (error) {
        console.error('Photo fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/tickets/[id]/photos
 * Upload before/after photo for a ticket
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
        const photoType = formData.get('type') as string;
        const takenAt = formData.get('takenAt') as string;

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!['before', 'after'].includes(photoType)) {
            return NextResponse.json({ error: 'Invalid photo type. Use "before" or "after"' }, { status: 400 });
        }

        if (!file.type.startsWith('image/')) {
            return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
        }

        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: 'Image must be under 10MB' }, { status: 400 });
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
            return NextResponse.json({ error: 'Not authorized to upload photos for this ticket' }, { status: 403 });
        }

        const fileExt = file.name.split('.').pop() || 'jpg';
        const fileName = `${ticketId}/${photoType}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(fileName, file, { cacheControl: '3600', upsert: true });

        if (uploadError) {
            console.error('Upload error:', uploadError);
            return NextResponse.json({ error: 'Failed to upload photo' }, { status: 500 });
        }

        const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);

        const updateField = photoType === 'before' ? 'photo_before_url' : 'photo_after_url';
        const { error: updateError } = await supabase
            .from('tickets')
            .update({ [updateField]: publicUrl, updated_at: new Date().toISOString() })
            .eq('id', ticketId);

        if (updateError) {
            console.error('Update error:', updateError);
            return NextResponse.json({ error: 'Failed to save photo URL' }, { status: 500 });
        }

        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: `photo_${photoType}_uploaded`,
            new_value: publicUrl,
            old_value: takenAt || new Date().toISOString(),
        });

        return NextResponse.json({ success: true, url: publicUrl, type: photoType });
    } catch (error) {
        console.error('Photo upload error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/tickets/[id]/photos?type=before|after
 * Remove a photo from storage and clear the URL on the ticket
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const { searchParams } = new URL(request.url);
        const photoType = searchParams.get('type');

        if (!photoType || !['before', 'after'].includes(photoType)) {
            return NextResponse.json({ error: 'Invalid photo type. Use ?type=before or ?type=after' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: ticket } = await supabase
            .from('tickets')
            .select('id, raised_by, assigned_to, photo_before_url, photo_after_url')
            .eq('id', ticketId)
            .single();

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        if (ticket.raised_by !== user.id && ticket.assigned_to !== user.id) {
            return NextResponse.json({ error: 'Not authorized to delete photos for this ticket' }, { status: 403 });
        }

        const urlField = photoType === 'before' ? 'photo_before_url' : 'photo_after_url';
        const existingUrl: string | null = ticket[urlField];

        // Remove from storage if we have a path
        if (existingUrl) {
            // Extract storage path from public URL
            // URL format: .../storage/v1/object/public/ticket_photos/<path>
            const marker = `/ticket_photos/`;
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
            return NextResponse.json({ error: 'Failed to clear photo URL' }, { status: 500 });
        }

        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: `photo_${photoType}_deleted`,
            old_value: existingUrl,
        });

        return NextResponse.json({ success: true, type: photoType });
    } catch (error) {
        console.error('Photo delete error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
