/**
 * ticketMedia.ts
 * Typed API call functions for ticket photos and videos.
 * Use these in components/hooks — never call fetch directly.
 */

export type MediaType = 'before' | 'after';

export interface PhotoUrls {
    before: string | null;
    after: string | null;
}

export interface VideoUrls {
    before: string | null;
    after: string | null;
}

export interface UploadResult {
    success: boolean;
    url: string;
    type: MediaType;
}

// ─────────────────────────────────────────────────────────────
// PHOTOS
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/tickets/[id]/photos
 * Returns { before, after } photo URLs stored on the ticket.
 */
export async function getTicketPhotos(ticketId: string): Promise<PhotoUrls> {
    const res = await fetch(`/api/tickets/${ticketId}/photos`);
    if (!res.ok) {
        const text = await res.text();
        let err;
        try { err = JSON.parse(text); } catch { throw new Error(`HTTP Error ${res.status}`); }
        throw new Error(err?.error || 'Failed to fetch photos');
    }
    return res.json();
}

/**
 * POST /api/tickets/[id]/photos
 * Uploads an image file to storage and saves the public URL on the ticket.
 * @param ticketId  - ticket UUID
 * @param file      - image File object (should be image/*)
 * @param type      - 'before' | 'after'
 */
export async function uploadTicketPhoto(
    ticketId: string,
    file: File,
    type: MediaType
): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const res = await fetch(`/api/tickets/${ticketId}/photos`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        const text = await res.text();
        let err;
        try { err = JSON.parse(text); } catch { throw new Error(`HTTP Error ${res.status}`); }
        throw new Error(err?.error || 'Failed to upload photo');
    }
    return res.json();
}

/**
 * DELETE /api/tickets/[id]/photos?type=before|after
 * Removes the photo from storage and clears the URL on the ticket.
 */
export async function deleteTicketPhoto(
    ticketId: string,
    type: MediaType
): Promise<void> {
    const res = await fetch(`/api/tickets/${ticketId}/photos?type=${type}`, {
        method: 'DELETE',
    });

    if (!res.ok) {
        const text = await res.text();
        let err;
        try { err = JSON.parse(text); } catch { throw new Error(`HTTP Error ${res.status}`); }
        throw new Error(err?.error || 'Failed to delete photo');
    }
}

// ─────────────────────────────────────────────────────────────
// VIDEOS
// ─────────────────────────────────────────────────────────────

/**
 * GET /api/tickets/[id]/videos
 * Returns { before, after } video URLs stored on the ticket.
 */
export async function getTicketVideos(ticketId: string): Promise<VideoUrls> {
    const res = await fetch(`/api/tickets/${ticketId}/videos`);
    if (!res.ok) {
        const text = await res.text();
        let err;
        try { err = JSON.parse(text); } catch { throw new Error(`HTTP Error ${res.status}`); }
        throw new Error(err?.error || 'Failed to fetch videos');
    }
    return res.json();
}

/**
 * POST /api/tickets/[id]/videos
 * Uploads a video file to the ticket_videos storage bucket
 * and saves the public URL in video_before_url / video_after_url on the ticket.
 * @param ticketId  - ticket UUID
 * @param file      - video File object (must be video/*)
 * @param type      - 'before' | 'after'
 */
export async function uploadTicketVideo(
    ticketId: string,
    file: File,
    type: MediaType
): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);

    const res = await fetch(`/api/tickets/${ticketId}/videos`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        const text = await res.text();
        let err;
        try { err = JSON.parse(text); } catch { throw new Error(`HTTP Error ${res.status}`); }
        throw new Error(err?.error || 'Failed to upload video');
    }
    return res.json();
}

/**
 * DELETE /api/tickets/[id]/videos?type=before|after
 * Removes the video from storage and clears the URL on the ticket.
 */
export async function deleteTicketVideo(
    ticketId: string,
    type: MediaType
): Promise<void> {
    const res = await fetch(`/api/tickets/${ticketId}/videos?type=${type}`, {
        method: 'DELETE',
    });

    if (!res.ok) {
        const text = await res.text();
        let err;
        try { err = JSON.parse(text); } catch { throw new Error(`HTTP Error ${res.status}`); }
        throw new Error(err?.error || 'Failed to delete video');
    }
}
