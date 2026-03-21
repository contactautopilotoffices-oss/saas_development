'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, AlertCircle, Loader2, Camera, ImagePlus, Keyboard, CheckCircle2, QrCode } from 'lucide-react';

export type QRScanResult =
    | { type: 'checklist'; templateId: string }
    | { type: 'stock'; itemId: string; raw: string }
    | { type: 'barcode'; value: string }
    | { type: 'unknown'; raw: string };

interface UniversalQRScannerModalProps {
    onResult: (result: QRScanResult) => void;
    onClose: () => void;
    title?: string;
}

type ScanMode = 'camera' | 'gallery' | 'manual';

function detectQRType(decoded: string): QRScanResult {
    const checklistMatch = decoded.match(/\/checklist\/([a-zA-Z0-9_-]+)/);
    if (checklistMatch) return { type: 'checklist', templateId: checklistMatch[1] };

    try {
        const parsed = JSON.parse(decoded);
        if (parsed?.item_id) return { type: 'stock', itemId: parsed.item_id, raw: decoded };
    } catch { /* not JSON */ }

    if (!decoded.startsWith('http') && decoded.length > 2) return { type: 'barcode', value: decoded };

    return { type: 'unknown', raw: decoded };
}

const SCANNER_ID = 'universal-qr-scanner-region';

const FORMATS = [
    Html5QrcodeSupportedFormats.QR_CODE,
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.DATA_MATRIX,
];

