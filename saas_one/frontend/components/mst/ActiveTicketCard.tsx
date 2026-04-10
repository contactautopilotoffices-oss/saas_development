/**
 * ActiveTicketCard
 * Card component for a technician's in-progress MST ticket.
 * Displays metadata, status, and action buttons (start/pause/resume/complete).
 * @remarks Client component.
 */

'use client';

import React from 'react';
import {
    Play, Pause, CheckCircle2, AlertCircle,
    ArrowRight, Clock, FileText, Image as ImageIcon
} from 'lucide-react';
import { motion } from 'framer-motion';
import { MstTicketView } from '@/frontend/types/ticketing';

interface ActiveTicketCardProps {
    ticket: MstTicketView;
    onStartWork: () => Promise<void>;
    onPauseWork: () => void;
    onComplete: () => Promise<void>;
    onViewDetails: () => void;
    isLoading: boolean;
}

export default function ActiveTicketCard({
    ticket,
    onStartWork,
    onPauseWork,
    onComplete,
    onViewDetails,
    isLoading
}: ActiveTicketCardProps) {
    const isPaused = ticket.status === 'paused';
    const isWorking = ticket.status === 'in_progress';
    const isAssigned = ticket.status === 'assigned';

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-primary/20 shadow-lg shadow-primary/5 rounded-2xl overflow-hidden"
        >
            {/* Header Status Bar */}
            <div className={`
                px-6 py-3 border-b border-border flex items-center justify-between
                ${isWorking ? 'bg-primary/5' : isPaused ? 'bg-amber-500/5' : 'bg-surface-elevated'}
            `}>
                <div className="flex items-center gap-3">
                    <span className={`
                        flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider
                        ${isWorking ? 'bg-primary text-white' :
                            isPaused ? 'bg-amber-500 text-white' :
                                'bg-blue-500 text-white'}
                    `}>
                        {isWorking && <Play className="w-3 h-3 fill-current" />}
                        {isPaused && <Pause className="w-3 h-3 fill-current" />}
                        {isAssigned && <CheckCircle2 className="w-3 h-3" />}
                        {ticket.status.replace('_', ' ')}
                    </span>
                    <span className="text-sm font-medium text-text-secondary">
                        #{ticket.ticket_number}
                    </span>
                </div>
                {ticket.priority && (
                    <span className={`
                        text-xs font-bold px-2 py-0.5 rounded
                        ${ticket.priority === 'critical' ? 'bg-red-500/10 text-red-500' :
                            ticket.priority === 'high' ? 'bg-orange-500/10 text-orange-500' :
                                'bg-blue-500/10 text-blue-500'}
                    `}>
                        {ticket.priority.toUpperCase()}
                    </span>
                )}
            </div>

            <div className="p-6">
                <div className="flex flex-col md:flex-row gap-6">
                    {/* Main Content */}
                    <div className="flex-1 space-y-4">
                        <div>
                            <h3 className="text-xl font-bold text-text-primary mb-2">
                                {ticket.title}
                            </h3>
                            <p className="text-text-secondary leading-relaxed">
                                {ticket.description}
                            </p>
                        </div>

                        {/* Metadata Grid */}
                        <div className="grid grid-cols-2 gap-4 py-4">
                            <div className="flex items-center gap-2 text-sm text-text-tertiary">
                                <Clock className="w-4 h-4" />
                                <span>Created {new Date(ticket.created_at).toLocaleDateString()}</span>
                            </div>
                            {ticket.category && (
                                <div className="flex items-center gap-2 text-sm text-text-tertiary">
                                    <FileText className="w-4 h-4" />
                                    <span>{ticket.category}</span>
                                </div>
                            )}
                        </div>

                        {/* Photo Preview if available */}
                        {ticket.photo_before_url && (
                            <div className="relative group rounded-xl overflow-hidden border border-border h-32 w-full md:w-64 bg-muted">
                                <img
                                    src={ticket.photo_before_url}
                                    alt="Issue context"
                                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2">
                                    <span className="text-white text-xs font-medium flex items-center gap-1">
                                        <ImageIcon className="w-3 h-3" />
                                        View Photo
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions Column */}
                    <div className="flex flex-col gap-3 min-w-[200px]">
                        {/* Primary Action */}
                        {(isAssigned || isPaused) && (
                            <button
                                onClick={onStartWork}
                                disabled={isLoading}
                                className="w-full py-3 px-4 bg-primary hover:bg-primary-dark text-white rounded-xl shadow-lg shadow-primary/20 flex items-center justify-center gap-2 font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                            >
                                <Play className="w-4 h-4 fill-current" />
                                {isPaused ? 'Resume Work' : 'Start Work'}
                            </button>
                        )}

                        {isWorking && (
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={onPauseWork}
                                    disabled={isLoading}
                                    className="py-3 px-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/20 rounded-xl flex items-center justify-center gap-2 font-bold transition-all active:scale-95"
                                >
                                    <Pause className="w-4 h-4 fill-current" />
                                    Pause
                                </button>
                                <button
                                    onClick={onComplete}
                                    disabled={isLoading}
                                    className="py-3 px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 font-bold transition-all active:scale-95"
                                >
                                    <CheckCircle2 className="w-4 h-4" />
                                    Done
                                </button>
                            </div>
                        )}

                        <div className="h-px bg-border my-1" />

                        <button
                            onClick={onViewDetails}
                            className="w-full py-2.5 px-4 bg-surface-elevated hover:bg-muted border border-border text-text-secondary hover:text-text-primary rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors"
                        >
                            View Details
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Pause Reason Banner */}
            {isPaused && ticket.work_pause_reason && (
                <div className="px-6 py-3 bg-amber-50 border-t border-amber-100">
                    <div className="flex items-start gap-2 text-amber-800 text-sm">
                        <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span className="font-medium">Paused: {ticket.work_pause_reason}</span>
                    </div>
                </div>
            )}
        </motion.div>
    );
}

interface NoActiveTicketCardProps {
    onBrowseDepartment: () => void;
}

export function NoActiveTicketCard({ onBrowseDepartment }: NoActiveTicketCardProps) {
    return (
        <div className="bg-surface-elevated border border-dashed border-border rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-text-tertiary" />
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-1">
                You're all caught up!
            </h3>
            <p className="text-text-tertiary mb-6 max-w-sm mx-auto">
                There are no tickets currently assigned to you. Check the department queue for open requests.
            </p>
            <button
                onClick={onBrowseDepartment}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-medium hover:bg-primary-dark transition-colors"
            >
                Browse Department
                <ArrowRight className="w-4 h-4" />
            </button>
        </div>
    );
}
