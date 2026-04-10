/**
 * ShareModal
 * Modal for sharing ticket details or reports via link/copy.
 * @remarks Client component.
 */

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ShareModalProps {
    isOpen: boolean;
    onClose: () => void;
    ticketId: string;
    ticketNumber: string;
    title: string;
}

const PLATFORMS = [
    {
        id: 'whatsapp',
        label: 'WhatsApp',
        icon: (
            <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
        ),
        color: 'bg-[#25D366] hover:bg-[#1da851]',
        getUrl: (url: string, text: string) =>
            `https://wa.me/?text=${encodeURIComponent(text + '\n' + url)}`,
    },
    {
        id: 'telegram',
        label: 'Telegram',
        icon: (
            <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
        ),
        color: 'bg-[#229ED9] hover:bg-[#1a8bc2]',
        getUrl: (url: string, text: string) =>
            `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`,
    },
    {
        id: 'email',
        label: 'Email',
        icon: (
            <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
        ),
        color: 'bg-[#EA4335] hover:bg-[#d33426]',
        getUrl: (url: string, text: string) =>
            `mailto:?subject=${encodeURIComponent(text)}&body=${encodeURIComponent(url)}`,
    },
    {
        id: 'sms',
        label: 'SMS',
        icon: (
            <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 11H7V9h2v2zm4 0h-2V9h2v2zm4 0h-2V9h2v2z" />
            </svg>
        ),
        color: 'bg-[#5F2EEA] hover:bg-[#4e25c8]',
        getUrl: (url: string, text: string) =>
            `sms:?body=${encodeURIComponent(text + ' ' + url)}`,
    },
];

export default function ShareModal({ isOpen, onClose, ticketId, ticketNumber, title }: ShareModalProps) {
    const [copied, setCopied] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
        (typeof window !== 'undefined' ? window.location.origin : '');
    const shareUrl = `${appBase}/tickets/${ticketId}`;

    const shareText = `Ticket ${ticketNumber}: ${title}`;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // execCommand fallback removed — navigator.clipboard is supported in all modern browsers
        }
    };

    const handleNativeShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: shareText, url: shareUrl });
            } catch { /* user cancelled */ }
        }
    };

    const modal = (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 bg-black/50 z-[100] backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                    />

                    {/* Modal */}
                    <motion.div
                        className="fixed inset-x-4 bottom-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-sm z-[101] bg-white rounded-2xl shadow-2xl overflow-hidden"
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900">Share Ticket</h3>
                                <p className="text-xs text-gray-500 mt-0.5 font-mono">{ticketNumber}</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-all"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-5 space-y-4">
                            {/* Link copy */}
                            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200">
                                <span className="flex-1 text-xs text-gray-500 font-mono truncate">{shareUrl}</span>
                                <button
                                    onClick={handleCopy}
                                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${copied ? 'bg-emerald-500 text-white' : 'bg-gray-900 text-white hover:bg-gray-700'}`}
                                >
                                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copied ? 'Copied!' : 'Copy'}
                                </button>
                            </div>

                            {/* Platform buttons */}
                            <div className="grid grid-cols-4 gap-3">
                                {PLATFORMS.map((p) => (
                                    <a
                                        key={p.id}
                                        href={p.getUrl(shareUrl, shareText)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={onClose}
                                        className={`flex flex-col items-center gap-2 p-4 ${p.color} text-white rounded-2xl transition-all active:scale-95 shadow-md`}
                                    >
                                        {p.icon}
                                        <span className="text-[10px] font-bold">{p.label}</span>
                                    </a>
                                ))}
                            </div>

                            {/* Native share (mobile) */}
                            {typeof navigator !== 'undefined' && 'share' in navigator && (
                                <button
                                    onClick={handleNativeShare}
                                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-all active:scale-[0.98]"
                                >
                                    More options...
                                </button>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );

    return mounted ? createPortal(modal, document.body) : null;
}
