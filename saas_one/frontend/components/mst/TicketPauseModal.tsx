/**
 * TicketPauseModal - Modal dialog for pausing work on an active MST ticket.
 *
 * Presents a grid of preset pause-reason buttons (e.g. "Lunch Break", "Waiting for Parts",
 * "Client Not Available", "Other") sourced from `PAUSE_REASON_PRESETS`. When "Other" is
 * selected, a text area appears for entering a custom reason. Validates that a reason is
 * provided before allowing submission. Calls `onConfirm(reason)` with the selected reason.
 *
 * @example
 * <TicketPauseModal
 *   isOpen={isModalOpen}
 *   onClose={() => setIsModalOpen(false)}
 *   onConfirm={(reason) => pauseTicket(reason)}
 *   ticketTitle="Fix leaking tap in unit 402"
 *   isLoading={false}
 * />
 */
'use client';

import React, { useState } from 'react';
import { X, PauseCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PAUSE_REASON_PRESETS, PauseReasonPreset } from '@/frontend/types/ticketing';

interface TicketPauseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => Promise<void>;
    ticketTitle?: string;
    isLoading?: boolean;
}

/**
 * Modal for pausing work on a ticket
 * Requires a reason (preset or custom)
 */
export default function TicketPauseModal({
    isOpen,
    onClose,
    onConfirm,
    ticketTitle,
    isLoading = false
}: TicketPauseModalProps) {
    const [selectedPreset, setSelectedPreset] = useState<PauseReasonPreset | null>(null);
    const [customReason, setCustomReason] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async () => {
        const reason = selectedPreset === 'Other' ? customReason.trim() : selectedPreset;

        if (!reason) {
            setError('Please select or enter a reason');
            return;
        }

        if (selectedPreset === 'Other' && customReason.trim().length < 5) {
            setError('Please enter a more detailed reason');
            return;
        }

        setError('');
        await onConfirm(reason);
        handleClose();
    };

    const handleClose = () => {
        setSelectedPreset(null);
        setCustomReason('');
        setError('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                    onClick={handleClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-border">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-amber-500/10 rounded-xl flex items-center justify-center">
                                    <PauseCircle className="w-5 h-5 text-amber-500" />
                                </div>
                                <div>
                                    <h2 className="text-lg font-bold text-text-primary">Pause Work</h2>
                                    {ticketTitle && (
                                        <p className="text-xs text-text-tertiary truncate max-w-[200px]">
                                            {ticketTitle}
                                        </p>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-text-tertiary hover:text-text-primary transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-5 space-y-4">
                            <p className="text-sm text-text-secondary">
                                Select a reason for pausing work on this ticket:
                            </p>

                            {/* Preset Buttons */}
                            <div className="grid grid-cols-2 gap-2">
                                {PAUSE_REASON_PRESETS.map((preset) => (
                                    <button
                                        key={preset}
                                        onClick={() => {
                                            setSelectedPreset(preset);
                                            setError('');
                                        }}
                                        className={`
                                            p-3 rounded-xl text-sm font-medium text-left transition-all border
                                            ${selectedPreset === preset
                                                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600'
                                                : 'bg-surface-elevated border-border text-text-secondary hover:border-amber-500/20 hover:bg-amber-500/5'
                                            }
                                        `}
                                    >
                                        {preset}
                                    </button>
                                ))}
                            </div>

                            {/* Custom Reason Input */}
                            <AnimatePresence>
                                {selectedPreset === 'Other' && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="overflow-hidden"
                                    >
                                        <textarea
                                            value={customReason}
                                            onChange={(e) => {
                                                setCustomReason(e.target.value);
                                                setError('');
                                            }}
                                            placeholder="Enter your reason..."
                                            className="w-full p-3 bg-surface-elevated border border-border rounded-xl text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-amber-500/50 resize-none"
                                            rows={3}
                                            autoFocus
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Error Message */}
                            {error && (
                                <div className="flex items-center gap-2 text-error text-sm">
                                    <AlertCircle className="w-4 h-4" />
                                    {error}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex gap-3 p-5 border-t border-border bg-muted/30">
                            <button
                                onClick={handleClose}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-text-secondary font-medium hover:bg-surface-elevated transition-colors"
                                disabled={isLoading}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!selectedPreset || isLoading}
                                className={`
                                    flex-1 px-4 py-2.5 rounded-xl font-bold text-white transition-all
                                    ${selectedPreset
                                        ? 'bg-amber-500 hover:bg-amber-600 shadow-lg shadow-amber-500/20'
                                        : 'bg-muted text-text-tertiary cursor-not-allowed'
                                    }
                                `}
                            >
                                {isLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                        Pausing...
                                    </span>
                                ) : (
                                    'Pause Work'
                                )}
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
