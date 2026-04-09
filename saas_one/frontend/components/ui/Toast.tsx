/**
 * Toast components (Toast, Toaster, useToast).
 * Notification toast system using Sonner.
 * @remarks UI primitive.
 */

'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, AlertCircle, X } from 'lucide-react';

export interface ToastProps {
    message: string;
    type: 'success' | 'error' | 'info';
    visible: boolean;
    onClose?: () => void;
    duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
    message,
    type,
    visible,
    onClose,
    duration = 3000
}) => {
    useEffect(() => {
        if (visible && duration > 0 && onClose) {
            const timer = setTimeout(() => {
                onClose();
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [visible, duration, onClose]);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.9, x: '-50%' }}
                    animate={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
                    exit={{ opacity: 0, y: 20, scale: 0.9, x: '-50%' }}
                    className="fixed bottom-10 left-1/2 z-[9999] flex items-center gap-3 px-6 py-4 rounded-2xl bg-white/90 dark:bg-[#161b22]/90 backdrop-blur-xl border border-slate-200 dark:border-[#30363d] shadow-2xl min-w-[320px] max-w-[90vw]"
                >
                    <div className="flex-shrink-0">
                        {type === 'success' ? (
                            <div className="relative">
                                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                <motion.div
                                    initial={{ scale: 1, opacity: 0.5 }}
                                    animate={{ scale: 2, opacity: 0 }}
                                    transition={{ duration: 0.6 }}
                                    className="absolute inset-0 rounded-full bg-emerald-500"
                                />
                            </div>
                        ) : type === 'error' ? (
                            <AlertCircle className="w-6 h-6 text-rose-500" />
                        ) : (
                            <CheckCircle2 className="w-6 h-6 text-blue-500" />
                        )}
                    </div>

                    <div className="flex-1">
                        <p className="text-sm font-black tracking-tight text-slate-900 dark:text-white leading-tight">
                            {type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Notification'}
                        </p>
                        <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-0.5 leading-snug uppercase tracking-wider">
                            {message}
                        </p>
                    </div>

                    {onClose && (
                        <button
                            onClick={onClose}
                            className="flex-shrink-0 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                            <X className="w-4 h-4 text-slate-400" />
                        </button>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};
