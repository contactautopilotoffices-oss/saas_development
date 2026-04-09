/**
 * BarcodeScannerModal
 * Camera-based barcode scanner for stock item lookup.
 * @remarks Client component.
 */

'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Scan, AlertCircle, Loader2, Camera, ImagePlus, Keyboard, CheckCircle2, Boxes, ArrowBigDown, ArrowBigUp, RefreshCw, QrCode } from 'lucide-react';
import { useParams } from 'next/navigation';

interface BarcodeScannerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onScanSuccess?: (barcode: string, format: string) => void;
    title?: string;
}

type ScanMode = 'camera' | 'gallery' | 'manual';

interface IdentifiedItem {
    id: string;
    item_code: string;
    name: string;
    quantity: number;
    category?: string;
    unit?: string;
    barcode?: string;
}

export default function BarcodeScannerModal({
    isOpen,
    onClose,
    onScanSuccess,
    title = 'Inventory Scanner'
}: BarcodeScannerModalProps) {
    const params = useParams();
    const propertyId = params?.propertyId as string;

    const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [manualInput, setManualInput] = useState('');
    const [scanMode, setScanMode] = useState<ScanMode>('camera');
    const [cameraActive, setCameraActive] = useState(false);
    const [galleryProcessing, setGalleryProcessing] = useState(false);
    const [galleryPreview, setGalleryPreview] = useState<string | null>(null);
    const isTransitioningRef = useRef(false);
    const isMounted = useRef(true);

    // Identification & Update States
    const [identifiedItem, setIdentifiedItem] = useState<IdentifiedItem | null>(null);
    const [action, setAction] = useState<'IN' | 'OUT'>('IN');
    const [quantity, setQuantity] = useState(1);
    const [isUpdatingStock, setIsUpdatingStock] = useState(false);

    const SCANNER_ID = 'barcode-scanner-region';

    const stopCamera = useCallback(async () => {
        if (html5QrCodeRef.current) {
            try {
                if (html5QrCodeRef.current.isScanning) {
                    await html5QrCodeRef.current.stop();
                }
                await html5QrCodeRef.current.clear();
            } catch (err: any) {
                console.warn('Error during camera stop/clear:', err);
            } finally {
                html5QrCodeRef.current = null;
                setCameraActive(false);
            }
        }
    }, []);

    const handleClose = useCallback(async () => {
        await stopCamera();
        if (html5QrCodeRef.current) {
            try {
                html5QrCodeRef.current.clear();
            } catch (e) { /* ignore */ }
            html5QrCodeRef.current = null;
        }
        setError(null);
        setManualInput('');
        setScanMode('camera');
        setGalleryPreview(null);
        setGalleryProcessing(false);
        setIdentifiedItem(null);
        onClose();
    }, [stopCamera, onClose]);

    const fetchItemByBarcode = async (barcode: string) => {
        try {
            setLoading(true);
            const res = await fetch(`/api/properties/${propertyId}/stock/items?barcode=${barcode}`);
            const data = await res.json();

            if (data.success && data.items.length > 0) {
                if (onScanSuccess) {
                    onScanSuccess(barcode, 'unknown');
                    handleClose();
                } else {
                    setIdentifiedItem(data.items[0]);
                    await stopCamera();
                }
            } else {
                setError(`No item found for code: ${barcode}`);
            }
        } catch (err) {
            setError('Failed to fetch item details.');
        } finally {
            setLoading(false);
        }
    };

    // Initialize or get the Html5Qrcode instance
    const getScanner = useCallback(() => {
        if (!isOpen) return null;

        const container = document.getElementById(SCANNER_ID);
        if (!container) return null;

        if (!html5QrCodeRef.current) {
            html5QrCodeRef.current = new Html5Qrcode(SCANNER_ID, {
                formatsToSupport: [
                    Html5QrcodeSupportedFormats.QR_CODE,
                    Html5QrcodeSupportedFormats.CODE_128,
                    Html5QrcodeSupportedFormats.CODE_39,
                    Html5QrcodeSupportedFormats.EAN_13,
                    Html5QrcodeSupportedFormats.EAN_8,
                    Html5QrcodeSupportedFormats.UPC_A,
                    Html5QrcodeSupportedFormats.ITF,
                    Html5QrcodeSupportedFormats.DATA_MATRIX
                ],
                verbose: false
            });
        }
        return html5QrCodeRef.current;
    }, [isOpen]);

    const startCamera = async (isRetry = false) => {
        if (cameraActive || identifiedItem || !isOpen) return;

        // Robust recursive check for container dimensions
        const checkContainer = async (retries = 15): Promise<boolean> => {
            if (!isMounted.current || !isOpen) return false;
            const container = document.getElementById(SCANNER_ID);
            if (container && container.clientWidth > 0) return true;
            if (retries <= 0) return false;
            await new Promise(r => setTimeout(r, 100));
            return checkContainer(retries - 1);
        };

        const isReady = await checkContainer();
        if (!isReady || !isMounted.current) {
            console.warn('Scanner container not ready/mounted after retries');
            return;
        }

        const scanner = getScanner();
        if (!scanner) return;

        const scanConfig = {
            fps: 60,
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
                const minDim = Math.min(viewfinderWidth, viewfinderHeight);
                const size = Math.max(250, minDim * 0.75);
                return { width: size, height: size };
            },
            aspectRatio: 1.0,
            disableFlip: true
        };

        const onSuccess = (decodedText: string) => {
            const code = decodedText.trim();
            if (onScanSuccess) {
                onScanSuccess(code, 'unknown');
                handleClose();
            } else {
                fetchItemByBarcode(code);
            }
        };

        try {
            setLoading(true);
            setError(null);
            await scanner.start({ facingMode: 'environment' }, scanConfig, onSuccess, () => { });
            setCameraActive(true);
            setLoading(false);
        } catch (err: any) {
            const msg: string = err?.message || err?.toString() || '';
            // Html5Qrcode internal state machine conflict — destroy instance and retry once
            if (!isRetry && msg.toLowerCase().includes('transition')) {
                console.warn('[Scanner] Transition conflict detected, resetting instance and retrying...');
                try {
                    await html5QrCodeRef.current?.stop().catch(() => { });
                    html5QrCodeRef.current?.clear();
                } catch { /* ignore cleanup errors */ }
                html5QrCodeRef.current = null;
                setCameraActive(false);
                await new Promise(r => setTimeout(r, 400));
                if (isMounted.current && isOpen) await startCamera(true);
                return;
            }
            console.error('Failed to start camera:', err);
            if (scanMode === 'camera' && isOpen) {
                setError('Camera access denied or busy.');
            }
            setLoading(false);
            setCameraActive(false);
        }
    };

    // Handle mode switches and initialization
    useEffect(() => {
        if (!isOpen) return;

        const syncScanner = async () => {
            if (isTransitioningRef.current) return;
            isTransitioningRef.current = true;

            try {
                // Always ensure a clean slate when switching modes
                await stopCamera();

                if (scanMode === 'camera' && isMounted.current) {
                    // Give extra time for React to render/update the SCANNER_ID div
                    await new Promise(r => setTimeout(r, 200));
                    if (isMounted.current && isOpen) await startCamera();
                }
            } finally {
                if (isMounted.current) isTransitioningRef.current = false;
            }
        };

        syncScanner();
    }, [scanMode, isOpen, stopCamera]);

    // Cleanup on unmount
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            if (html5QrCodeRef.current) {
                if (html5QrCodeRef.current.isScanning) {
                    html5QrCodeRef.current.stop().catch(() => { });
                }
                html5QrCodeRef.current.clear();
                html5QrCodeRef.current = null;
            }
        };
    }, []);

    // Handle manual input auto-identification
    useEffect(() => {
        if (scanMode === 'manual' && manualInput.length >= 8) {
            const timer = setTimeout(() => {
                fetchItemByBarcode(manualInput);
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [manualInput, scanMode]);

    const handleStockUpdate = async () => {
        if (!identifiedItem) return;

        setIsUpdatingStock(true);
        setError(null);

        try {
            const res = await fetch(`/api/properties/${propertyId}/stock/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: identifiedItem.id,
                    action: action.toLowerCase(),
                    quantity,
                    notes: `Scanned via ${scanMode.toUpperCase()} mode`
                })
            });

            const data = await res.json();

            if (data.success) {
                // Success feedback
                setIdentifiedItem(null);
                if (onScanSuccess) onScanSuccess(identifiedItem.barcode || identifiedItem.id, scanMode.toUpperCase());
                handleClose();
            } else {
                setError(data.error || 'Update failed');
            }
        } catch (err) {
            setError('Network error updating stock.');
        } finally {
            setIsUpdatingStock(false);
        }
    };

    const handleGallerySelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || galleryProcessing) return;

        setGalleryProcessing(true);
        setError(null);
        setGalleryPreview(null);

        // Crucial: Stop camera before starting file scan to avoid instance collision
        await stopCamera();

        const previewUrl = URL.createObjectURL(file);
        setGalleryPreview(previewUrl);

        try {
            // STEP 1: Try Native BarcodeDetector API (Ultra-fast, robust fallback for 1D)
            if ('BarcodeDetector' in window) {
                try {
                    const formats = await (window as any).BarcodeDetector.getSupportedFormats();
                    const detector = new (window as any).BarcodeDetector({
                        formats: formats.length > 0 ? formats : ['code_128', 'qr_code', 'ean_13']
                    });

                    const img = new Image();
                    img.src = previewUrl;
                    await new Promise((resolve) => img.onload = resolve);

                    const barcodes = await detector.detect(img);
                    if (barcodes.length > 0) {
                        fetchItemByBarcode(barcodes[0].rawValue.trim());
                        return;
                    }
                } catch (nativeErr) {
                    console.warn('Native BarcodeDetector failed, falling back to html5-qrcode');
                }
            }

            // STEP 2: Fallback to html5-qrcode with optimized image
            // Always get/create a fresh scanner instance for gallery scan
            await stopCamera(); // Double insurance
            const scanner = getScanner();
            if (!scanner) throw new Error('Could not initialize scanner for gallery');

            const processImage = async (pass: 'normal' | 'high-contrast'): Promise<File> => {
                return new Promise<File>((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        const MAX_EDGE = 1600; // Increased for better 1D detail
                        let width = img.width;
                        let height = img.height;
                        if (width > height ? width > MAX_EDGE : height > MAX_EDGE) {
                            const ratio = MAX_EDGE / Math.max(width, height);
                            width *= ratio;
                            height *= ratio;
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        if (ctx) {
                            if (pass === 'high-contrast') {
                                // Grayscale + Contrast Boost
                                ctx.filter = 'grayscale(100%) contrast(200%) brightness(120%)';
                            }
                            ctx.fillStyle = 'white';
                            ctx.fillRect(0, 0, width, height);
                            ctx.drawImage(img, 0, 0, width, height);
                        }
                        canvas.toBlob((b) => {
                            const processedFile = new File([b || file], `scan_${pass}.jpg`, { type: 'image/jpeg' });
                            resolve(processedFile);
                        }, 'image/jpeg', 0.95);
                    };
                    img.onerror = () => resolve(file);
                    img.src = previewUrl;
                });
            };

            // PASS 1: Normal processing
            const normalFile = await processImage('normal');
            try {
                const result = await scanner.scanFile(normalFile, true);
                const code = result.trim();
                if (onScanSuccess) {
                    onScanSuccess(code, 'unknown');
                    handleClose();
                } else {
                    fetchItemByBarcode(code);
                }
                return;
            } catch (err) {
                console.warn('First scan pass failed, trying high-contrast pass...');

                // PASS 2: High-contrast fallback (better for 1D barcodes in poor lighting)
                const highContrastFile = await processImage('high-contrast');
                const result = await scanner.scanFile(highContrastFile, true);
                const secondCode = result.trim();

                if (onScanSuccess) {
                    onScanSuccess(secondCode, 'unknown');
                    handleClose();
                } else {
                    fetchItemByBarcode(secondCode);
                }
            }
        } catch (err) {
            console.error('Gallery scan error:', err);
            setError('Could not detect any QR code. Try a clearer photo or use Manual ID.');
        } finally {
            setGalleryProcessing(false);
            URL.revokeObjectURL(previewUrl);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-lg" onClick={handleClose}>
            <div
                className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden mx-4"
                onClick={(e) => e.stopPropagation()}
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

                {!identifiedItem ? (
                    <>
                        {/* Mode Tabs */}
                        <div className="flex gap-1.5 p-1.5 mx-6 mt-4 bg-gray-100/80 rounded-2xl">
                            <button
                                onClick={() => setScanMode('camera')}
                                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl transition-all ${scanMode === 'camera' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Camera size={20} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Camera Scan</span>
                            </button>
                            <button
                                onClick={() => setScanMode('gallery')}
                                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl transition-all ${scanMode === 'gallery' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <ImagePlus size={20} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Photo Upload</span>
                            </button>
                            <button
                                onClick={() => setScanMode('manual')}
                                className={`flex-1 flex flex-col items-center justify-center gap-1 py-3 rounded-xl transition-all ${scanMode === 'manual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Keyboard size={20} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Manual ID</span>
                            </button>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                            {error && (
                                <div className="mb-4 bg-rose-50 border border-rose-100 rounded-2xl p-4 flex gap-3 animate-in fade-in slide-in-from-top-2">
                                    <AlertCircle size={20} className="text-rose-500 flex-shrink-0" />
                                    <p className="text-sm text-rose-700 font-medium">{error}</p>
                                </div>
                            )}

                            {/* Scanner Container - Always kept in DOM for lifecycle stability, but hidden when not in camera mode */}
                            <div className={`${scanMode === 'camera' ? 'block' : 'hidden'} space-y-6`}>
                                <div className="relative group">
                                    {loading && (
                                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-50/80 rounded-3xl backdrop-blur-[2px]">
                                            <div className="text-center">
                                                <Loader2 size={32} className="animate-spin text-indigo-600 mx-auto mb-3" />
                                                <p className="text-gray-500 text-sm font-semibold">Readying Camera...</p>
                                            </div>
                                        </div>
                                    )}
                                    <div id={SCANNER_ID} className="rounded-3xl overflow-hidden border-4 border-gray-100 shadow-inner aspect-square" />
                                    <div className="mt-6 text-center">
                                        <p className="text-sm font-bold text-gray-400">Position the QR code within the square</p>
                                    </div>
                                </div>
                            </div>

                            {scanMode === 'gallery' && (
                                <div className="space-y-4">
                                    <button
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full border-2 border-dashed border-indigo-200 hover:border-indigo-50 rounded-3xl p-10 flex flex-col items-center gap-4 transition-all bg-indigo-50/30 group"
                                    >
                                        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                            <ImagePlus size={32} className="text-indigo-600" />
                                        </div>
                                        <div className="text-center">
                                            <p className="font-extrabold text-gray-800">Choose from Photos</p>
                                            <p className="text-xs text-gray-400 mt-1">Upload an image with a clear QR code</p>
                                        </div>
                                    </button>
                                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleGallerySelect} className="hidden" />
                                    {galleryProcessing && (
                                        <div className="flex items-center justify-center p-4 bg-gray-50 rounded-2xl">
                                            <Loader2 size={20} className="animate-spin text-indigo-500 mr-2" />
                                            <span className="text-sm font-bold text-gray-500">Scanning Image...</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {scanMode === 'manual' && (
                                <div className="space-y-4">
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={manualInput}
                                            onChange={(e) => setManualInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && fetchItemByBarcode(manualInput)}
                                            placeholder="Enter item code or scanner ID..."
                                            className="w-full px-5 py-5 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-indigo-500 focus:ring-0 outline-none text-gray-900 font-bold placeholder:text-gray-300 transition-all shadow-sm"
                                        />
                                    </div>
                                    <button
                                        onClick={() => fetchItemByBarcode(manualInput)}
                                        disabled={!manualInput.trim() || loading}
                                        className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98] transition-all disabled:opacity-50"
                                    >
                                        Identify Item
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    /* Identification Success UI (Same as before) */
                    <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 animate-in zoom-in-95 duration-200">
                        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-3xl p-6 border border-white shadow-sm">
                            <div className="flex items-start gap-4">
                                <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-md">
                                    <Boxes size={32} className="text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1 block">Item Found</span>
                                    <h3 className="text-xl font-black text-gray-900 truncate uppercase tracking-tight leading-tight">{identifiedItem.name}</h3>
                                    <div className="flex gap-2 mt-2">
                                        <span className="bg-white/80 px-2 py-1 rounded-lg text-[10px] font-bold text-gray-500 uppercase">{identifiedItem.category}</span>
                                        <span className="bg-white/80 px-2 py-1 rounded-lg text-[10px] font-bold text-gray-500">STOCK: {identifiedItem.quantity} {identifiedItem.unit}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Action Selector */}
                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setAction('IN')}
                                    className={`flex-1 flex flex-col items-center gap-2 p-5 rounded-3xl border-3 transition-all ${action === 'IN' ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-md ring-4 ring-emerald-500/10' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                                >
                                    <ArrowBigUp size={28} className={action === 'IN' ? 'animate-bounce' : ''} />
                                    <span className="font-black uppercase tracking-widest text-xs">Stock In</span>
                                </button>
                                <button
                                    onClick={() => setAction('OUT')}
                                    className={`flex-1 flex flex-col items-center gap-2 p-5 rounded-3xl border-3 transition-all ${action === 'OUT' ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-md ring-4 ring-orange-500/10' : 'border-gray-100 text-gray-400 hover:border-gray-200'}`}
                                >
                                    <ArrowBigDown size={28} className={action === 'OUT' ? 'animate-bounce' : ''} />
                                    <span className="font-black uppercase tracking-widest text-xs">Stock Out</span>
                                </button>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Quantity</label>
                                <div className="flex items-center gap-4 bg-gray-50 p-2 rounded-2xl border border-gray-100 shadow-inner">
                                    <button
                                        onClick={() => setQuantity(q => Math.max(1, q - 1))}
                                        className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-sm font-black text-xl hover:bg-gray-100 transition-colors"
                                    >
                                        -
                                    </button>
                                    <input
                                        type="number"
                                        value={quantity || ''}
                                        onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                                        className="flex-1 bg-transparent border-none text-center font-black text-2xl focus:ring-0 outline-none text-gray-900"
                                    />
                                    <button
                                        onClick={() => setQuantity(q => q + 1)}
                                        className="w-12 h-12 flex items-center justify-center bg-white rounded-xl shadow-sm font-black text-xl hover:bg-gray-100 transition-colors"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={handleStockUpdate}
                                disabled={isUpdatingStock}
                                className={`w-full py-5 rounded-3xl font-black text-base uppercase tracking-widest shadow-2xl transition-all active:scale-[0.98] mt-2 flex items-center justify-center gap-3 ${action === 'IN' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-200'} text-white`}
                            >
                                {isUpdatingStock ? (
                                    <>
                                        <Loader2 size={24} className="animate-spin" />
                                        Updating...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 size={24} />
                                        Confirm Stock {action}
                                    </>
                                )}
                            </button>

                            <button
                                onClick={() => setIdentifiedItem(null)}
                                className="w-full py-3 text-gray-400 font-bold text-xs uppercase tracking-widest hover:text-gray-600 transition-colors"
                            >
                                Rescan
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
