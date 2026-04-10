/**
 * NavbarShiftStatus - Compact shift status toggle and dropdown for the navigation bar.
 *
 * Renders a small pill button showing a pulsing dot (green=on duty, grey=off duty) and the
 * status label. Clicking opens a dropdown panel with an informational message and a
 * Start Shift / End Shift toggle button. The dropdown auto-closes when clicking outside.
 * Designed for placement in the top navigation bar of MST-facing pages.
 *
 * @example
 * <NavbarShiftStatus
 *   isCheckedIn={true}
 *   isLoading={false}
 *   onToggle={() => toggleShift()}
 * />
 */
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, LogOut, Loader2, ChevronDown, Clock } from 'lucide-react';

interface NavbarShiftStatusProps {
    isCheckedIn: boolean;
    isLoading: boolean;
    onToggle: () => void;
}

export default function NavbarShiftStatus({ isCheckedIn, isLoading, onToggle }: NavbarShiftStatusProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Compact Navbar Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`
          flex items-center gap-2 px-2.5 py-1.5 rounded-xl transition-all
          border shadow-sm
          ${isCheckedIn
                        ? 'bg-green-50 border-green-200 hover:bg-green-100'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100'
                    }
        `}
            >
                {/* Status Indicator Dot */}
                <div className={`
          w-2 h-2 rounded-full transition-all
          ${isCheckedIn ? 'bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-400'}
        `} />

                {/* Status Text - Hidden on very small screens */}
                <span className={`
          text-[11px] font-bold hidden sm:inline uppercase tracking-wider
          ${isCheckedIn ? 'text-green-700' : 'text-slate-500'}
        `}>
                    {isCheckedIn ? 'On Duty' : 'Off Duty'}
                </span>

                {/* Dropdown Arrow */}
                <ChevronDown className={`
          w-3.5 h-3.5 transition-transform duration-300
          ${isOpen ? 'rotate-180' : ''}
          ${isCheckedIn ? 'text-green-600' : 'text-slate-400'}
        `} />
            </button>

            {/* Dropdown Panel */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Mobile Overlay Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="fixed inset-0 bg-slate-900/10 backdrop-blur-[1px] z-[48] lg:hidden"
                        />

                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            transition={{ duration: 0.15, ease: 'easeOut' }}
                            className="fixed sm:absolute left-1/2 -translate-x-1/2 sm:left-auto sm:right-0 sm:translate-x-0 top-[4.5rem] sm:top-full mt-2 w-[calc(100vw-2rem)] sm:w-72 max-w-xs bg-white border border-slate-200 rounded-[2rem] shadow-2xl z-50 overflow-hidden"
                        >
                            {/* Header */}
                            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-[13px] font-black text-slate-800 uppercase tracking-widest">Shift Status</h3>
                                    </div>
                                    <span className={`
                  text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest
                  ${isCheckedIn ? 'bg-green-500 text-white shadow-sm shadow-green-200' : 'bg-slate-200 text-slate-600'}
                `}>
                                        {isCheckedIn ? 'On Duty' : 'Off Duty'}
                                    </span>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-5 space-y-4">
                                {/* Info Box */}
                                <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-100/50 group">
                                    <div className="flex items-start gap-3">
                                        <div className={`p-2 rounded-xl border border-white bg-white shadow-sm group-hover:scale-110 transition-transform ${isCheckedIn ? 'text-green-500' : 'text-slate-400'}`}>
                                            <Clock className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="text-[13px] font-bold text-slate-800 leading-tight">
                                                {isCheckedIn ? 'Actively receiving tickets' : 'Shift currently inactive'}
                                            </p>
                                            <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed font-medium">
                                                {isCheckedIn
                                                    ? 'Your load is being balanced across active MSTs.'
                                                    : 'Check in to start receiving new service requests.'}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Button */}
                                <button
                                    onClick={() => {
                                        onToggle();
                                        setIsOpen(false);
                                    }}
                                    disabled={isLoading}
                                    className={`
                  w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-bold transition-all text-sm
                  ${isCheckedIn
                                            ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
                                            : 'bg-primary text-white hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0'
                                        } 
                  disabled:opacity-50 disabled:cursor-not-allowed shadow-sm
                `}
                                >
                                    {isLoading ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : isCheckedIn ? (
                                        <>
                                            <LogOut className="w-4 h-4" />
                                            End Shift
                                        </>
                                    ) : (
                                        <>
                                            <LogIn className="w-5 h-5" />
                                            Start Shift
                                        </>
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}
