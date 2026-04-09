/**
 * PermissionPromptModal
 * Modal requesting user permission for notifications or camera access.
 * @remarks Client component.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Camera, Check, X, ShieldCheck } from 'lucide-react';

interface PermissionPromptModalProps {
    isOpen: boolean;
    onClose: () => void;
}

type PermStatus = 'idle' | 'granted' | 'denied';

export default function PermissionPromptModal({ isOpen, onClose }: PermissionPromptModalProps) {
    const [notifStatus, setNotifStatus] = useState<PermStatus>('idle');
    const [cameraStatus, setCameraStatus] = useState<PermStatus>('idle');

    // Pre-fill already-granted permissions so buttons don't show for them
    useEffect(() => {
        if (!isOpen) return;
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            setNotifStatus('granted');
        } else if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
            setNotifStatus('denied');
        }

        if (typeof navigator !== 'undefined' && navigator.permissions) {
            navigator.permissions.query({ name: 'camera' as PermissionName }).then(result => {
                if (result.state === 'granted') setCameraStatus('granted');
                if (result.state === 'denied') setCameraStatus('denied');
            }).catch(() => { /* not supported */ });
        }
    }, [isOpen]);

    const handleAllowNotifications = async () => {
        try {
            const permission = await Notification.requestPermission();
            setNotifStatus(permission === 'granted' ? 'granted' : 'denied');
        } catch {
            setNotifStatus('denied');
        }
    };

    const handleAllowCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
            setCameraStatus('granted');
        } catch {
            setCameraStatus('denied');
        }
    };

    const bothDone = notifStatus !== 'idle' && cameraStatus !== 'idle';

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[9998]"
                    />

                    {/* Modal — slides up from bottom on mobile, centered on desktop */}
                    <div className="fixed inset-0 flex items-end sm:items-center justify-center z-[9999] p-4">
                        <motion.div
                            initial={{ y: 80, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 80, opacity: 0 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
                            className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden"
                        >
                            {/* Header */}
                            <div className="px-6 pt-6 pb-2 flex items-start justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 bg-slate-900 rounded-2xl flex items-center justify-center flex-shrink-0">
                                        <ShieldCheck size={20} className="text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-black text-slate-900 leading-tight">Enable Permissions</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">For the best experience</p>
                                    </div>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all flex-shrink-0"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="px-6 pb-6 pt-4 space-y-3">
                                {/* Notifications card */}
                                <div className="flex items-center gap-3 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <Bell size={18} className="text-indigo-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm text-slate-900">Notifications</p>
                                        <p className="text-xs text-slate-500 leading-snug">Get instant alerts for tickets, updates & reminders</p>
                                    </div>
                                    {notifStatus === 'idle' ? (
                                        <button
                                            onClick={handleAllowNotifications}
                                            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-black rounded-xl hover:bg-indigo-700 active:scale-95 transition-all whitespace-nowrap flex-shrink-0"
                                        >
                                            Allow
                                        </button>
                                    ) : (
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${notifStatus === 'granted' ? 'bg-green-100' : 'bg-slate-100'}`}>
                                            <Check size={14} className={notifStatus === 'granted' ? 'text-green-600' : 'text-slate-400'} />
                                        </div>
                                    )}
                                </div>

                                {/* Camera card */}
                                <div className="flex items-center gap-3 p-4 bg-violet-50 rounded-2xl border border-violet-100">
                                    <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                        <Camera size={18} className="text-violet-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm text-slate-900">Camera</p>
                                        <p className="text-xs text-slate-500 leading-snug">Scan QR codes & capture photos for reports</p>
                                    </div>
                                    {cameraStatus === 'idle' ? (
                                        <button
                                            onClick={handleAllowCamera}
                                            className="px-3 py-1.5 bg-violet-600 text-white text-xs font-black rounded-xl hover:bg-violet-700 active:scale-95 transition-all whitespace-nowrap flex-shrink-0"
                                        >
                                            Allow
                                        </button>
                                    ) : (
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${cameraStatus === 'granted' ? 'bg-green-100' : 'bg-slate-100'}`}>
                                            <Check size={14} className={cameraStatus === 'granted' ? 'text-green-600' : 'text-slate-400'} />
                                        </div>
                                    )}
                                </div>

                                {/* CTA button */}
                                <button
                                    onClick={onClose}
                                    className="w-full py-3.5 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 active:scale-[0.98] transition-all mt-1"
                                >
                                    {bothDone ? 'All Set — Continue' : 'Skip for Now'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
}