export default function UniversalQRScannerModal({
    onResult,
    onClose,
    title = 'Universal Scanner'
}: UniversalQRScannerModalProps) {
    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isMounted = useRef(true);
    const isTransitioningRef = useRef(false);
    const hasResultRef = useRef(false);

    const [scanMode, setScanMode] = useState<ScanMode>('camera');
    const [cameraActive, setCameraActive] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [galleryProcessing, setGalleryProcessing] = useState(false);
    const [manualInput, setManualInput] = useState('');
    const [detected, setDetected] = useState<{ label: string } | null>(null);

    const stopCamera = useCallback(async () => {
        if (html5QrCodeRef.current) {
            try {
                if (html5QrCodeRef.current.isScanning) await html5QrCodeRef.current.stop();
                await html5QrCodeRef.current.clear();
            } catch { /* ignore */ }
            html5QrCodeRef.current = null;
            setCameraActive(false);
        }
    }, []);

    const handleClose = useCallback(async () => {
        await stopCamera();
        onClose();
    }, [stopCamera, onClose]);

    const handleDecoded = useCallback(async (decoded: string) => {
        if (hasResultRef.current) return;
        hasResultRef.current = true;

        const result = detectQRType(decoded);
        const label =
            result.type === 'checklist' ? 'Checklist detected — opening...' :
            result.type === 'stock' ? 'Stock item detected — opening...' :
            result.type === 'barcode' ? `Barcode: ${result.value}` :
            'QR scanned — opening...';

        setDetected({ label });
        await stopCamera();
        setTimeout(() => { if (isMounted.current) onResult(result); }, 500);
    }, [stopCamera, onResult]);

    const getScanner = useCallback(() => {
        const container = document.getElementById(SCANNER_ID);
        if (!container) return null;
        if (!html5QrCodeRef.current) {
            html5QrCodeRef.current = new Html5Qrcode(SCANNER_ID, {
                formatsToSupport: FORMATS,
                verbose: false,
            });
        }
        return html5QrCodeRef.current;
    }, []);

    const startCamera = async (isRetry = false) => {
        if (cameraActive || !isMounted.current) return;

        const checkContainer = async (retries = 15): Promise<boolean> => {
            if (!isMounted.current) return false;
            const el = document.getElementById(SCANNER_ID);
            if (el && el.clientWidth > 0) return true;
            if (retries <= 0) return false;
            await new Promise(r => setTimeout(r, 100));
            return checkContainer(retries - 1);
        };

        const ready = await checkContainer();
        if (!ready || !isMounted.current) return;

        const scanner = getScanner();
        if (!scanner) return;

        try {
            setLoading(true);
            setError(null);
            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 60,
                    qrbox: (w: number, h: number) => {
                        const size = Math.max(220, Math.min(w, h) * 0.75);
                        return { width: size, height: size };
                    },
                    aspectRatio: 1.0,
                    disableFlip: true,
                },
                (decoded) => handleDecoded(decoded),
                () => {}
            );
            setCameraActive(true);
            setLoading(false);
        } catch (err: any) {
            const msg = err?.message || '';
            if (!isRetry && msg.toLowerCase().includes('transition')) {
                try { await html5QrCodeRef.current?.stop().catch(() => {}); html5QrCodeRef.current?.clear(); } catch {}
                html5QrCodeRef.current = null;
                setCameraActive(false);
                await new Promise(r => setTimeout(r, 400));
                if (isMounted.current) await startCamera(true);
                return;
            }
            if (isMounted.current) setError('Camera access denied or unavailable.');
            setLoading(false);
            setCameraActive(false);
        }
    };

    useEffect(() => {
        const sync = async () => {
            if (isTransitioningRef.current) return;
            isTransitioningRef.current = true;
            try {
                await stopCamera();
                if (scanMode === 'camera' && isMounted.current) {
                    await new Promise(r => setTimeout(r, 200));
                    if (isMounted.current) await startCamera();
                }
            } finally {
                if (isMounted.current) isTransitioningRef.current = false;
            }
        };
        sync();
    }, [scanMode]);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (html5QrCodeRef.current) {
                if (html5QrCodeRef.current.isScanning) html5QrCodeRef.current.stop().catch(() => {});
                html5QrCodeRef.current.clear();
                html5QrCodeRef.current = null;
            }
        };
    }, []);

    const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || galleryProcessing) return;

        setGalleryProcessing(true);
        setError(null);
        await stopCamera();

        const previewUrl = URL.createObjectURL(file);

        try {
            // Try native BarcodeDetector first
            if ('BarcodeDetector' in window) {
                try {
                    const formats = await (window as any).BarcodeDetector.getSupportedFormats();
                    const detector = new (window as any).BarcodeDetector({
                        formats: formats.length > 0 ? formats : ['qr_code', 'code_128', 'ean_13'],
                    });
                    const img = new Image();
                    img.src = previewUrl;
                    await new Promise(r => img.onload = r);
                    const barcodes = await detector.detect(img);
                    if (barcodes.length > 0) {
                        handleDecoded(barcodes[0].rawValue.trim());
                        return;
                    }
                } catch { /* fallback */ }
            }

            // Fallback: html5-qrcode with multi-pass image processing
            const processImage = async (pass: 'normal' | 'high-contrast' | 'upscale'): Promise<File> => {
                return new Promise<File>((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        let w = img.width, h = img.height;
                        if (pass === 'upscale') {
                            const MIN = 1200;
                            if (Math.max(w, h) < MIN) { const r = MIN / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
                        } else {
                            const MAX = 1600;
                            if (Math.max(w, h) > MAX) { const r = MAX / Math.max(w, h); w = Math.round(w * r); h = Math.round(h * r); }
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w; canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            if (pass === 'high-contrast') ctx.filter = 'grayscale(100%) contrast(200%) brightness(120%)';
                            ctx.fillStyle = 'white';
                            ctx.fillRect(0, 0, w, h);
                            ctx.drawImage(img, 0, 0, w, h);
                        }
                        canvas.toBlob(b => resolve(new File([b || file], `scan.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.95);
                    };
                    img.onerror = () => resolve(file);
                    img.src = previewUrl;
                });
            };

            const scanner = getScanner();
            if (!scanner) throw new Error('Scanner unavailable');

            // Try raw file first (preserves original quality), then processed versions
            const passes: Array<() => Promise<File>> = [
                () => Promise.resolve(file),
                () => processImage('normal'),
                () => processImage('high-contrast'),
                () => processImage('upscale'),
            ];
            let lastErr: unknown;
            for (const getFile of passes) {
                try {
                    const result = await scanner.scanFile(await getFile(), false);
                    handleDecoded(result.trim());
                    return;
                } catch (e) { lastErr = e; }
            }
            throw lastErr;
        } catch {
            setError('Could not detect a QR code. Try a clearer photo or use Manual ID.');
        } finally {
            setGalleryProcessing(false);
            URL.revokeObjectURL(previewUrl);
        }
    };

    const handleManualSubmit = () => {
        const val = manualInput.trim();
        if (!val) return;
        handleDecoded(val);
    };

    return (
        <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-lg"
            onClick={handleClose}
        >
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden mx-4"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-100 rounded-2xl flex items-center justify-center">
                            <QrCode size={20} className="text-indigo-600" />
                        </div>
                        <h2 className="text-xl font-extrabold text-gray-900 tracking-tight">{title}</h2>
                    </div>
                    <button onClick={handleClose} className="p-2.5 hover:bg-gray-100 rounded-2xl transition-all">
                        <X size={22} className="text-gray-400" />
                    </button>
                </div>

                {/* Mode Tabs */}
                <div className="flex gap-1.5 p-1.5 mx-6 mt-4 bg-gray-100/80 rounded-2xl">
                    {([
                        { mode: 'camera', icon: Camera, label: 'Camera Scan' },
                        { mode: 'gallery', icon: ImagePlus, label: 'Photo Upload' },
                        { mode: 'manual', icon: Keyboard, label: 'Manual ID' },
                    ] as const).map(({ mode, icon: Icon, label }) => (
                        <button
                            key={mode}
                            onClick={() => { setScanMode(mode); setError(null); setDetected(null); hasResultRef.current = false; }}
                            className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl transition-all ${scanMode === mode ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Icon size={20} />
                            <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                    {/* Error */}
                    {error && (
                        <div className="mb-4 bg-rose-50 border border-rose-100 rounded-2xl p-4 flex gap-3">
                            <AlertCircle size={20} className="text-rose-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-rose-700 font-medium">{error}</p>
                        </div>
                    )}

                    {/* Detected success banner */}
                    {detected && (
                        <div className="mb-4 bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex gap-3">
                            <CheckCircle2 size={20} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                            <p className="text-sm text-emerald-700 font-semibold">{detected.label}</p>
                        </div>
                    )}

                    {/* Camera — always in DOM for lifecycle stability, hidden when not active */}
                    <div className={`${scanMode === 'camera' ? 'block' : 'hidden'} space-y-4`}>
                        <div className="relative group">
                            {loading && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/80 rounded-3xl backdrop-blur-[2px]">
                                    <div className="text-center">
                                        <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-3" />
                                        <p className="text-gray-500 text-sm font-semibold">Readying Camera...</p>
                                    </div>
                                </div>
                            )}
                            <div
                                id={SCANNER_ID}
                                className="rounded-3xl overflow-hidden border-4 border-gray-100 shadow-inner aspect-square"
                            />
                        </div>
                        <p className="text-sm font-bold text-gray-400 text-center">
                            Point camera at any QR code or barcode
                        </p>
                    </div>

                    {/* Gallery */}
                    {scanMode === 'gallery' && (
                        <div className="space-y-4">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-300 rounded-3xl p-10 flex flex-col items-center gap-4 transition-all bg-indigo-50/30 group"
                            >
                                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                    <ImagePlus size={32} className="text-indigo-600" />
                                </div>
                                <div className="text-center">
                                    <p className="font-extrabold text-gray-800">Choose from Photos</p>
                                    <p className="text-xs text-gray-400 mt-1">Upload an image with a clear QR code or barcode</p>
                                </div>
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleGallerySelect} className="hidden" />
                            {galleryProcessing && (
                                <div className="flex items-center justify-center p-4 bg-gray-50 rounded-2xl gap-2">
                                    <Loader2 size={20} className="animate-spin text-indigo-500" />
                                    <span className="text-sm font-bold text-gray-500">Scanning Image...</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Manual */}
                    {scanMode === 'manual' && (
                        <div className="space-y-4">
                            <input
                                type="text"
                                value={manualInput}
                                onChange={e => setManualInput(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                                placeholder="Enter QR value, URL, or barcode..."
                                className="w-full px-5 py-5 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 outline-none text-gray-900 font-bold placeholder:text-gray-300 transition-all shadow-sm"
                            />
                            <button
                                onClick={handleManualSubmit}
                                disabled={!manualInput.trim()}
                                className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                Open
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
