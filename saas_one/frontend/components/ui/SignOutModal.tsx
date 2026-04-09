/**
 * SignOutModal
 * Sign out confirmation modal.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, X, AlertCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface SignOutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
}

const SignOutModal = ({ isOpen, onClose, onConfirm }: SignOutModalProps) => {
    const router = useRouter();
    const [isLoggingOut, setIsLoggingOut] = React.useState(false);

    const handleConfirm = async () => {
        setIsLoggingOut(true);
        try {
            await onConfirm();
            router.replace('/login');
        } catch (error) {
            console.error('Sign out failed:', error);
            setIsLoggingOut(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[9998]"
                    />

                    {/* Modal */}
                    <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4 pointer-events-none">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                            className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.2)] w-full max-w-sm overflow-hidden pointer-events-auto border border-white/20"
                        >
                            <div className="p-8">
                                <div className="flex justify-center mb-6">
                                    <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center">
                                        <LogOut className="w-8 h-8 text-rose-500" />
                                    </div>
                                </div>

                                <div className="text-center mb-8">
                                    <h3 className="text-xl font-black text-slate-900 mb-2">Wait, Don't Go!</h3>
                                    <p className="text-slate-500 font-medium">Are you sure you want to sign out of your dashboard?</p>
                                </div>

                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={handleConfirm}
                                        disabled={isLoggingOut}
                                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-slate-800 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-slate-900/20 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                                    >
                                        {isLoggingOut ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                Securing Session...
                                            </>
                                        ) : (
                                            'Yes, Sign Out'
                                        )}
                                    </button>
                                    {!isLoggingOut && (
                                        <button
                                            onClick={onClose}
                                            className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all active:scale-[0.98]"
                                        >
                                            Stay Logged In
                                        </button>
                                    )}
                                </div>
                            </div>

                            {!isLoggingOut && (
                                <button
                                    onClick={onClose}
                                    className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl transition-all"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            )}
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};

export default SignOutModal;
