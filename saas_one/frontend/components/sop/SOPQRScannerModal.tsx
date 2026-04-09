/**
 * SOPQRScannerModal
 * Camera-based QR code scanner for starting an SOP session.
 * Uses html5-qrcode to access camera and decode QR codes with templateId.
 * @remarks Client component.
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X, ScanLine, AlertCircle } from 'lucide-react';

interface SOPQRScannerModalProps {
    onScan: (templateId: string) => void;
    onClose: () => void;
}

const SOPQRScannerModal: React.FC<SOPQRScannerModalProps> = ({ onScan, onClose }) => {
    const scannerRef = useRef<any>(null);
    const divId = 'sop-qr-scanner-div';
    const [error, setError] = useState<string | null>(null);
    const [scanning, setScanning] = useState(false);

    useEffect(() => {
        let scanner: any;

        const startScanner = async () => {
            try {
                const { Html5Qrcode } = await import('html5-qrcode');
                scanner = new Html5Qrcode(divId);
                scannerRef.current = scanner;

                await scanner.start(
                    { facingMode: 'environment' },
                    { fps: 10, qrbox: { width: 220, height: 220 } },
                    (decodedText: string) => {
                        // Extract templateId from URL like {origin}/checklist/{templateId}
                        const match = decodedText.match(/\/checklist\/([^/?#]+)/);
                        if (match?.[1]) {
                            scanner.stop().catch(() => {});
                            onScan(match[1]);
                        } else {
                            setError('Invalid QR code. Please scan a checklist QR.');
                        }
                    },
                    () => {} // ignore frame errors
                );
                setScanning(true);
            } catch (err: any) {
                setError(err?.message || 'Camera access denied. Please allow camera permissions.');
            }
        };

        startScanner();

        return () => {
            scannerRef.current?.stop().catch(() => {});
        };
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5 relative">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                    <X size={16} className="text-slate-400" />
                </button>

                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                        <ScanLine size={16} />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Scanner</p>
                        <h3 className="text-sm font-black text-slate-900 leading-tight">Scan Checklist QR</h3>
                    </div>
                </div>

                {/* Scanner viewport */}
                <div className="rounded-xl overflow-hidden border border-slate-100 bg-slate-50 mb-4">
                    <div id={divId} className="w-full" />
                </div>

                {!scanning && !error && (
                    <p className="text-[10px] text-slate-400 text-center font-medium animate-pulse">
                        Starting camera...
                    </p>
                )}

                {scanning && !error && (
                    <p className="text-[10px] text-slate-400 text-center font-medium">
                        Point camera at a checklist QR code
                    </p>
                )}

                {error && (
                    <div className="flex items-center gap-2 p-3 bg-rose-50 rounded-xl border border-rose-100">
                        <AlertCircle size={14} className="text-rose-500 flex-shrink-0" />
                        <p className="text-[10px] text-rose-600 font-semibold">{error}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SOPQRScannerModal;
