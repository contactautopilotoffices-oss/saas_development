'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Camera, CheckCircle2, ChevronRight, Loader2, X, Paperclip, Circle, Eye, Video, Play, ArrowLeft, MoreVertical, Lock } from 'lucide-react';


import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import CameraCaptureModal from '@/frontend/components/shared/CameraCaptureModal';
import VideoCaptureModal from '@/frontend/components/shared/VideoCaptureModal';
import { compressImage } from '@/frontend/utils/image-compression';
import { compressVideo } from '@/frontend/utils/video-compression';
import Skeleton from '@/frontend/components/ui/Skeleton';
import { Toast } from '@/frontend/components/ui/Toast';
import { playTickleSound } from '@/frontend/utils/sounds';
import ImagePreviewModal from '@/frontend/components/shared/ImagePreviewModal';
import VideoPreviewModal from '@/frontend/components/shared/VideoPreviewModal';


interface SOPChecklistRunnerProps {
    templateId: string;
    completionId?: string;
    isSuperAdmin?: boolean;
    propertyId: string;
    onComplete?: () => void;
    onCancel?: () => void;
}

const SOPChecklistRunner: React.FC<SOPChecklistRunnerProps> = ({ templateId, completionId, isSuperAdmin = false, propertyId, onComplete, onCancel }) => {
    const [completion, setCompletion] = useState<any>(null);
    const [template, setTemplate] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [activeCameraItemId, setActiveCameraItemId] = useState<string | null>(null);
    const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
    const [showVideoModal, setShowVideoModal] = useState(false);
    const [activeVideoItemId, setActiveVideoItemId] = useState<string | null>(null);
    const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
    const [itemValues, setItemValues] = useState<Record<string, string | number | boolean>>({});

    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [liveNow, setLiveNow] = useState(() => new Date());
    const supabase = React.useMemo(() => createClient(), []);
    const hasInitialized = React.useRef(false);

    // Tick every second so expiry is detected live
    useEffect(() => {
        const id = setInterval(() => setLiveNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    // Window closed = end_time is set and current time is past it → hard lock
    const isWindowClosed = useMemo(() => {
        if (!template?.end_time) return false;
        const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
        const [eH, eM] = template.end_time.slice(0, 5).split(':').map(Number);
        return nowMins > eH * 60 + eM;
    }, [template, liveNow]);

    // Slot overdue = current time is past the end of the slot window that was active when
    // the session was opened. Uses slot_time (stored on the completion row) if available,
    // otherwise falls back to the completion's creation time as the slot start.
    // This is a soft overdue — user can still submit.
    const isSlotOverdue = useMemo(() => {
        if (!template || isWindowClosed) return false;
        const hourlyMatch = template.frequency?.match(/^every_(\d+)_hours?$/);
        if (hourlyMatch) {
            const intervalH = parseInt(hourlyMatch[1]);
            // Prefer slot_time (HH:MM) on the completion row; fall back to created_at
            let slotStartMs: number;
            if (completion?.slot_time) {
                const [sH, sM] = completion.slot_time.slice(0, 5).split(':').map(Number);
                const now = liveNow;
                slotStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), sH, sM, 0, 0).getTime();
            } else if (completion?.created_at) {
                slotStartMs = new Date(completion.created_at).getTime();
            } else {
                return false;
            }
            const slotEndMs = slotStartMs + intervalH * 3_600_000;
            return liveNow.getTime() > slotEndMs;
        }
        return false;
    }, [template, completion, liveNow, isWindowClosed]);

    // Keep isExpired for any code that references it
    const isExpired = isWindowClosed || isSlotOverdue;

    const [adminUnlocked, setAdminUnlocked] = useState(false);
    // Hard lock: completed OR window has closed (end_time passed). Slot-overdue alone does NOT lock.
    const isReadOnly = (completion?.status === 'completed' || isWindowClosed) && !adminUnlocked;

    // Realtime: sync item checks + completion status changes made by other users
    useEffect(() => {
        if (!completion?.id) return;

        const channel = supabase
            .channel(`sop_session:${completion.id}`)
            // Item-level changes (checkbox, value, photo)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'sop_completion_items',
                    filter: `completion_id=eq.${completion.id}`,
                },
                (payload) => {
                    const updated = payload.new as any;
                    setCompletion((prev: any) => {
                        if (!prev) return prev;
                        return {
                            ...prev,
                            items: prev.items.map((item: any) =>
                                item.id === updated.id ? { ...item, ...updated } : item
                            ),
                        };
                    });
                    setItemValues((prev) => ({
                        ...prev,
                        [updated.checklist_item_id]: updated.value !== null ? updated.value : (updated.is_checked ? true : false),
                    }));
                }
            )
            // Completion status change (e.g. another user submits → status = 'completed')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'sop_completions',
                    filter: `id=eq.${completion.id}`,
                },
                (payload) => {
                    const updated = payload.new as any;
                    setCompletion((prev: any) => prev ? { ...prev, ...updated } : prev);
                    if (updated.status === 'completed') {
                        onComplete?.();
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [completion?.id, supabase, onComplete]);

    useEffect(() => {
        const initializeChecklist = async () => {
            if (hasInitialized.current) return;
            hasInitialized.current = true;

            try {
                setIsLoading(true);

                // Fetch template (skip property_id filter if not provided — checklist deep-link page)
                let templateQuery = supabase
                    .from('sop_templates')
                    .select(`*, items:sop_checklist_items(*)`)
                    .eq('id', templateId);
                if (propertyId) templateQuery = (templateQuery as any).eq('property_id', propertyId);

                const { data: templateData, error: templateError } = await templateQuery.single();

                if (templateError || !templateData) {
                    const msg = templateError?.message || 'Template not found';
                    throw new Error(msg);
                }

                // Sort items by section_title and order_index
                if (templateData.items) {
                    templateData.items.sort((a: any, b: any) => {
                        if (a.section_title !== b.section_title) {
                            if (!a.section_title) return -1;
                            if (!b.section_title) return 1;
                            return a.section_title.localeCompare(b.section_title);
                        }
                        return (a.order_index || 0) - (b.order_index || 0);
                    });
                }

                setTemplate(templateData); // Set template here

                // Use resolved propertyId — fall back to template row's property_id if prop not passed
                const resolvedPropertyId = propertyId || templateData.property_id;
                if (!resolvedPropertyId) throw new Error('Property ID could not be resolved for this template. Check RLS on sop_templates or properties table.');

                let completionData: any;

                if (completionId) {
                    // Fetch existing completion via API (supabaseAdmin, bypasses RLS)
                    const res = await fetch(`/api/properties/${resolvedPropertyId}/sop/completions/${completionId}`);
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error || 'Failed to load completion');
                    completionData = json.completion;
                } else {
                    // Start new session via API (supabaseAdmin, bypasses RLS)
                    const res = await fetch(`/api/properties/${resolvedPropertyId}/sop/completions`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ templateId }),
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error || 'Failed to start checklist');
                    completionData = json.completion;
                }

                setCompletion(completionData);

                // Initialize item values
                const initialValues: Record<string, any> = {};
                completionData.items?.forEach((i: any) => {
                    // Try to use value first, if text/number/yes_no, otherwise fallback to checked status
                    initialValues[i.checklist_item_id] = i.value !== null ? i.value : (i.is_checked ? true : false);
                });
                setItemValues(initialValues);

            } catch (err: any) {
                const msg = err?.message || err?.error_description || (typeof err === 'string' ? err : null) || JSON.stringify(err) || 'Unknown error';
                console.error('Initialization error:', msg, err);
                setToast({ message: `Error loading checklist: ${msg}`, type: 'error' });
                onCancel?.();
            } finally {
                setIsLoading(false);
            }

        };

        initializeChecklist();
    }, [templateId, completionId, propertyId]);

    const handleItemToggle = async (itemId: string, value: any = null) => {
        if (isReadOnly) return;
        if (!itemId) {
            console.error('[SOP Debug] handleItemToggle called without itemId');
            return;
        }

        console.log(`[SOP Debug] handleItemToggle initiated for itemId: ${itemId}`);

        try {
            const findContext = (comp: any, temp: any) => {
                const tItem = temp?.items?.find((i: any) =>
                    String(i.id).toLowerCase() === String(itemId).toLowerCase()
                );
                const cItem = comp?.items?.find((i: any) =>
                    String(i.checklist_item_id).toLowerCase() === String(itemId).toLowerCase()
                );
                return { tItem, cItem };
            };

            const { tItem: templateItem, cItem: item } = findContext(completion, template);

            if (!item || !templateItem) {
                console.error('[SOP Debug] CRITICAL: Context missing for toggle.', {
                    targetId: itemId,
                    foundInTemplate: !!templateItem,
                    foundInCompletion: !!item,
                    availableTemplateIds: template?.items?.map((i: any) => i.id),
                    availableCompletionIds: completion?.items?.map((i: any) => i.checklist_item_id),
                    completionId: completion?.id
                });
                setToast({ message: 'Sync error: Item not found in session', type: 'error' });
                return;
            }

            const newValue = value !== null ? value : !item.is_checked;
            const isChecked = templateItem.type === 'checkbox' ? !!newValue : true;
            const dbValue = templateItem.type !== 'checkbox' ? String(newValue) : null;

            console.log(`[SOP Debug] Proceeding with DB update for row: ${item.id}`);

            const res = await fetch(`/api/properties/${propertyId}/sop/completions/${completion.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item: {
                        completionItemId: item.id,
                        is_checked: isChecked,
                        value: dbValue,
                    }
                }),
            });
            if (!res.ok) {
                const json = await res.json();
                throw new Error(json.error || 'Failed to update item');
            }

            // Play sound if item is being checked
            if (isChecked) {
                playTickleSound();
            }

            // Update item values for UI state
            setItemValues(prev => ({ ...prev, [itemId]: newValue }));

            // Update completion items for runners logic
            setCompletion((prev: any) => {
                if (!prev || !prev.items) return prev;
                return {
                    ...prev,
                    items: prev.items.map((i: any) =>
                        String(i.checklist_item_id).toLowerCase() === String(itemId).toLowerCase()
                            ? { ...i, is_checked: isChecked, value: newValue }
                            : i
                    )
                };
            });

            console.log('[SOP Debug] handleItemToggle success');
        } catch (err) {
            console.error('[SOP Debug] handleItemToggle Exception:', err);
            setToast({ message: 'Failed to update checklist point', type: 'error' });
        }
    };

    const stampTimestamp = (file: File): Promise<File> => new Promise((resolve) => {
        const originalLastModified = file.lastModified; // Capture before any async work
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxSize = 1024;
            let w = img.width, h = img.height;
            if (w > h && w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
            else if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);
            // Use the file's own lastModified time (= actual capture time)
            const capturedAt = new Date(originalLastModified);
            const ts = capturedAt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(',', '');
            const fontSize = Math.max(14, Math.round(w * 0.028));
            ctx.font = `bold ${fontSize}px monospace`;
            const pad = Math.round(fontSize * 0.5);
            const tw = ctx.measureText(ts).width;
            const x = w - tw - pad * 2;
            const y = h - fontSize - pad * 2;
            ctx.fillStyle = 'rgba(0,0,0,0.55)';
            ctx.beginPath();
            ctx.roundRect(x, y, tw + pad * 2, fontSize + pad * 2, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(ts, x + pad, y + fontSize + pad * 0.6);
            canvas.toBlob(blob => {
                // Preserve original lastModified so subsequent reads still get the correct capture time
                resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.webp'), { type: 'image/webp', lastModified: originalLastModified }) : file);
            }, 'image/webp', 0.88);
        };
        img.src = URL.createObjectURL(file);
    });

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, itemId: string) => {
        const file = e.target.files?.[0];
        // Pass original file directly — handlePhotoCapture will stamp the timestamp
        if (file) handlePhotoCapture(file, itemId);
    };

    const handlePhotoCapture = async (file: File, itemId?: string) => {
        const targetItemId = itemId || activeCameraItemId;
        if (!completion || !targetItemId) return;

        try {
            setIsSaving(true);

            // Capture actual photo time BEFORE any async processing
            const photoTakenAt = new Date(file.lastModified).toISOString();

            // Stamp timestamp (uses file.lastModified = actual capture time for both camera and gallery)
            const stamped = await stampTimestamp(file);

            // Compress image
            const compressedFile = await compressImage(stamped);

            // Upload photo
            const formData = new FormData();
            formData.append('file', compressedFile);
            formData.append('completionId', completion.id);
            formData.append('completionItemId', String(targetItemId));


            const response = await fetch(`/api/properties/${propertyId}/sop/photos`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to upload photo');

            // Update item with photo URL + actual capture time
            const item = completion.items.find((i: any) => i.checklist_item_id === targetItemId);
            if (!item) throw new Error('Completion item not found');

            const photoRes = await fetch(`/api/properties/${propertyId}/sop/completions/${completion.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item: { completionItemId: item.id, photo_url: data.url } }),
            });
            if (!photoRes.ok) throw new Error('Failed to save photo URL');

            setCompletion((prev: any) => prev ? {
                ...prev,
                items: prev.items.map((i: any) =>
                    i.checklist_item_id === targetItemId ? { ...i, photo_url: data.url, checked_at: photoTakenAt } : i
                ),
            } : prev);

            setShowCameraModal(false);
            setActiveCameraItemId(null);
            setToast({ message: 'Photo uploaded successfully', type: 'success' });

        } catch (err: any) {
            console.error('Error uploading photo:', err);
            setToast({ message: err.message || 'Error uploading photo', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleVideoCapture = async (file: File) => {
        const targetItemId = activeVideoItemId;
        if (!completion || !targetItemId) return;

        try {
            setIsSaving(true);

            // Compress video
            const compressedFile = await compressVideo(file);

            // Upload video
            const formData = new FormData();
            formData.append('file', compressedFile);
            formData.append('completionId', completion.id);
            formData.append('completionItemId', String(targetItemId));

            const response = await fetch(`/api/properties/${propertyId}/sop/videos`, {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to upload video');

            // Update item with video URL
            const item = completion.items.find((i: any) => i.checklist_item_id === targetItemId);
            if (!item) throw new Error('Completion item not found');

            const videoRes = await fetch(`/api/properties/${propertyId}/sop/completions/${completion.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ item: { completionItemId: item.id, photo_url: data.url } }),
            });
            if (!videoRes.ok) throw new Error('Failed to save video URL');

            setCompletion({
                ...completion,
                items: completion.items.map((i: any) =>
                    i.checklist_item_id === targetItemId ? { ...i, video_url: data.url } : i
                ),
            });

            setShowVideoModal(false);
            setActiveVideoItemId(null);
            setToast({ message: 'Video uploaded successfully', type: 'success' });

        } catch (err: any) {
            console.error('Error uploading video:', err);
            setToast({ message: err.message || 'Error uploading video', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    const handleSubmit = async () => {
        if (!completion) return;

        try {
            setIsSaving(true);

            // Check mandatory items (photo/video are optional — only check/value interaction required)
            const uncheckedMandatory = template.items.filter((item: any) => {
                const comp = completion.items.find((c: any) => c.checklist_item_id === item.id);
                const hasInteraction = comp && (comp.is_checked || comp.value);
                return !item.is_optional && !hasInteraction;
            });


            if (uncheckedMandatory.length > 0) {
                setToast({
                    message: `${uncheckedMandatory.length} mandatory item(s) not completed`,
                    type: 'error',
                });
                setIsSaving(false);
                return;
            }

            // Update completion status via API (supabaseAdmin, bypasses RLS)
            const submitRes = await fetch(`/api/properties/${propertyId}/sop/completions/${completion.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'completed' }),
            });
            if (!submitRes.ok) throw new Error('Failed to submit checklist');

            playTickleSound();
            setToast({ message: 'Checklist submitted successfully!', type: 'success' });
            setTimeout(() => onComplete?.(), 1500);
        } catch (err) {
            setToast({ message: 'Error submitting checklist', type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-4 rounded-full w-full" />
                <div className="space-y-4 pt-6">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-3xl" />)}
                </div>
            </div>
        );
    }

    if (!template || !completion) {
        return <div className="text-center py-24 text-slate-500 font-black uppercase text-xs tracking-widest">Error loading checklist data</div>;
    }

    const checkedCount = completion.items.filter((cItem: any) => {
        const hasInteraction = cItem.is_checked || cItem.value;
        return hasInteraction;
    }).length;

    const progress = completion.items.length > 0 ? (checkedCount / completion.items.length) * 100 : 0;


    return (
        <div className="flex flex-col min-h-screen bg-white">
            {/* ── TOP HEADER ── */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white z-20">
                <button onClick={onCancel} className="w-9 h-9 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded-full transition-all">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-base font-black text-slate-900 tracking-tight truncate max-w-[55%] text-center">{template.title}</h1>
                {isSuperAdmin && (completion?.status === 'completed' || isExpired) ? (
                    <button
                        onClick={() => setAdminUnlocked(v => !v)}
                        title={adminUnlocked ? 'Re-lock checklist' : 'Admin override — unlock checklist'}
                        className={`w-9 h-9 flex items-center justify-center rounded-full transition-all ${adminUnlocked ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}
                    >
                        <Lock size={16} />
                    </button>
                ) : (
                    <button className="w-9 h-9 flex items-center justify-center text-slate-400 hover:bg-slate-100 rounded-full transition-all">
                        <MoreVertical size={20} />
                    </button>
                )}
            </div>

            {/* ── PROGRESS BAR ── */}
            <div className="px-4 pt-3 pb-2 bg-white">
                <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-slate-500">Completion status</span>
                    <span className="text-[11px] font-black text-primary">{Math.round(progress)}% ({checkedCount}/{completion.items.length} PTS)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden">
                    <motion.div
                        className="bg-primary h-full rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                </div>
            </div>

            {/* ── BANNER: completed / window-closed / slot-overdue / admin ── */}
            {adminUnlocked ? (
                <div className="mx-4 mt-3 mb-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl border bg-amber-50 border-amber-200">
                    <Lock size={14} className="flex-shrink-0 text-amber-500" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Admin Override Active</p>
                        <p className="text-[9px] font-medium mt-0.5 text-amber-500">Lock is lifted — edits are allowed. Tap the lock icon to re-lock.</p>
                    </div>
                </div>
            ) : isWindowClosed ? (
                <div className="mx-4 mt-3 mb-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl border bg-rose-50 border-rose-200">
                    <Lock size={14} className="flex-shrink-0 text-rose-500" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-rose-600">Time Window Closed</p>
                        <p className="text-[9px] font-medium mt-0.5 text-rose-500">The daily window has ended. This checklist is now read-only.</p>
                    </div>
                </div>
            ) : completion?.status === 'completed' ? (
                <div className="mx-4 mt-3 mb-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl border bg-emerald-50 border-emerald-200">
                    <Lock size={14} className="flex-shrink-0 text-emerald-500" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Checklist Completed</p>
                        <p className="text-[9px] font-medium mt-0.5 text-emerald-500">This checklist has been submitted and is now read-only.</p>
                    </div>
                </div>
            ) : isSlotOverdue ? (
                <div className="mx-4 mt-3 mb-1 flex items-center gap-2.5 px-4 py-3 rounded-2xl border bg-amber-50 border-amber-200">
                    <Lock size={14} className="flex-shrink-0 text-amber-500" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-600">Overdue — Submit Now</p>
                        <p className="text-[9px] font-medium mt-0.5 text-amber-500">This slot&apos;s time has passed. You can still submit your responses.</p>
                    </div>
                </div>
            ) : null}

            {/* ── CHECKLIST ITEMS ── */}
            <div className="flex-1 overflow-y-auto pb-24">
                {(() => {
                    let currentSection: string | null = null;
                    return template.items.map((item: any, index: number) => {
                        const showSectionHeader = item.section_title !== currentSection;
                        if (showSectionHeader) currentSection = item.section_title;

                        const completionItem = completion.items.find((c: any) => c.checklist_item_id === item.id);
                    const isChecked = completionItem?.is_checked;
                    const hasValue = completionItem?.value || isChecked;
                    const value = itemValues[item.id];

                    // Per-item time slot logic
                    const itemSlotLocked = (() => {
                        if (!item.end_time || isChecked || hasValue) return false;
                        const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
                        const [eH, eM] = item.end_time.slice(0, 5).split(':').map(Number);
                        return nowMins > eH * 60 + eM;
                    })();
                    const itemSlotUpcoming = (() => {
                        if (!item.start_time || isChecked || hasValue) return false;
                        const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
                        const [sH, sM] = item.start_time.slice(0, 5).split(':').map(Number);
                        return nowMins < sH * 60 + sM;
                    })();
                    const itemDisabled = isReadOnly || itemSlotLocked || itemSlotUpcoming;

                    const fmt12Step = (t: string) => {
                        const [h24, m] = t.slice(0, 5).split(':').map(Number);
                        const ampm = h24 >= 12 ? 'PM' : 'AM';
                        const h12 = h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
                        return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
                    };

                        return (
                            <React.Fragment key={item.id}>
                                {showSectionHeader && (
                                    <div className="px-4 py-2 bg-slate-50 border-y border-slate-100 flex items-center gap-2">
                                        <div className="w-1 h-3 bg-primary rounded-full" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            {item.section_title || 'General'}
                                        </span>
                                    </div>
                                )}
                                <motion.div
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                    className={`border-b border-slate-100 ${itemSlotLocked ? 'opacity-60' : ''}`}
                                >
                            {/* Item title row */}
                            <div className="flex items-start gap-3 px-4 pt-4 pb-1">
                                {item.type === 'checkbox' ? (
                                    <button onClick={() => handleItemToggle(item.id)} disabled={itemDisabled} className="flex-shrink-0 mt-0.5 disabled:opacity-60 disabled:cursor-not-allowed">
                                        <AnimatePresence mode="wait">
                                            {isChecked ? (
                                                <motion.div key="checked" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
                                                    <CheckCircle2 size={24} className="text-primary" />
                                                </motion.div>
                                            ) : (
                                                <motion.div key="unchecked" initial={{ scale: 0.6 }} animate={{ scale: 1 }}>
                                                    <Circle size={24} className="text-slate-300" />
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </button>
                                ) : (
                                    <div className="w-6 h-6 rounded-full border-2 border-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <span className="text-[9px] font-black text-slate-400">{index + 1}</span>
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <h3 className={`font-black text-base tracking-tight ${isChecked ? 'text-primary' : 'text-slate-900'}`}>{item.title}</h3>
                                    {/* Step time slot badge */}
                                    {(item.start_time || item.end_time) && (
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest
                                                ${itemSlotLocked ? 'bg-rose-100 text-rose-600' : itemSlotUpcoming ? 'bg-amber-100 text-amber-600' : 'bg-primary/10 text-primary'}`}>
                                                {item.start_time ? fmt12Step(item.start_time) : '—'} – {item.end_time ? fmt12Step(item.end_time) : '—'}
                                                {itemSlotLocked ? ' · Closed' : itemSlotUpcoming ? ' · Upcoming' : ''}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="pb-2" />

                            {/* Photo preview — full width */}
                            {completionItem?.photo_url && (
                                <div
                                    className="mx-4 mb-3 rounded-2xl overflow-hidden cursor-pointer relative group"
                                    onClick={() => setPreviewImageUrl(completionItem.photo_url!)}
                                >
                                    <img src={completionItem.photo_url} alt="Proof" className="w-full h-48 object-cover" />
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                        <Eye size={28} className="text-white" />
                                    </div>
                                </div>
                            )}

                            {/* Video preview — full width */}
                            {completionItem?.video_url && (
                                <div
                                    className="mx-4 mb-3 rounded-2xl overflow-hidden cursor-pointer relative"
                                    onClick={() => setPreviewVideoUrl(completionItem.video_url!)}
                                >
                                    <video src={completionItem.video_url} className="w-full h-48 object-cover" muted playsInline />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                                            <Play size={22} className="text-white ml-1" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Dynamic input */}
                            {item.type === 'text' && (
                                <div className="px-4 mb-3">
                                    <input type="text" value={String(value || '')} onChange={(e) => handleItemToggle(item.id, e.target.value)}
                                        disabled={itemDisabled} placeholder="Enter observation..."
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed" />
                                </div>
                            )}
                            {item.type === 'number' && (
                                <div className="px-4 mb-3">
                                    <input type="number" value={String(value || '')} onChange={(e) => handleItemToggle(item.id, e.target.value)}
                                        disabled={itemDisabled} placeholder="Enter value..."
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium focus:outline-none focus:border-primary transition-all disabled:opacity-60 disabled:cursor-not-allowed" />
                                </div>
                            )}
                            {item.type === 'yes_no' && (
                                <div className="px-4 mb-3 flex gap-3">
                                    <button onClick={() => handleItemToggle(item.id, 'yes')} disabled={itemDisabled}
                                        className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed ${value === 'yes' ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>Yes</button>
                                    <button onClick={() => handleItemToggle(item.id, 'no')} disabled={itemDisabled}
                                        className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-60 disabled:cursor-not-allowed ${value === 'no' ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-500'}`}>No</button>
                                </div>
                            )}

                            {/* Media documentation */}
                            <div className="px-4 pb-4">
                                <p className="text-[11px] font-black text-slate-800 uppercase tracking-widest mb-0.5">Media Documentation</p>
                                <p className="text-[11px] text-slate-400 font-medium mb-3">
                                    {item.description || 'Upload or capture required proof of completion'}
                                </p>
                                <div className="flex gap-2">
                                    {/* CAPTURE */}
                                    <button onClick={() => { setActiveCameraItemId(item.id); setShowCameraModal(true); }} disabled={itemDisabled}
                                        className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${completionItem?.photo_url ? 'border-primary/30 bg-primary/5 text-primary' : 'border-slate-200 text-primary hover:border-primary/40'}`}>
                                        <Camera size={18} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">{completionItem?.photo_url ? 'Retake' : 'Capture'}</span>
                                    </button>
                                    {/* GALLERY */}
                                    <label className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all ${itemDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:border-slate-400'} ${completionItem?.photo_url ? 'border-slate-300 bg-slate-50 text-slate-500' : 'border-slate-200 text-slate-500'}`}>
                                        <Paperclip size={18} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Gallery</span>
                                        <input type="file" accept="image/*" className="hidden" disabled={itemDisabled} onChange={(e) => handleFileSelect(e, item.id)} />
                                    </label>
                                    {/* 15S VIDEO */}
                                    <button onClick={() => { setActiveVideoItemId(item.id); setShowVideoModal(true); }} disabled={itemDisabled}
                                        className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${completionItem?.video_url ? 'border-slate-300 bg-slate-50 text-slate-500' : 'border-slate-200 text-slate-500 hover:border-slate-400'}`}>
                                        <Video size={18} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">{completionItem?.video_url ? 'Re-Record' : '15s Video'}</span>
                                    </button>
                                </div>
                            </div>
                                </motion.div>
                            </React.Fragment>
                        );
                    });
                })()}
            </div>

            {/* ── STICKY FOOTER ── */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 px-4 py-3 flex gap-3 z-20">
                <button onClick={onCancel}
                    className="flex-1 py-3.5 border border-slate-200 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-50 transition-all">
                    {isReadOnly ? 'Close' : 'Cancel'}
                </button>
                {isReadOnly ? (
                    <div className="flex-[2] py-3.5 bg-slate-100 text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 cursor-not-allowed">
                        <Lock size={11} />
                        {isWindowClosed ? 'Window Closed' : 'Submitted'}
                    </div>
                ) : (
                    <button onClick={handleSubmit} disabled={isSaving}
                        className="flex-[2] py-3.5 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2">
                        {isSaving ? (
                            <><Loader2 size={13} className="animate-spin" /> Saving...</>
                        ) : (
                            <>{checkedCount}/{completion.items.length} Done <ChevronRight size={14} /></>
                        )}
                    </button>
                )}
            </div>

            {/* Camera Modal */}
            <CameraCaptureModal
                isOpen={showCameraModal}
                onClose={() => {
                    setShowCameraModal(false);
                    setActiveCameraItemId(null);
                }}
                onCapture={handlePhotoCapture}
                title="Checklist Visual Audit"
            />

            {/* Image Preview Modal */}
            <ImagePreviewModal
                isOpen={!!previewImageUrl}
                onClose={() => setPreviewImageUrl(null)}
                imageUrl={previewImageUrl}
                title="Audit Proof"
            />

            {/* Video Capture Modal */}
            <VideoCaptureModal
                isOpen={showVideoModal}
                onClose={() => {
                    setShowVideoModal(false);
                    setActiveVideoItemId(null);
                }}
                onCapture={handleVideoCapture}
                title="Checklist Video Audit"
                maxDuration={15}
            />

            {/* Video Preview Modal */}
            <VideoPreviewModal
                isOpen={!!previewVideoUrl}
                onClose={() => setPreviewVideoUrl(null)}
                videoUrl={previewVideoUrl}
                title="Video Proof"
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

export default SOPChecklistRunner;
