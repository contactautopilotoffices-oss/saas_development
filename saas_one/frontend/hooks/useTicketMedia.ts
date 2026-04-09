/**
 * useTicketMedia
 * Hook for ticket photo/video uploads via Supabase Storage.
 * Provides upload, delete, and URL retrieval functions.
 * @remarks Client hook using Supabase.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    getTicketPhotos,
    getTicketVideos,
    uploadTicketPhoto,
    uploadTicketVideo,
    deleteTicketPhoto,
    deleteTicketVideo,
    type MediaType,
    type PhotoUrls,
    type VideoUrls,
} from '@/frontend/lib/ticketMedia';

interface TicketMedia {
    photos: PhotoUrls;
    videos: VideoUrls;
}

interface UseTicketMediaReturn {
    /** Current photo URLs { before, after } */
    photos: PhotoUrls;
    /** Current video URLs { before, after } */
    videos: VideoUrls;
    /** True while fetching media on mount */
    loading: boolean;
    /** True while an upload/delete is in flight */
    uploading: boolean;
    /** Last error message, or null */
    error: string | null;
    /** Upload a photo (image file) for 'before' or 'after' */
    uploadPhoto: (file: File, type: MediaType) => Promise<void>;
    /** Upload a video file for 'before' or 'after' */
    uploadVideo: (file: File, type: MediaType) => Promise<void>;
    /** Delete the photo for 'before' or 'after' */
    removePhoto: (type: MediaType) => Promise<void>;
    /** Delete the video for 'before' or 'after' */
    removeVideo: (type: MediaType) => Promise<void>;
    /** Re-fetch both photos and videos from the server */
    refresh: () => Promise<void>;
}

const EMPTY_URLS = { before: null, after: null };

export function useTicketMedia(ticketId: string): UseTicketMediaReturn {
    const [photos, setPhotos] = useState<PhotoUrls>(EMPTY_URLS);
    const [videos, setVideos] = useState<VideoUrls>(EMPTY_URLS);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!ticketId) return;
        setLoading(true);
        setError(null);
        try {
            const [photoData, videoData] = await Promise.all([
                getTicketPhotos(ticketId),
                getTicketVideos(ticketId),
            ]);
            setPhotos(photoData);
            setVideos(videoData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load media');
        } finally {
            setLoading(false);
        }
    }, [ticketId]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const uploadPhoto = useCallback(async (file: File, type: MediaType) => {
        setUploading(true);
        setError(null);
        try {
            const result = await uploadTicketPhoto(ticketId, file, type);
            setPhotos(prev => ({ ...prev, [type]: result.url }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Photo upload failed');
            throw err;
        } finally {
            setUploading(false);
        }
    }, [ticketId]);

    const uploadVideo = useCallback(async (file: File, type: MediaType) => {
        setUploading(true);
        setError(null);
        try {
            const result = await uploadTicketVideo(ticketId, file, type);
            setVideos(prev => ({ ...prev, [type]: result.url }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Video upload failed');
            throw err;
        } finally {
            setUploading(false);
        }
    }, [ticketId]);

    const removePhoto = useCallback(async (type: MediaType) => {
        setUploading(true);
        setError(null);
        try {
            await deleteTicketPhoto(ticketId, type);
            setPhotos(prev => ({ ...prev, [type]: null }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Photo delete failed');
            throw err;
        } finally {
            setUploading(false);
        }
    }, [ticketId]);

    const removeVideo = useCallback(async (type: MediaType) => {
        setUploading(true);
        setError(null);
        try {
            await deleteTicketVideo(ticketId, type);
            setVideos(prev => ({ ...prev, [type]: null }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Video delete failed');
            throw err;
        } finally {
            setUploading(false);
        }
    }, [ticketId]);

    return {
        photos,
        videos,
        loading,
        uploading,
        error,
        uploadPhoto,
        uploadVideo,
        removePhoto,
        removeVideo,
        refresh,
    };
}
