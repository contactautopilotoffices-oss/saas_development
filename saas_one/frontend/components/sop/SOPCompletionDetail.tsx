/**
 * SOPCompletionDetail
 * Full-screen detail view for a single SOP completion session.
 * Step-by-step checklist, photo/video capture, pause/resume, satisfaction rating.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/frontend/utils/supabase/client';
import Skeleton from '@/frontend/components/ui/Skeleton';
import { motion } from 'framer-motion';
import { ChevronLeft, User, Calendar, CheckCircle2, Circle, Camera, Clock, Eye, Video, Play, ThumbsDown, Minus, ThumbsUp, Paperclip, Loader2 } from 'lucide-react';
import ImagePreviewModal from '@/frontend/components/shared/ImagePreviewModal';
import VideoPreviewModal from '@/frontend/components/shared/VideoPreviewModal';
import CameraCaptureModal from '@/frontend/components/shared/CameraCaptureModal';
import VideoCaptureModal from '@/frontend/components/shared/VideoCaptureModal';
import { compressImage } from '@/frontend/utils/image-compression';
import { compressVideo } from '@/frontend/utils/video-compression';
import { Toast } from '@/frontend/components/ui/Toast';


interface SOPCompletionDetailProps {
    completionId: string;
    propertyId: string;
    isAdmin?: boolean;
    onBack: () => void;
    onResume?: () => void;
}

// Satisfaction rating config
const RATINGS = [
    { value: 1, label: 'Needs Work', color: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200', activeBg: 'bg-rose-500', icon: ThumbsDown },
    { value: 2, label: 'Acceptable', color: 'text-amber-500', bg: 'bg-amber-50', border: 'border-amber-200', activeBg: 'bg-amber-500', icon: Minus },
    { value: 3, label: 'Excellent',  color: 'text-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200', activeBg: 'bg-emerald-500', icon: ThumbsUp },
] as const;

const SOPCompletionDetail: React.FC<SOPCompletionDetailProps> = ({ completionId, propertyId, isAdmin, onBack, onResume }) => {
    const [completion, setCompletion] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
    const [ratingLoading, setRatingLoading] = useState<string | null>(null);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [activeCameraItemId, setActiveCameraItemId] = useState<string | null>(null);
    const [showVideoModal, setShowVideoModal] = useState(false);
    const [activeVideoItemId, setActiveVideoItemId] = useState<string | null>(null);
    const [uploadLoading, setUploadLoading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const supabase = React.useMemo(() => createClient(), []);


    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            setCurrentUserId(data.user?.id ?? null);
        });
    }, [supabase]);

    useEffect(() => {
        const fetchDetail = async () => {
            try {
                const res = await fetch(`/api/properties/${propertyId}/sop/completions/${completionId}`);
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || 'Failed to load completion');

                const data = json.completion;

                // Sort items by order_index
                if (data.items) {
                    data.items.sort((a: any, b: any) =>
                        (a.checklist_item?.order_index || 0) - (b.checklist_item?.order_index || 0)
                    );
                }

                setCompletion(data);
            } catch (err: any) {
                console.error('Error loading completion detail:', err?.message || err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchDetail();
    }, [completionId, propertyId]);

    const handleRate = useCallback(async (itemId: string, rating: number) => {
        if (!currentUserId) return;
        setRatingLoading(itemId);
        try {
            const res = await fetch(
                `/api/properties/${propertyId}/sop/completions/${completionId}/rate`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ completionItemId: itemId, rating }),
                }
            );
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || 'Failed to save rating');
            }

            // Optimistic update in local state
            setCompletion((prev: any) => ({
                ...prev,
                items: prev.items.map((it: any) =>
                    it.id === itemId
                        ? { ...it, satisfaction_rating: rating, satisfaction_by: currentUserId, satisfaction_at: new Date().toISOString() }
                        : it
                ),
            }));
        } catch (err: any) {
            console.error('Error saving satisfaction rating:', err?.message || err);
        } finally {
            setRatingLoading(null);
        }
    }, [currentUserId, completionId, propertyId]);

    // Bakes file's original capture timestamp as a watermark onto the bottom-right of the image
    const stampTimestamp = (file: File): Promise<File> => new Promise((resolve) => {
        const originalLastModified = file.lastModified; // Capture before any async work
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            // Use the file's own lastModified time (= actual capture time)
            const capturedAt = new Date(originalLastModified);
            const ts = capturedAt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(',', '');
            const fontSize = Math.max(14, Math.round(canvas.width * 0.028));
            ctx.font = `bold ${fontSize}px monospace`;
            const pad = Math.round(fontSize * 0.5);
            const tw = ctx.measureText(ts).width;
            const x = canvas.width - tw - pad * 2;
            const y = canvas.height - fontSize - pad * 2;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath();
            ctx.roundRect(x, y, tw + pad * 2, fontSize + pad * 2, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(ts, x + pad, y + fontSize + pad * 0.6);
            canvas.toBlob(blob => {
                // Preserve original lastModified so the capture time is not lost
                resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp', lastModified: originalLastModified }) : file);
            }, 'image/webp', 0.88);
        };
        img.src = URL.createObjectURL(file);
    });

    const handlePhotoCapture = useCallback(async (file: File, itemId?: string) => {
        const targetItemId = itemId || activeCameraItemId;
        if (!targetItemId) return;
        setUploadLoading(targetItemId);
        try {
            // Capture actual photo time BEFORE any async processing
            const photoTakenAt = new Date(file.lastModified).toISOString();
            const stamped = await stampTimestamp(file);
            const compressed = await compressImage(stamped);
            const formData = new FormData();
            formData.append('file', compressed);
            formData.append('completionId', completionId);
            formData.append('completionItemId', targetItemId);
            const res = await fetch(`/api/properties/${propertyId}/sop/photos`, { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            // Store photo_url + actual capture time in checked_at
            await supabase.from('sop_completion_items').update({ photo_url: data.url, checked_at: photoTakenAt }).eq('id', targetItemId);
            setCompletion((prev: any) => ({
                ...prev,
                items: prev.items.map((it: any) => it.id === targetItemId ? { ...it, photo_url: data.url, checked_at: photoTakenAt } : it),
            }));
            setShowCameraModal(false);
            setActiveCameraItemId(null);
            setToast({ message: 'Photo updated successfully', type: 'success' });
        } catch (err: any) {
            setToast({ message: err.message || 'Failed to upload photo', type: 'error' });
        } finally {
            setUploadLoading(null);
        }
    }, [activeCameraItemId, completionId, propertyId, supabase]);

    const handleVideoCapture = useCallback(async (file: File) => {
        if (!activeVideoItemId) return;
        setUploadLoading(activeVideoItemId);
        try {
            const compressed = await compressVideo(file);
            const formData = new FormData();
            formData.append('file', compressed);
            formData.append('completionId', completionId);
            formData.append('completionItemId', activeVideoItemId);
            const res = await fetch(`/api/properties/${propertyId}/sop/videos`, { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Upload failed');
            // Use the file's own lastModified time (= actual capture time)
            const videoAt = new Date(file.lastModified).toISOString();
            await supabase.from('sop_completion_items').update({ video_url: data.url, checked_at: videoAt }).eq('id', activeVideoItemId);
            setCompletion((prev: any) => ({
                ...prev,
                items: prev.items.map((it: any) => it.id === activeVideoItemId ? { ...it, video_url: data.url, checked_at: videoAt } : it),
            }));
            setShowVideoModal(false);
            setActiveVideoItemId(null);
            setToast({ message: 'Video updated successfully', type: 'success' });
        } catch (err: any) {
            setToast({ message: err.message || 'Failed to upload video', type: 'error' });
        } finally {
            setUploadLoading(null);
        }
    }, [activeVideoItemId, completionId, propertyId, supabase]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>, itemId: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.type.startsWith('video/')) {
            // Handle video upload directly
            setActiveVideoItemId(itemId);
            setUploadLoading(itemId);
            const videoAt = new Date(file.lastModified).toISOString();
            compressVideo(file).then(compressed => {
                const formData = new FormData();
                formData.append('file', compressed);
                formData.append('completionId', completionId);
                formData.append('completionItemId', itemId);
                return fetch(`/api/properties/${propertyId}/sop/videos`, { method: 'POST', body: formData });
            }).then(res => res.json()).then(async data => {
                await supabase.from('sop_completion_items').update({ video_url: data.url, checked_at: videoAt }).eq('id', itemId);
                setCompletion((prev: any) => ({
                    ...prev,
                    items: prev.items.map((it: any) => it.id === itemId ? { ...it, video_url: data.url, checked_at: videoAt } : it),
                }));
                setToast({ message: 'Video updated successfully', type: 'success' });
            }).catch(err => {
                setToast({ message: err.message || 'Failed to upload video', type: 'error' });
            }).finally(() => {
                setUploadLoading(null);
                setActiveVideoItemId(null);
            });
        } else {
            // Handle image — pass original file to handlePhotoCapture (it stamps + compresses + uploads)
            handlePhotoCapture(file, itemId);
        }
    }, [handlePhotoCapture, completionId, propertyId, supabase]);

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-32 rounded-[2rem]" />
                <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-[2rem]" />)}
                </div>
            </div>
        );
    }

    if (!completion) return null;

    // If completion_items are missing (e.g. initialized before template had steps),
    // fall back to template items shown as uncompleted so the audit breakdown isn't blank.
    const effectiveItems: any[] = completion.items?.length > 0
        ? completion.items
        : (completion.template?.items || []).map((ti: any) => ({
            id: ti.id,
            checklist_item_id: ti.id,
            checklist_item: ti,
            is_checked: false,
            value: null,
            photo_url: null,
            video_url: null,
            checked_at: null,
            checked_by_user: null,
            satisfaction_rating: null,
        }));

    const checkedCount = effectiveItems.filter((i: any) => i.is_checked || i.value).length;
    const totalCount = effectiveItems.length;
    const progress = totalCount > 0 ? (checkedCount / totalCount) * 100 : 0;

    return (
        <div className="space-y-3 md:space-y-4 pb-4 md:pb-6">
            {/* Header / Back */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <button
                        onClick={onBack}
                        className="flex items-center gap-1.5 text-primary font-black text-[8px] md:text-[9px] uppercase tracking-widest mb-1.5 hover:gap-2.5 transition-all"
                    >
                        <ChevronLeft size={11} />
                        Back
                    </button>
                    <h2 className="text-base md:text-xl font-black text-slate-900 tracking-tight leading-tight truncate">
                        {completion.template?.title}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                        <div className="flex items-center gap-1 text-slate-400">
                            <Calendar size={10} />
                            <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest">
                                {new Date(completion.completion_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400">
                            <User size={10} />
                            <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest truncate max-w-[100px] md:max-w-[150px]">
                                {completion.user?.full_name || 'System User'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className={`px-2.5 md:px-4 py-1 md:py-1.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-widest flex-shrink-0 ${completion.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                    : 'bg-amber-50 text-amber-600 border border-amber-100'
                    }`}>
                    {completion.status.replace('_', ' ')}
                </div>
            </div>

            {/* Progress Visualization */}
            <div className="bg-slate-50 p-2.5 md:p-3 rounded-lg md:rounded-xl border border-slate-100">
                <div className="flex justify-between items-end mb-1.5 md:mb-2">
                    <div>
                        <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Audit Score</p>
                        <p className="text-base md:text-lg font-black text-slate-900 leading-none">{Math.round(progress)}%</p>
                    </div>
                    <span className="text-[8px] md:text-[9px] font-black text-primary bg-primary/10 px-2 md:px-3 py-0.5 md:py-1 rounded-full uppercase tracking-widest">
                        {checkedCount}/{totalCount} pts
                    </span>
                </div>
                <div className="w-full bg-slate-200/50 rounded-full h-1.5 md:h-2 overflow-hidden">
                    <motion.div
                        className={`h-full shadow-[0_0_12px_rgba(var(--primary-rgb),0.3)] ${progress === 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                    />
                </div>
            </div>

            {/* Detailed Points List */}
            <div className="space-y-2 md:space-y-3">
                <h3 className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] px-1">Audit Breakdown</h3>
                {effectiveItems.map((item: any, index: number) => {
                    const isCompleted = item.is_checked || item.value;
                    const templateItem = item.checklist_item;
                    const currentRating = item.satisfaction_rating as 1 | 2 | 3 | null;

                    return (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.05 }}
                            className={`bg-white border rounded-lg md:rounded-xl p-2.5 md:p-4 transition-all ${isCompleted ? 'border-emerald-100 bg-emerald-50/5' : 'border-slate-100 opacity-60'
                                }`}
                        >
                            <div className="flex items-start gap-2.5 md:gap-4">
                                <div className="mt-0.5 flex-shrink-0">
                                    {isCompleted ? (
                                        <CheckCircle2 size={18} className="text-emerald-500 fill-emerald-50" />
                                    ) : (
                                        <Circle size={18} className="text-slate-200" />
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start mb-1 gap-2">
                                        <h4 className={`font-black text-sm md:text-base tracking-tight leading-tight ${isCompleted ? 'text-emerald-900' : 'text-slate-900'}`}>
                                            {templateItem?.title}
                                        </h4>
                                        <div className="flex-shrink-0">
                                            {templateItem?.is_optional ? (
                                                <span className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-1.5 md:px-2 py-0.5 rounded-full border border-slate-100">Optional</span>
                                            ) : (
                                                <span className="text-[7px] md:text-[8px] font-black text-rose-400 uppercase tracking-widest bg-rose-50 px-1.5 md:px-2 py-0.5 rounded-full border border-rose-100">Required</span>
                                            )}
                                        </div>
                                    </div>

                                    {templateItem?.description && (
                                        <p className="text-slate-500 font-medium text-[11px] md:text-xs mb-2 md:mb-3 line-clamp-2 md:line-clamp-none">{templateItem.description}</p>
                                    )}

                                    {/* Completed By & Timestamp */}
                                    {isCompleted && (
                                        <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2 md:mb-3">
                                            <div className="flex items-center gap-1 text-slate-400">
                                                <User size={9} />
                                                <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest">
                                                    {item.checked_by_user?.full_name || completion.user?.full_name || 'System User'}
                                                </span>
                                            </div>
                                            {item.checked_at && (
                                                <div className="flex items-center gap-1 text-slate-400">
                                                    <Clock size={9} />
                                                    <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest">
                                                        {new Date(item.checked_at).toLocaleString(undefined, {
                                                            month: 'short',
                                                            day: 'numeric',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Observation Value */}
                                    {isCompleted && templateItem?.type !== 'checkbox' && (
                                        <div className="bg-slate-50/50 p-2 md:p-3 rounded-lg border border-slate-100 mb-2 md:mb-3 inline-block min-w-[120px]">
                                            <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Observation</p>
                                            <p className="text-[11px] md:text-xs font-black text-slate-900">{item.value}</p>
                                        </div>
                                    )}

                                    {/* Proof Media */}
                                    <div className="mt-2 md:mt-4 pt-2 md:pt-4 border-t border-slate-50">
                                        <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                                            <Camera size={9} />
                                            Visual Proof
                                        </p>
                                        {/* Thumbnails */}
                                        {(item.photo_url || item.video_url) && (
                                            <div className="flex flex-wrap gap-2 md:gap-3 mb-2">
                                                {item.photo_url && (
                                                    <div className="relative w-full max-w-[200px] md:max-w-xs aspect-video rounded-lg md:rounded-xl overflow-hidden shadow-md border border-slate-100 group/img cursor-pointer"
                                                        onClick={() => setPreviewImageUrl(item.photo_url)}
                                                    >
                                                        <img src={item.photo_url} alt="Audit Proof" className="w-full h-full object-cover" />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-all flex items-center justify-center">
                                                            <div className="p-2 bg-white/20 rounded-full text-white"><Eye size={20} /></div>
                                                        </div>
                                                        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[8px] text-white font-bold flex items-center gap-1">
                                                            <Camera size={8} />Photo
                                                        </div>
                                                        {item.checked_at && (
                                                            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[7px] text-white font-bold font-mono">
                                                                {new Date(item.checked_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(',', '')}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {item.video_url && (
                                                    <div className="relative w-full max-w-[200px] md:max-w-xs aspect-video rounded-lg md:rounded-xl overflow-hidden shadow-md border border-slate-100 group/vid cursor-pointer"
                                                        onClick={() => setPreviewVideoUrl(item.video_url)}
                                                    >
                                                        <video src={item.video_url} className="w-full h-full object-cover" muted playsInline />
                                                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover/vid:bg-black/50 transition-all">
                                                            <div className="p-2 bg-white/20 rounded-full text-white"><Play size={20} /></div>
                                                        </div>
                                                        <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 rounded text-[8px] text-white font-bold flex items-center gap-1">
                                                            <Video size={8} />Video
                                                        </div>
                                                        {item.checked_at && (
                                                            <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/60 rounded text-[7px] text-white font-bold font-mono">
                                                                {new Date(item.checked_at).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(',', '')}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {/* Change buttons */}
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                disabled={uploadLoading === item.id}
                                                onClick={() => { setActiveCameraItemId(item.id); setShowCameraModal(true); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-40"
                                            >
                                                <Camera size={11} />
                                                {item.photo_url ? 'Change Photo' : 'Add Photo'}
                                            </button>
                                            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all cursor-pointer">
                                                <Paperclip size={11} />
                                                Upload File
                                                <input type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleFileSelect(e, item.id)} />
                                            </label>
                                            <button
                                                disabled={uploadLoading === item.id}
                                                onClick={() => { setActiveVideoItemId(item.id); setShowVideoModal(true); }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg border border-slate-200 text-[9px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-40"
                                            >
                                                {uploadLoading === item.id ? <Loader2 size={11} className="animate-spin" /> : <Video size={11} />}
                                                {item.video_url ? 'Re-Record' : 'Add Video'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* ── Satisfaction Rating ── */}
                                    {isCompleted && (
                                        <div className="mt-3 pt-3 border-t border-slate-100">
                                            <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                                Rating
                                            </p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {RATINGS.map(({ value, label, color, bg, border, activeBg, icon: Icon }) => {
                                                    const isActive = currentRating === value;
                                                    const isProcessing = ratingLoading === item.id;
                                                    return (
                                                        <button
                                                            key={value}
                                                            disabled={isProcessing}
                                                            onClick={() => handleRate(item.id, value)}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all ${
                                                                isActive
                                                                    ? `${activeBg} text-white border-transparent shadow-sm`
                                                                    : `${bg} ${color} ${border} hover:opacity-80`
                                                            } ${isProcessing ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                                        >
                                                            <Icon size={11} />
                                                            {label}
                                                        </button>
                                                    );
                                                })}
                                                {currentRating && item.satisfaction_at && (
                                                    <span className="text-[8px] text-slate-400 font-medium ml-1">
                                                        {new Date(item.satisfaction_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-center gap-3 pt-2 md:pt-4">
                <button
                    onClick={onBack}
                    className="px-6 md:px-8 py-2.5 md:py-3 border border-slate-200 text-slate-600 rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all"
                >
                    {completion?.status === 'in_progress' ? 'Back' : 'Close'}
                </button>
                {completion?.status === 'in_progress' && (
                    <button
                        onClick={onResume}
                        className="px-6 md:px-8 py-2.5 md:py-3 bg-slate-900 text-white rounded-lg md:rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all shadow-lg flex items-center gap-2"
                    >
                        <Play size={10} />
                        Resume Checklist
                    </button>
                )}
            </div>

            {/* Image Preview Modal */}
            <ImagePreviewModal
                isOpen={!!previewImageUrl}
                onClose={() => setPreviewImageUrl(null)}
                imageUrl={previewImageUrl}
                title="Audit Proof"
            />

            {/* Video Preview Modal */}
            <VideoPreviewModal
                isOpen={!!previewVideoUrl}
                onClose={() => setPreviewVideoUrl(null)}
                videoUrl={previewVideoUrl}
                title="Video Proof"
            />

            {/* Camera Capture Modal */}
            <CameraCaptureModal
                isOpen={showCameraModal}
                onClose={() => { setShowCameraModal(false); setActiveCameraItemId(null); }}
                onCapture={handlePhotoCapture}
                title="Update Photo Proof"
            />

            {/* Video Capture Modal */}
            <VideoCaptureModal
                isOpen={showVideoModal}
                onClose={() => { setShowVideoModal(false); setActiveVideoItemId(null); }}
                onCapture={handleVideoCapture}
                title="Update Video Proof"
                maxDuration={15}
            />

            {/* Toast */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    visible={true}
                    onClose={() => setToast(null)}
                    duration={3000}
                />
            )}
        </div>

    );
};

export default SOPCompletionDetail;
