'use client';

import React, { useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { X, Download, QrCode } from 'lucide-react';

interface SOPQRModalProps {
    templateId: string;
    templateTitle: string;
    onClose: () => void;
}

const SOPQRModal: React.FC<SOPQRModalProps> = ({ templateId, templateTitle, onClose }) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const qrUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/checklist/${templateId}`;

    const handleDownload = () => {
        const canvas = canvasRef.current?.querySelector('canvas');
        if (!canvas) return;
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `checklist-qr-${templateTitle.replace(/\s+/g, '-').toLowerCase()}.png`;
        a.click();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                >
                    <X size={16} className="text-slate-400" />
                </button>

                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                        <QrCode size={16} />
                    </div>
                    <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">QR Code</p>
                        <h3 className="text-sm font-black text-slate-900 leading-tight">{templateTitle}</h3>
                    </div>
                </div>

                {/* QR Code */}
                <div ref={canvasRef} className="flex justify-center p-4 bg-slate-50 rounded-xl border border-slate-100 mb-4">
                    <QRCodeCanvas
                        value={qrUrl}
                        size={180}
                        level="M"
                        includeMargin
                        bgColor="#ffffff"
                        fgColor="#0f172a"
                    />
                </div>

                <p className="text-[10px] text-slate-400 text-center font-medium mb-4 break-all">
                    {qrUrl}
                </p>

                <button
                    onClick={handleDownload}
                    className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-700 transition-all"
                >
                    <Download size={14} />
                    Download QR
                </button>
            </div>
        </div>
    );
};

export default SOPQRModal;
