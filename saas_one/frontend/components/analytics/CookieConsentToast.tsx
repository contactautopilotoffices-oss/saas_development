/**
 * CookieConsentToast
 * Non-blocking toast informing users about essential cookie usage.
 * Displays once on first visit, gated by localStorage, dismissible.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { X, Cookie } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const CONSENT_KEY = 'cookie_consent_dismissed';

/**
 * CookieConsentToast - Non-blocking cookie usage notice
 * 
 * - Shows on first visit after login (once only)
 * - Stores dismissal in localStorage
 * - Non-alarming message about essential cookies
 */
export const CookieConsentToast: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if already dismissed
        const dismissed = localStorage.getItem(CONSENT_KEY);
        if (!dismissed) {
            // Delay showing to not interrupt initial load
            const timer = setTimeout(() => {
                setIsVisible(true);
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleDismiss = () => {
        localStorage.setItem(CONSENT_KEY, 'true');
        setIsVisible(false);
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ opacity: 0, y: 50, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50"
                >
                    <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 flex items-start gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                            <Cookie className="w-5 h-5 text-amber-600" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-slate-900 mb-1">
                                Cookie Usage
                            </h4>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                We use essential cookies to understand how the app is used and to improve performance.
                                We do not track attendance or activity outside this app.
                            </p>
                        </div>

                        {/* Dismiss Button */}
                        <button
                            onClick={handleDismiss}
                            className="flex-shrink-0 px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors"
                        >
                            Got it
                        </button>

                        {/* Close X */}
                        <button
                            onClick={handleDismiss}
                            className="flex-shrink-0 p-1 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default CookieConsentToast;
