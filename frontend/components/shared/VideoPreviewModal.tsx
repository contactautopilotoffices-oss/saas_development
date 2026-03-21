'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Loader2, AlertCircle, Play } from 'lucide-react';

interface VideoPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    videoUrl: string | null;
    title?: string;
}

const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({ isOpen, onClose, videoUrl, title }) => {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const blobRef = useRef<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    // Fetch video as blob when modal opens — avoids CORS/range-request issues with Supabase URLs
    useEffect(() => {
        if (!isOpen || !videoUrl) return;

        let cancelled = false;
        setIsLoading(true);
        setLoadError(false);
        setBlobUrl(null);

        (async () => {
            try {
                const res = await fetch(videoUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                if (cancelled) return;
                const url = URL.createObjectURL(blob);
                blobRef.current = url;
                setBlobUrl(url);
            } catch {
                if (!cancelled) setLoadError(true);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [isOpen, videoUrl]);

    // Revoke blob URL when modal closes
    useEffect(() => {
        if (!isOpen && blobRef.current) {
            URL.revokeObjectURL(blobRef.current);
            blobRef.current = null;
            setBlobUrl(null);
        }
    }, [isOpen]);

    const handleDownload = async () => {
        if (!videoUrl) return;
        setIsDownloading(true);
        try {
            const res = await fetch(videoUrl);
            const blob = await res.blob();
            const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `checklist-video-${Date.now()}.${ext}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch {
            if (videoUrl) window.open(videoUrl, '_blank');
        } finally {
            setIsDownloading(false);
        }
    };

    if (!isOpen || !videoUrl) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />

                {/* Card */}
                <motion.div
                    initial={{ scale: 0.92, opacity: 0, y: 16 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.92, opacity: 0, y: 16 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    className="relative w-full max-w-2xl flex flex-col rounded-2xl overflow-hidden shadow-2xl bg-[#0f0f0f]"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-[#1a1a1a] border-b border-white/10">
                        <div>
                            <p className="text-white font-black text-sm tracking-tight">
                                {title || 'Video Proof'}
                            </p>
                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">
                                Checklist Video Proof
                            </p>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={handleDownload}
                                disabled={isDownloading || isLoading}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg text-xs font-bold uppercase tracking-widest transition-all disabled:opacity-50"
                            >
                                {isDownloading
                                    ? <Loader2 size={13} className="animate-spin" />
                                    : <Download size={13} />
                                }
                                {isDownloading ? 'Saving...' : 'Download'}
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-all ml-1"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Video area */}
                    <div className="bg-black w-full aspect-video flex items-center justify-center relative">
                        {isLoading && (
                            <div className="flex flex-col items-center gap-3 text-white/50">
                                <Loader2 size={32} className="animate-spin" />
                                <span className="text-xs font-bold uppercase tracking-widest">Loading video...</span>
                            </div>
                        )}

                        {loadError && (
                            <div className="flex flex-col items-center gap-3 text-white/50">
                                <AlertCircle size={32} />
                                <span className="text-xs font-bold uppercase tracking-widest">Failed to load video</span>
                                <button
                                    onClick={() => window.open(videoUrl, '_blank')}
                                    className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-xs font-bold uppercase tracking-widest transition-all flex items-center gap-2"
                                >
                                    <Play size={12} /> Open in new tab
                                </button>
                            </div>
                        )}

                        {blobUrl && !isLoading && !loadError && (
                            <video
                                ref={videoRef}
                                key={blobUrl}
                                src={blobUrl}
                                controls
                                playsInline
                                preload="auto"
                                className="w-full h-full object-contain"
                            />
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default VideoPreviewModal;
