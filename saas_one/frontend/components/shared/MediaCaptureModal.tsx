/**
 * MediaCaptureModal
 * Unified modal combining photo and video capture for ticket attachments.
 * @remarks Client component.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Video, X, SwitchCamera, RefreshCw, CheckCircle2, Image as ImageIcon, Film } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type MediaFile = {
    file: File;
    type: 'image' | 'video';
    preview: string;
    takenAt: string;
};

interface MediaCaptureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (media: MediaFile) => void;
    title?: string;
}

type Mode = 'photo' | 'video';

export default function MediaCaptureModal({
    isOpen,
    onClose,
    onCapture,
    title = 'Add Media',
}: MediaCaptureModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    const [mode, setMode] = useState<Mode>('photo');
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [capturedMedia, setCapturedMedia] = useState<MediaFile | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);

    useEffect(() => {
        if (!isOpen) {
            stopCamera();
            discardRecording();
            setCapturedMedia(null);
            setError(null);
            setMode('photo');
        }
        return () => {
            stopCamera();
            if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isCameraActive && streamRef.current && videoRef.current) {
            const v = videoRef.current;
            v.srcObject = streamRef.current;
            v.onloadedmetadata = async () => {
                try { await v.play(); } catch { /* ignored */ }
                checkCameras();
            };
        }
    }, [isCameraActive]);

    const checkCameras = async () => {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            setHasMultipleCameras(devices.filter(d => d.kind === 'videoinput').length > 1);
        } catch { /* ignore */ }
    };

    // Three-level fallback — avoids "Timeout starting video source" AbortError
    const startCamera = async (attempt = 0) => {
        setError(null);
        setIsStarting(true);
        try {
            if (!navigator?.mediaDevices?.getUserMedia) throw new Error('Camera not supported');
            if (streamRef.current) stopCamera();
            if (attempt > 0) await new Promise(r => setTimeout(r, 800));

            const constraints: MediaStreamConstraints =
                attempt === 0 ? { video: { facingMode }, audio: mode === 'video' }
                    : attempt === 1 ? { video: true, audio: mode === 'video' }
                        : { video: true, audio: false };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            setIsCameraActive(true);
        } catch (err: any) {
            console.warn(`[Camera] attempt ${attempt} failed:`, err.name, err.message);
            if (attempt < 2 && (err.name === 'AbortError' || err.name === 'NotReadableError' || err.name === 'NotAllowedError')) {
                setError(attempt === 0 ? 'Starting camera…' : 'Retrying…');
                setTimeout(() => startCamera(attempt + 1), 900);
                return;
            }
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setError('Camera permission denied. Allow camera access in your browser settings.');
            } else if (err.name === 'NotFoundError') {
                setError('No camera found on this device.');
            } else {
                setError('Could not start camera. Close other apps using the camera.');
            }
            setIsCameraActive(false);
        } finally {
            setIsStarting(false);
        }
    };

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        setIsCameraActive(false);
        setIsStarting(false);
    };

    const switchCamera = () => {
        const next = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(next);
        stopCamera();
        setTimeout(() => startCamera(0), 150);
    };

    const stampTimestamp = (file: File): Promise<File> => new Promise((resolve) => {
        const originalLastModified = file.lastModified;
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const maxSize = 1280;
            let w = img.width, h = img.height;
            if (w > h && w > maxSize) { h = (h * maxSize) / w; w = maxSize; }
            else if (h > maxSize) { w = (w * maxSize) / h; h = maxSize; }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);
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
                resolve(blob ? new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg', lastModified: originalLastModified }) : file);
            }, 'image/jpeg', 0.85);
        };
        img.src = URL.createObjectURL(file);
    });

    const takePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;
        const v = videoRef.current;
        if (v.videoWidth === 0) return;
        const c = canvasRef.current;
        c.width = v.videoWidth;
        c.height = v.videoHeight;
        c.getContext('2d')?.drawImage(v, 0, 0);
        c.toBlob(async blob => {
            if (!blob) return;
            const rawFile = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
            const stamped = await stampTimestamp(rawFile);
            setCapturedMedia({
                file: stamped,
                type: 'image',
                preview: URL.createObjectURL(stamped),
                takenAt: new Date(stamped.lastModified).toISOString()
            });
            stopCamera();
        }, 'image/jpeg', 0.85);
    };

    const startRecording = useCallback(() => {
        if (!streamRef.current) return;
        chunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : 'video/mp4';

        const recorder = new MediaRecorder(streamRef.current, { mimeType });
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: mimeType });
            const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
            const file = new File([blob], `video_${Date.now()}.${ext}`, { type: mimeType, lastModified: Date.now() });
            setCapturedMedia({
                file,
                type: 'video',
                preview: URL.createObjectURL(blob),
                takenAt: new Date(file.lastModified).toISOString()
            });
            stopCamera();
        };
        recorder.start(250);
        setIsRecording(true);
        setRecordSeconds(0);
        recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    }, []);

    const stopRecording = useCallback(() => {
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop();
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setRecordSeconds(0);
    }, []);

    const discardRecording = useCallback(() => {
        if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
        const recorder = mediaRecorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.ondataavailable = null;
            recorder.onstop = null;
            recorder.stop();
        }
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setRecordSeconds(0);
    }, []);

    const formatTime = (s: number) =>
        `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const handleModeSwitch = (next: Mode) => {
        if (next === mode) return;
        discardRecording();
        setMode(next);
        if (isCameraActive) { stopCamera(); setTimeout(() => startCamera(0), 150); }
    };

    const handleGalleryPick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        const isVideo = file.type.startsWith('video/');
        const isImage = file.type.startsWith('image/');
        if (!isVideo && !isImage) { setError('Please select an image or video.'); return; }
        if (isImage) {
            const objectUrl = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                const canvas = document.createElement('canvas');
                const max = 1280;
                let { width, height } = img;
                if (width > max) { height = (height * max) / width; width = max; }
                else if (height > max) { width = (width * max) / height; height = max; }
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d')?.drawImage(img, 0, 0, width, height);
                canvas.toBlob(async blob => {
                    if (!blob) return;
                    const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg', lastModified: file.lastModified });
                    const stamped = await stampTimestamp(compressed);
                    setCapturedMedia({
                        file: stamped,
                        type: 'image',
                        preview: URL.createObjectURL(stamped),
                        takenAt: new Date(stamped.lastModified).toISOString()
                    });
                }, 'image/jpeg', 0.85);
            };
            img.src = objectUrl;
        } else {
            setCapturedMedia({
                file,
                type: 'video',
                preview: URL.createObjectURL(file),
                takenAt: new Date(file.lastModified).toISOString()
            });
        }
    };

    const confirmMedia = () => { if (capturedMedia) { onCapture(capturedMedia); onClose(); } };

    const retake = () => {
        if (capturedMedia?.preview.startsWith('blob:')) URL.revokeObjectURL(capturedMedia.preview);
        setCapturedMedia(null);
        startCamera(0);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {/* ── Centered modal overlay (sidebar remains visible) ── */}
            <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.18 }}
                    className="relative w-full max-w-sm h-[88vh] max-h-[700px] bg-black rounded-2xl overflow-hidden flex flex-col shadow-2xl"
                >
                    {/* ════════════════════════════════════
                        CAMERA / PREVIEW — fills all space
                    ════════════════════════════════════ */}
                    <div className="absolute inset-0">
                        {capturedMedia ? (
                            <div className="relative w-full h-full">
                                {capturedMedia.type === 'image' ? (
                                    <img src={capturedMedia.preview} alt="Preview" className="w-full h-full object-contain bg-black" />
                                ) : (
                                    <video src={capturedMedia.preview} controls playsInline className="w-full h-full object-contain bg-black" />
                                )}

                                {/* Timestamp preview overlay */}
                                {capturedMedia.takenAt && (
                                    <div className="absolute bottom-28 left-4 px-2 py-1 bg-black/60 rounded text-[11px] text-white font-bold font-mono backdrop-blur-sm pointer-events-none z-20 shadow-lg">
                                        {new Date(capturedMedia.takenAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).replace(',', '')}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                <video
                                    ref={videoRef}
                                    autoPlay playsInline muted
                                    className={`w-full h-full object-cover transition-opacity duration-300 ${isCameraActive && !isStarting ? 'opacity-100' : 'opacity-0'}`}
                                    style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                                />
                                {/* Camera not started yet */}
                                {!isCameraActive && !isStarting && !error && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black">
                                        <div className="w-20 h-20 rounded-full bg-white/5 flex items-center justify-center">
                                            {mode === 'photo'
                                                ? <Camera className="w-10 h-10 text-white/20" />
                                                : <Video className="w-10 h-10 text-white/20" />}
                                        </div>
                                        <button
                                            onClick={() => startCamera(0)}
                                            className="px-8 py-4 bg-white text-black rounded-2xl font-black uppercase text-sm tracking-widest active:scale-95 transition-transform"
                                        >
                                            Open Camera
                                        </button>
                                    </div>
                                )}
                                {/* Starting spinner */}
                                {isStarting && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black">
                                        <RefreshCw className="w-9 h-9 text-white/30 animate-spin" />
                                        <span className="text-white/40 text-xs font-black uppercase tracking-widest animate-pulse">Starting camera…</span>
                                    </div>
                                )}
                                {/* Error */}
                                {error && !isStarting && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black p-8 text-center">
                                        <RefreshCw className="w-10 h-10 text-white/20" />
                                        <p className="text-white/60 text-sm leading-relaxed">{error}</p>
                                        <button
                                            onClick={() => { setError(null); startCamera(0); }}
                                            className="px-6 py-3 bg-white text-black rounded-2xl font-black uppercase text-xs tracking-widest"
                                        >
                                            Retry
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                        <canvas ref={canvasRef} className="hidden" />
                    </div>

                    {/* ════════════════════════════════════
                        TOP OVERLAY — close + title + tabs
                    ════════════════════════════════════ */}
                    <div className="relative z-10 flex flex-col items-center pt-safe-top pt-4 px-4 gap-3 bg-gradient-to-b from-black/70 via-black/30 to-transparent pb-10 pointer-events-none">
                        {/* Close + title row */}
                        <div className="w-full flex items-center justify-between pointer-events-auto">
                            <button
                                onClick={onClose}
                                className="w-10 h-10 flex items-center justify-center bg-black/50 rounded-full backdrop-blur-sm text-white/80 hover:text-white transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                            <span className="text-white text-sm font-black uppercase tracking-widest drop-shadow-lg">
                                {title}
                            </span>
                            <div className="w-10" />
                        </div>

                        {/* Photo / Video tabs */}
                        {!capturedMedia && (
                            <div className="flex items-center gap-1 bg-black/50 backdrop-blur-md rounded-full p-1 pointer-events-auto">
                                <button
                                    onClick={() => handleModeSwitch('photo')}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black transition-all active:scale-95 ${mode === 'photo' ? 'bg-white text-black' : 'text-white/70 hover:text-white'}`}
                                >
                                    <Camera className="w-4 h-4" />
                                    Photo
                                </button>
                                <button
                                    onClick={() => handleModeSwitch('video')}
                                    className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-black transition-all active:scale-95 ${mode === 'video' ? 'bg-red-500 text-white' : 'text-white/70 hover:text-white'}`}
                                >
                                    <Video className="w-4 h-4" />
                                    Video
                                </button>
                            </div>
                        )}

                        {/* Recording badge */}
                        {isRecording && (
                            <div className="flex items-center gap-2 bg-red-600/90 backdrop-blur-md rounded-full px-4 py-1.5 pointer-events-none">
                                <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                <span className="text-white text-xs font-black tracking-widest">REC {formatTime(recordSeconds)}</span>
                            </div>
                        )}
                    </div>

                    {/* ════════════════════════════════════
                        BOTTOM OVERLAY — controls
                    ════════════════════════════════════ */}
                    <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-safe-bottom pb-8 px-8">
                        {capturedMedia ? (
                            /* ── Review ── */
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={retake}
                                    className="flex-1 py-4 flex flex-col items-center gap-2 text-white/70 hover:text-white border border-white/20 rounded-2xl backdrop-blur-sm transition-colors active:scale-95"
                                >
                                    <RefreshCw className="w-5 h-5" />
                                    <span className="text-[10px] font-black uppercase tracking-widest">Retake</span>
                                </button>
                                <button
                                    onClick={confirmMedia}
                                    className="flex-[2] py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-100 transition-all active:scale-95"
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                    Use {capturedMedia.type === 'image' ? 'Photo' : 'Video'}
                                </button>
                            </div>
                        ) : (
                            /* ── Capture controls ── */
                            <div className="flex items-center justify-between">
                                {/* Gallery */}
                                <label className="flex flex-col items-center gap-2 cursor-pointer group w-14">
                                    <div className="w-12 h-12 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-full border border-white/20 group-hover:bg-white/10 transition-colors">
                                        {mode === 'photo' ? <ImageIcon className="w-6 h-6 text-white" /> : <Film className="w-6 h-6 text-white" />}
                                    </div>
                                    <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Gallery</span>
                                    <input
                                        ref={galleryInputRef}
                                        type="file"
                                        accept={mode === 'photo' ? 'image/*' : 'video/*,image/*'}
                                        className="hidden"
                                        onChange={handleGalleryPick}
                                    />
                                </label>

                                {/* Shutter / Record button */}
                                {mode === 'photo' ? (
                                    <button
                                        onClick={takePhoto}
                                        disabled={!isCameraActive}
                                        className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all"
                                    >
                                        <div className="w-16 h-16 bg-white rounded-full hover:bg-slate-200 transition-colors" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={isRecording ? stopRecording : startRecording}
                                        disabled={!isCameraActive}
                                        className={`w-20 h-20 rounded-full border-4 flex items-center justify-center disabled:opacity-40 active:scale-90 transition-all ${isRecording ? 'border-red-500' : 'border-white'}`}
                                    >
                                        <div className={`bg-red-500 transition-all duration-200 ${isRecording ? 'w-8 h-8 rounded-lg' : 'w-16 h-16 rounded-full'}`} />
                                    </button>
                                )}

                                {/* Flip camera */}
                                <div className="w-14 flex justify-end">
                                    {hasMultipleCameras && isCameraActive && !isRecording ? (
                                        <button
                                            onClick={switchCamera}
                                            className="flex flex-col items-center gap-2 group"
                                        >
                                            <div className="w-12 h-12 flex items-center justify-center bg-black/40 backdrop-blur-sm rounded-full border border-white/20 group-hover:bg-white/10 transition-colors">
                                                <SwitchCamera className="w-6 h-6 text-white" />
                                            </div>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/60">Flip</span>
                                        </button>
                                    ) : <div />}
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
