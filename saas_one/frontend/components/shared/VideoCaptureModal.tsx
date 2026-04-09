/**
 * VideoCaptureModal
 * Modal for capturing video recordings for ticket attachments.
 * @remarks Client component.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Video, X, SwitchCamera, RefreshCw, CheckCircle2, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface VideoCaptureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (file: File) => void;
    title?: string;
    maxDuration?: number; // seconds
}

export default function VideoCaptureModal({
    isOpen,
    onClose,
    onCapture,
    title = 'Record Video',
    maxDuration = 15,
}: VideoCaptureModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const previewVideoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
    const [recordedFile, setRecordedFile] = useState<File | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [videoOnly, setVideoOnly] = useState(false);

    // Auto-start camera when modal opens
    useEffect(() => {
        if (isOpen) {
            const checkAndAutoStart = async () => {
                try {
                    if (navigator.permissions && navigator.permissions.query) {
                        const status = await navigator.permissions.query({ name: 'camera' as any });
                        if (status.state === 'granted') {
                            setTimeout(() => {
                                if (isOpen && !isCameraActive && !recordedVideoUrl) {
                                    startCamera();
                                }
                            }, 300);
                        }
                    }
                } catch (e) {
                    console.warn('Permission check failed:', e);
                }
            };
            checkAndAutoStart();
        } else {
            cleanup();
        }
        return () => cleanup();
    }, [isOpen]);

    const cleanup = useCallback(() => {
        stopRecording();
        stopCamera();
        if (recordedVideoUrl) {
            URL.revokeObjectURL(recordedVideoUrl);
        }
        setRecordedVideoUrl(null);
        setRecordedFile(null);
        setIsCameraActive(false);
        setIsStarting(false);
        setIsRecording(false);
        setElapsed(0);
        setVideoOnly(false);
    }, []);

    const checkCameras = async () => {
        if (!navigator?.mediaDevices?.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(d => d.kind === 'videoinput');
            setHasMultipleCameras(videoDevices.length > 1);
        } catch (err) {
            console.error('Error checking cameras:', err);
        }
    };

    const startCamera = async (isRetry = false, noAudio = false) => {
        try {
            setError(null);
            setIsStarting(true);

            if (!navigator?.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Camera not supported in this browser');
            }

            if (isRetry) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (streamRef.current) {
                stopCamera();
            }

            const videoConstraints = isRetry
                ? true
                : { facingMode, width: { ideal: 640 }, height: { ideal: 480 } };

            const constraints: MediaStreamConstraints = {
                video: videoConstraints,
                audio: noAudio ? false : true,
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            if (noAudio) setVideoOnly(true);

            if (!isRetry) {
                setIsCameraActive(true);
            }
        } catch (err: any) {
            // Microphone blocked by Permissions-Policy — retry silently without audio
            if (!noAudio && err.name === 'NotAllowedError') {
                startCamera(isRetry, true);
                return;
            }

            console.error('Camera start failed:', err);

            if (!isRetry && (err.name === 'AbortError' || err.name === 'NotReadableError')) {
                setError('Hardware busy, attempting to reset...');
                setTimeout(() => startCamera(true, noAudio), 500);
                return;
            }

            const message =
                err.name === 'AbortError' || err.name === 'NotReadableError'
                    ? 'Camera hardware is busy. Please close other apps using the camera and try again.'
                    : 'Unable to access camera. Please ensure camera permissions are granted.';
            setError(message);
            setIsCameraActive(false);
        } finally {
            setIsStarting(false);
        }
    };

    // Assign stream to video element
    useEffect(() => {
        if (isCameraActive && streamRef.current && videoRef.current) {
            const video = videoRef.current;
            video.srcObject = streamRef.current;
            video.onloadedmetadata = async () => {
                try {
                    await video.play();
                    checkCameras();
                } catch (e) {
                    console.error('Play prevented:', e);
                }
            };
        }
    }, [isCameraActive]);

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsCameraActive(false);
        setIsStarting(false);
    };

    const switchCamera = () => {
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newMode);
        if (isCameraActive && !isRecording) {
            stopCamera();
            setTimeout(() => startCamera(), 200);
        }
    };

    const startRecording = () => {
        if (!streamRef.current) return;

        chunksRef.current = [];
        setElapsed(0);

        // Find supported mime type
        const mimeTypes = [
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp8',
            'video/webm',
            'video/mp4',
        ];
        const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

        const recorder = new MediaRecorder(streamRef.current, {
            mimeType: selectedMime,
            videoBitsPerSecond: 500_000, // 500 Kbps — compressed further before upload
        });

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunksRef.current.push(e.data);
            }
        };

        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: selectedMime.split(';')[0] });
            const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
            const file = new File([blob], `video_${Date.now()}.${ext}`, {
                type: selectedMime.split(';')[0],
                lastModified: Date.now(),
            });

            const url = URL.createObjectURL(blob);
            setRecordedVideoUrl(url);
            setRecordedFile(file);
            stopCamera();
        };

        recorderRef.current = recorder;
        recorder.start(100); // Collect data every 100ms
        setIsRecording(true);

        // Countdown timer
        let count = 0;
        timerRef.current = setInterval(() => {
            count += 1;
            setElapsed(count);
            if (count >= maxDuration) {
                stopRecording();
            }
        }, 1000);
    };

    const stopRecording = () => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (recorderRef.current && recorderRef.current.state === 'recording') {
            recorderRef.current.stop();
        }
        recorderRef.current = null;
        setIsRecording(false);
    };

    const retakeVideo = () => {
        if (recordedVideoUrl) {
            URL.revokeObjectURL(recordedVideoUrl);
        }
        setRecordedVideoUrl(null);
        setRecordedFile(null);
        setElapsed(0);
        startCamera();
    };

    const confirmVideo = () => {
        if (!recordedFile) return;
        onCapture(recordedFile);
        onClose();
    };

    const progress = (elapsed / maxDuration) * 100;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-sm sm:p-4 p-0">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="relative w-full h-full sm:h-auto sm:max-w-lg bg-black sm:rounded-3xl overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent">
                        <button onClick={onClose} className="p-2 text-white/80 hover:text-white bg-black/20 rounded-full backdrop-blur-md">
                            <X className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-2">
                            {isRecording && (
                                <div className="flex items-center gap-2 bg-red-500/80 backdrop-blur-md px-3 py-1.5 rounded-full">
                                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                    <span className="text-white font-black text-xs tabular-nums">
                                        {elapsed}s / {maxDuration}s
                                    </span>
                                </div>
                            )}
                            {videoOnly && !isRecording && (
                                <span className="text-white/50 text-[9px] font-bold uppercase tracking-widest bg-white/10 px-2 py-1 rounded-full">
                                    No mic
                                </span>
                            )}
                            <span className="text-white font-bold text-sm tracking-widest uppercase shadow-black drop-shadow-md">
                                {title}
                            </span>
                        </div>
                        <div className="w-10" />
                    </div>

                    {/* Recording Progress Bar */}
                    {isRecording && (
                        <div className="absolute top-0 left-0 right-0 z-30 h-1 bg-white/10">
                            <motion.div
                                className="h-full bg-red-500"
                                initial={{ width: '0%' }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.3 }}
                            />
                        </div>
                    )}

                    {/* Content Area */}
                    <div className="flex-1 bg-black relative flex items-center justify-center overflow-hidden">
                        {error ? (
                            <div className="text-center p-8 text-white/70">
                                <div className="mb-4 flex flex-col items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-error/10 flex items-center justify-center text-error">
                                        <RefreshCw className="w-6 h-6" />
                                    </div>
                                    <p className="text-sm font-medium leading-relaxed max-w-[280px]">
                                        {error}
                                    </p>
                                </div>
                                <button
                                    onClick={() => startCamera()}
                                    className="px-8 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-105 transition-transform"
                                >
                                    Try Resetting Camera
                                </button>
                            </div>
                        ) : recordedVideoUrl ? (
                            <video
                                ref={previewVideoRef}
                                src={recordedVideoUrl}
                                className="w-full h-full object-contain"
                                controls
                                autoPlay
                                loop
                                playsInline
                                muted
                            />
                        ) : !isCameraActive && !isStarting ? (
                            <div className="flex flex-col items-center gap-4 p-8">
                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                    <Video className="w-8 h-8 text-white/20" />
                                </div>
                                <button
                                    onClick={() => startCamera()}
                                    className="px-8 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-105 transition-transform"
                                >
                                    Initialize Camera
                                </button>
                                <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium">
                                    {maxDuration}s max recording
                                </p>
                            </div>
                        ) : (
                            <div className="relative w-full h-full">
                                {isStarting && (
                                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black">
                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                            <RefreshCw className="w-8 h-8 text-white/40 animate-spin" />
                                        </div>
                                        <span className="text-white font-black uppercase tracking-widest text-sm animate-pulse">
                                            Launching Camera...
                                        </span>
                                        <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium">
                                            Awaiting hardware handshake
                                        </p>
                                    </div>
                                )}
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className={`w-full h-full object-cover ${isStarting ? 'opacity-0' : 'opacity-100'} transition-opacity`}
                                    style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
                                />
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="bg-black/90 p-6 sm:p-8 flex items-center justify-between gap-4">
                        {recordedVideoUrl ? (
                            <>
                                <button
                                    onClick={retakeVideo}
                                    className="flex-1 py-4 flex flex-col items-center gap-2 text-white/70 hover:text-white transition-colors"
                                >
                                    <RefreshCw className="w-6 h-6" />
                                    <span className="text-[10px] uppercase font-bold tracking-widest">Retake</span>
                                </button>
                                <button
                                    onClick={confirmVideo}
                                    className="flex-1 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                    Initialise Upload
                                </button>
                            </>
                        ) : isCameraActive ? (
                            <>
                                <div className="flex-1 flex justify-start">
                                    {hasMultipleCameras && !isRecording && (
                                        <button
                                            onClick={switchCamera}
                                            className="p-3 text-white/70 hover:text-white bg-white/10 rounded-full transition-all"
                                            title="Switch Camera"
                                        >
                                            <SwitchCamera className="w-6 h-6" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex-1 flex justify-center">
                                    {isRecording ? (
                                        <button
                                            onClick={stopRecording}
                                            className="w-16 h-16 rounded-full border-4 border-red-500 flex items-center justify-center relative group transition-all active:scale-95"
                                        >
                                            <Square className="w-6 h-6 text-red-500 fill-red-500" />
                                        </button>
                                    ) : (
                                        <button
                                            onClick={startRecording}
                                            className="w-16 h-16 rounded-full border-4 border-red-500 flex items-center justify-center relative group transition-all active:scale-95"
                                        >
                                            <div className="w-12 h-12 bg-red-500 rounded-full group-hover:bg-red-400 transition-colors animate-pulse" />
                                        </button>
                                    )}
                                </div>
                                <div className="flex-1 flex justify-end">
                                    {isRecording && (
                                        <span className="text-red-400 font-black text-xs uppercase tracking-widest self-center">
                                            REC
                                        </span>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="flex-1 text-center">
                                <span className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-black">
                                    {error ? '' : isStarting ? 'Establishing Secure Link...' : 'Waiting for hardware...'}
                                </span>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
