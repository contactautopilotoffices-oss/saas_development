'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, Maximize2 } from 'lucide-react';

interface ImagePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string | null;
    title?: string;
}

const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({ isOpen, onClose, imageUrl, title }) => {
    if (!imageUrl) return null;

    const handleDownload = () => {
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `checklist-audit-proof-${Date.now()}.webp`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-8">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/90 backdrop-blur-sm"
                    />

                    {/* Content */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="relative w-full max-w-5xl bg-white rounded-xl sm:rounded-2xl md:rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] md:max-h-[calc(100vh-4rem)]"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-3 sm:p-4 md:p-6 border-b border-slate-100">
                            <div>
                                <h3 className="text-sm md:text-lg font-black text-slate-900 tracking-tight">
                                    {title || 'Photo Preview'}
                                </h3>
                                <p className="text-[10px] md:text-xs font-medium text-slate-500 uppercase tracking-widest">
                                    Checklist Visual Proof
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={handleDownload}
                                    className="p-2 md:p-3 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-xl transition-all"
                                    title="Download Image"
                                >
                                    <Download size={20} />
                                </button>
                                <button
                                    onClick={onClose}
                                    className="p-2 md:p-3 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Image Container */}
                        <div className="flex-1 overflow-auto bg-slate-50 flex items-center justify-center p-2 sm:p-4 min-h-0">
                            <motion.img
                                layoutId="preview-image"
                                src={imageUrl}
                                alt="Preview"
                                className="max-w-full max-h-[60vh] sm:max-h-[70vh] md:max-h-[75vh] object-contain rounded-lg shadow-lg border-2 sm:border-4 border-white"
                            />
                        </div>

                        {/* Footer (Mobile Friendly) */}
                        <div className="md:hidden p-3 border-t border-slate-100 bg-white flex justify-center">
                            <button
                                onClick={onClose}
                                className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest"
                            >
                                Close Preview
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ImagePreviewModal;
