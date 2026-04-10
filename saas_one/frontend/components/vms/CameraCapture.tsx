/**
 * CameraCapture
 * Camera capture component for taking photos in the VMS visitor flow.
 * Activates device camera via getUserMedia, renders live video preview, captures
 * frame to canvas on demand. Returns data URL and raw Blob.
 * @remarks Client component.
 */

'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Camera, RotateCcw, Check } from 'lucide-react';

interface CameraCaptureProps {
    onCapture: (imageUrl: string, blob: Blob) => void;
    onCancel?: () => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onCancel }) => {
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const activeRequestId = useRef(0);

    // Stop camera
    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setIsCameraActive(false);
    }, []);

    // Start camera
    const startCamera = useCallback(async (isRetry = false) => {
        const requestId = ++activeRequestId.current;
        try {
            setError(null);
            setIsLoading(true);

            if (isRetry) {
                await new Promise(resolve => setTimeout(resolve, 800));
            }

            stopCamera();

            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: isRetry ? true : { facingMode: 'user', width: 640, height: 480 }
            });

            if (requestId !== activeRequestId.current) {
                mediaStream.getTracks().forEach(track => track.stop());
                return;
            }

            streamRef.current = mediaStream;
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
                videoRef.current.onloadedmetadata = async () => {
                    if (requestId === activeRequestId.current) {
                        try {
                            await videoRef.current?.play();
                            setIsCameraActive(true);
                        } catch (e) {
                            console.warn("Video play interrupted:", e);
                        }
                    }
                };
            }
        } catch (err: any) {
            if (requestId === activeRequestId.current) {
                console.error('Camera access error:', err);

                if (!isRetry && (err.name === 'AbortError' || err.name === 'NotReadableError')) {
                    setError("Hardware busy, retrying...");
                    setTimeout(() => startCamera(true), 500);
                    return;
                }

                setError(err.name === 'AbortError'
                    ? 'Camera hardware is busy. Please close other apps and try again.'
                    : 'Unable to access camera. Please allow permissions.');
            }
        } finally {
            if (requestId === activeRequestId.current) {
                setIsLoading(false);
            }
        }
    }, [stopCamera]);

    // Compress image to WebP format (< 50KB target)
    const compressImage = async (canvas: HTMLCanvasElement): Promise<Blob> => {
        return new Promise((resolve) => {
            let quality = 0.8;
            const tryCompress = () => {
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            if (blob.size > 50000 && quality > 0.1) {
                                quality -= 0.1;
                                tryCompress();
                            } else {
                                resolve(blob);
                            }
                        }
                    },
                    'image/webp',
                    quality
                );
            };
            tryCompress();
        });
    };

    // Capture photo
    const capturePhoto = async () => {
        if (!videoRef.current || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');

        if (!ctx || video.videoWidth === 0) return;

        canvas.width = 400;
        canvas.height = 400;

        const videoAspect = video.videoWidth / video.videoHeight;
        const canvasAspect = canvas.width / canvas.height;

        let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;

        if (videoAspect > canvasAspect) {
            sw = video.videoHeight * canvasAspect;
            sx = (video.videoWidth - sw) / 2;
        } else {
            sh = video.videoWidth / canvasAspect;
            sy = (video.videoHeight - sh) / 2;
        }

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

        const blob = await compressImage(canvas);
        const imageUrl = canvas.toDataURL('image/webp', 0.8);

        setCapturedImage(imageUrl);
        setCapturedBlob(blob);
        stopCamera();
    };

    const retakePhoto = () => {
        setCapturedImage(null);
        setCapturedBlob(null);
        // Don't auto-start camera, let user choose between Camera and Upload
    };

    const confirmPhoto = () => {
        if (capturedImage && capturedBlob) {
            onCapture(capturedImage, capturedBlob);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        try {
            const imageUrl = URL.createObjectURL(file);

            // For file uploads, we still want to process it through our compressor
            // to ensure it's a webp and under size limits if possible.
            const img = new Image();
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                // Simple square crop for uploaded images
                const size = Math.min(img.width, img.height);
                canvas.width = 400;
                canvas.height = 400;

                ctx.drawImage(
                    img,
                    (img.width - size) / 2,
                    (img.height - size) / 2,
                    size,
                    size,
                    0,
                    0,
                    400,
                    400
                );

                const blob = await compressImage(canvas);
                const dataUrl = canvas.toDataURL('image/webp', 0.8);

                setCapturedImage(dataUrl);
                setCapturedBlob(blob);
                stopCamera();
                setIsLoading(false);
            };
            img.src = imageUrl;
        } catch (err) {
            console.error('File upload error:', err);
            setError('Failed to process image');
            setIsLoading(false);
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cleanup only
    React.useEffect(() => {
        return () => stopCamera();
    }, [stopCamera]);

    return (
        <div className="w-full flex flex-col items-center">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
            />
            <div className="relative w-48 h-64 bg-slate-100 rounded-2xl overflow-hidden mb-4 shadow-sm border-2 border-dashed border-slate-300">
                {isLoading && !error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 bg-slate-100/80 backdrop-blur-sm">
                        <div className="w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                        <span className="text-[10px] text-slate-500 uppercase tracking-widest font-black">Processing...</span>
                    </div>
                )}

                {error && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center z-20 bg-slate-100">
                        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-3">
                            <RotateCcw className="w-5 h-5" />
                        </div>
                        <p className="text-[10px] uppercase font-bold text-slate-500 leading-relaxed mb-4">{error}</p>
                        <button
                            type="button"
                            onClick={() => startCamera()}
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-lg transition-colors"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {(capturedImage || error) ? null : (
                    <>
                        {!isCameraActive && !isLoading && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-400">
                                    <Camera className="w-6 h-6" />
                                </div>
                                <div className="flex flex-col gap-2 w-full px-6">
                                    <button
                                        type="button"
                                        onClick={() => startCamera()}
                                        className="w-full px-4 py-2 bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-900 transition-colors"
                                    >
                                        Start Camera
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full px-4 py-2 bg-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-slate-300 transition-colors"
                                    >
                                        Upload Photo
                                    </button>
                                </div>
                            </div>
                        )}
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted
                            className={`w-full h-full object-cover scale-x-[-1] ${isCameraActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                        />
                    </>
                )}

                {capturedImage && (
                    <img
                        src={capturedImage}
                        alt="Captured"
                        className="w-full h-full object-cover"
                    />
                )}
            </div>

            <canvas ref={canvasRef} className="hidden" />

            <div className="flex gap-3">
                {!capturedImage ? (
                    <button
                        type="button"
                        onClick={capturePhoto}
                        disabled={!isCameraActive || isLoading}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                        <Camera className="w-4 h-4" />
                        Capture
                    </button>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={retakePhoto}
                            className="flex items-center gap-2 px-4 py-3 bg-slate-100 text-slate-700 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-200 transition-all border border-slate-200"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Retake
                        </button>
                        <button
                            type="button"
                            onClick={confirmPhoto}
                            className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-emerald-700 transition-all shadow-md"
                        >
                            <Check className="w-4 h-4" />
                            Confirm
                        </button>
                    </>
                )}
            </div>

            {capturedBlob && (
                <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mt-3">
                    Optimized · {(capturedBlob.size / 1024).toFixed(1)} KB
                </p>
            )}
        </div>
    );
};

export default CameraCapture;
