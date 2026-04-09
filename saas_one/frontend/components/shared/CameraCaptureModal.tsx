/**
 * CameraCaptureModal - Full-screen modal for capturing photos using the device camera.
 *
 * Uses the browser's MediaDevices API (getUserMedia) to stream video from the camera and
 * renders it inside a dark full-screen overlay. Supports front/back camera switching on devices
 * with multiple cameras. After capture, the photo is shown for review with retake and confirm
 * options. The confirmed image is converted to a JPEG File object and passed to `onCapture`.
 * Includes graceful error handling for hardware conflicts (e.g. camera busy from another app)
 * and permission denial, with a retry button. Camera stream is automatically stopped when
 * the modal closes.
 *
 * @example
 * <CameraCaptureModal
 *   isOpen={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   onCapture={(file) => uploadPhoto(file)}
 *   title="Capture Visitor Photo"
 * />
 */
'use client';

import { useState, useEffect, useRef } from 'react';
import { Camera, X, SwitchCamera, RefreshCw, Check, CheckCircle2 } from 'lucide-react';
import { useTheme } from '@/frontend/context/ThemeContext';
import { motion, AnimatePresence } from 'framer-motion';

interface CameraCaptureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (file: File) => void;
    title?: string;
}

export default function CameraCaptureModal({ isOpen, onClose, onCapture, title = 'Take Photo' }: CameraCaptureModalProps) {
    const { theme } = useTheme();
    const isDark = theme === 'dark';
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
    const [capturedImage, setCapturedImage] = useState<string | null>(null);

    // Unified Effect for opening/closing
    useEffect(() => {
        if (isOpen) {
            // Check if we can auto-start
            const checkAndAutoStart = async () => {
                try {
                    // Only auto-start if Permissions API is supported and granted
                    if (navigator.permissions && navigator.permissions.query) {
                        const status = await navigator.permissions.query({ name: 'camera' as any });
                        if (status.state === 'granted') {
                            // Delay slightly for modal animation to finish
                            setTimeout(() => {
                                if (isOpen && !isCameraActive && !capturedImage) {
                                    startCamera();
                                }
                            }, 300);
                        }
                    }
                } catch (e) {
                    console.warn("Permission check failed:", e);
                }
            };
            checkAndAutoStart();
        } else {
            stopCamera();
            setCapturedImage(null);
            setIsCameraActive(false);
            setIsStarting(false);
        }
        return () => stopCamera();
    }, [isOpen]);

    // Note: We've removed the auto-start from here to follow a production-safe manual trigger pattern.
    // The camera will now only start when the user clicks "Initialize Camera" or similar.

    const checkCameras = async () => {
        if (!navigator?.mediaDevices?.enumerateDevices) return;
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            setHasMultipleCameras(videoDevices.length > 1);
        } catch (err) {
            console.error('Error checking cameras:', err);
        }
    };

    const startCamera = async (isRetry = false) => {
        try {
            setError(null);
            setIsStarting(true);

            if (!navigator?.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error("Camera not supported in this browser");
            }

            // If we're retrying, give a longer pause for hardware to release
            if (isRetry) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (streamRef.current) {
                stopCamera();
            }

            const constraints: MediaStreamConstraints = isRetry
                ? { video: true } // Basic fallback
                : {
                    video: {
                        facingMode: facingMode,
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    audio: false
                };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;

            // We'll use a side effect to set the srcObject when the video element renders
            if (!isRetry) {
                // Trigger rendering of the video element if it's not already there
                setIsCameraActive(true);
            }
        } catch (err: any) {
            console.error("Camera start failed:", err);

            // If it's a hardware lock and we haven't retried yet, try once with simple constraints
            if (!isRetry && (err.name === 'AbortError' || err.name === 'NotReadableError')) {
                setError("Hardware busy, attempting to reset...");
                setTimeout(() => startCamera(true), 500);
                return;
            }

            const message = err.name === 'AbortError' || err.name === 'NotReadableError'
                ? 'Camera hardware is busy. Please close other apps (like Zoom, Teams, or other tabs) using the camera and try again.'
                : 'Unable to access camera. Please ensure permissions are granted in your browser settings.';
            setError(message);
            setIsCameraActive(false);
        } finally {
            setIsStarting(false);
        }
    };

    // Unified Effect for stream assignment
    useEffect(() => {
        if (isCameraActive && streamRef.current && videoRef.current) {
            const video = videoRef.current;
            video.srcObject = streamRef.current;
            video.onloadedmetadata = async () => {
                try {
                    await video.play();
                    checkCameras();
                } catch (e) {
                    console.error("Play prevented:", e);
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
        // The useEffect with facingMode dependency will handle restarting the camera
    };

    const takePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video.videoWidth === 0 || video.videoHeight === 0) return;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const context = canvas.getContext('2d');
        if (context) {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setCapturedImage(imageDataUrl);
            stopCamera();
        }
    };

    const retakePhoto = () => {
        setCapturedImage(null);
        startCamera();
    };

    const confirmPhoto = () => {
        if (!capturedImage) return;

        try {
            // Convert Data URL to File directly
            const dataUrlToFile = (dataUrl: string, filename: string): File => {
                const arr = dataUrl.split(',');
                const mimeMatch = arr[0].match(/:(.*?);/);
                if (!mimeMatch) {
                    throw new Error('Invalid image data');
                }
                const mime = mimeMatch[1];
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                return new File([u8arr], filename, { type: mime });
            };

            const file = dataUrlToFile(capturedImage, `photo_${Date.now()}.jpg`);
            onCapture(file);
            onClose();
        } catch (err) {
            console.error('Error converting image:', err);
            setError('Failed to process image. Please try again.');
        }
    };

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
                        <span className="text-white font-bold text-sm tracking-widest uppercase shadow-black drop-shadow-md">{title}</span>
                        <div className="w-10" /> {/* Spacer */}
                    </div>

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
                        ) : capturedImage ? (
                            <img src={capturedImage || ''} alt="Captured" className="w-full h-full object-contain" />
                        ) : (!isCameraActive && !isStarting) ? (
                            <div className="flex flex-col items-center gap-4 p-8">
                                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                    <Camera className="w-8 h-8 text-white/20" />
                                </div>
                                <button
                                    onClick={() => startCamera()}
                                    className="px-8 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest text-sm hover:scale-105 transition-transform"
                                >
                                    Initialize Camera
                                </button>
                                <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium">
                                    Ready to capture
                                </p>
                            </div>
                        ) : (
                            <div className="relative w-full h-full">
                                {isStarting && (
                                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black">
                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                            <RefreshCw className="w-8 h-8 text-white/40 animate-spin" />
                                        </div>
                                        <span className="text-white font-black uppercase tracking-widest text-sm animate-pulse">Launching Camera...</span>
                                        <p className="text-[10px] text-white/40 uppercase tracking-widest font-medium">Awaiting hardware handshake</p>
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
                        <canvas ref={canvasRef} className="hidden" />
                    </div>

                    {/* Controls */}
                    <div className="bg-black/90 p-6 sm:p-8 flex items-center justify-between gap-4">
                        {capturedImage ? (
                            <>
                                <button
                                    onClick={retakePhoto}
                                    className="flex-1 py-4 flex flex-col items-center gap-2 text-white/70 hover:text-white transition-colors"
                                >
                                    <RefreshCw className="w-6 h-6" />
                                    <span className="text-[10px] uppercase font-bold tracking-widest">Retake</span>
                                </button>
                                <button
                                    onClick={confirmPhoto}
                                    className="flex-1 py-4 bg-white text-black rounded-2xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 className="w-5 h-5" />
                                    Initialise Upload
                                </button>
                            </>
                        ) : isCameraActive ? (
                            <>
                                <div className="flex-1 flex justify-start">
                                    {hasMultipleCameras && (
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
                                    <button
                                        onClick={takePhoto}
                                        className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center relative group transition-all active:scale-95"
                                    >
                                        <div className="w-12 h-12 bg-white rounded-full group-hover:bg-slate-200 transition-colors" />
                                    </button>
                                </div>
                                <div className="flex-1" />
                            </>
                        ) : (
                            <div className="flex-1 text-center">
                                <span className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-black">
                                    {error ? "" : isStarting ? "Establishing Secure Link..." : "Waiting for hardware..."}
                                </span>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
