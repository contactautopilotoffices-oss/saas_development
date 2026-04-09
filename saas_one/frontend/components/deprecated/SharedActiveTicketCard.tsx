/**
 * SharedActiveTicketCard (deprecated)
 * Legacy shared active ticket card. Use ActiveTicketCard instead.
 * @deprecated
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
    PlayCircle, PauseCircle, CheckCircle2, Clock, Camera,
    AlertCircle, ChevronRight, Wrench, Sparkles, Building2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { MstTicketView, TicketDepartment } from '@/frontend/types/ticketing';
import { getSkillGroupColor, getSkillGroupDisplayName, type SkillGroup } from '@/backend/lib/ticketing';

// Map legacy department to new skill_group
const mapDepartmentToSkillGroup = (dept: TicketDepartment): SkillGroup => {
    const mapping: Record<TicketDepartment, SkillGroup> = {
        technical: 'technical',
        soft_services: 'soft_services',
        vendor: 'vendor'
    };
    return mapping[dept] || 'technical';
};

interface ActiveTicketCardProps {
    ticket: MstTicketView;
    onStartWork: () => Promise<void>;
    onPauseWork: () => void; // Opens pause modal
    onComplete: () => Promise<void>;
    onViewDetails: () => void;
    isLoading?: boolean;
}

/**
 * Focused single-ticket view for MST's active work item
 * Shows large ticket display with quick actions
 */
export default function ActiveTicketCard({
    ticket,
    onStartWork,
    onPauseWork,
    onComplete,
    onViewDetails,
    isLoading = false
}: ActiveTicketCardProps) {
    const [workTimer, setWorkTimer] = useState('00:00:00');

    // Calculate work timer
    useEffect(() => {
        if (!ticket.work_started_at) return;

        const updateTimer = () => {
            const startTime = new Date(ticket.work_started_at!).getTime();
            const now = Date.now();
            const diff = now - startTime;

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            setWorkTimer(
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [ticket.work_started_at]);

    const departmentColors = getSkillGroupColor(mapDepartmentToSkillGroup(ticket.department));
    const DepartmentIcon = ticket.department === 'technical' ? Wrench
        : ticket.department === 'soft_services' ? Sparkles
            : Building2;

    const isAssigned = ticket.status === 'assigned';
    const isInProgress = ticket.status === 'in_progress';
    const isPaused = ticket.work_paused;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-card border border-border rounded-2xl shadow-lg overflow-hidden"
        >
            {/* Status Banner */}
            <div className={`px-5 py-3 ${isPaused ? 'bg-amber-500/10 border-b border-amber-500/20' :
                isInProgress ? 'bg-emerald-500/10 border-b border-emerald-500/20' :
                    'bg-primary/10 border-b border-primary/20'
                }`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {isPaused ? (
                            <>
                                <PauseCircle className="w-5 h-5 text-amber-500" />
                                <span className="text-sm font-bold text-amber-600">WORK PAUSED</span>
                            </>
                        ) : isInProgress ? (
                            <>
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                                <span className="text-sm font-bold text-emerald-600">IN PROGRESS</span>
                            </>
                        ) : (
                            <>
                                <Clock className="w-5 h-5 text-primary" />
                                <span className="text-sm font-bold text-primary">READY TO START</span>
                            </>
                        )}
                    </div>
                    {(isInProgress || isPaused) && ticket.work_started_at && (
                        <div className="flex items-center gap-2 text-text-secondary">
                            <Clock className="w-4 h-4" />
                            <span className="text-sm font-mono font-bold">{workTimer}</span>
                        </div>
                    )}
                </div>
                {isPaused && ticket.work_pause_reason && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        {ticket.work_pause_reason}
                    </p>
                )}
            </div>

            {/* Main Content */}
            <div className="p-5 space-y-4">
                {/* Header with Department */}
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                            <span className={`
                                inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border
                                ${departmentColors.bg} ${departmentColors.text} ${departmentColors.border}
                            `}>
                                <DepartmentIcon className="w-3.5 h-3.5" />
                                {getSkillGroupDisplayName(mapDepartmentToSkillGroup(ticket.department))}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded font-medium border ${ticket.priority === 'high' || ticket.priority === 'critical'
                                ? 'bg-error/10 text-error border-error/20'
                                : ticket.priority === 'medium'
                                    ? 'bg-warning/10 text-warning border-warning/20'
                                    : 'bg-info/10 text-info border-info/20'
                                }`}>
                                {ticket.priority}
                            </span>
                        </div>
                        <h2 className="text-xl font-bold text-text-primary leading-tight">
                            {ticket.title}
                        </h2>
                        <p className="text-text-tertiary text-xs mt-1">
                            #{ticket.ticket_number}
                        </p>
                    </div>
                    <button
                        onClick={onViewDetails}
                        className="p-2 rounded-lg hover:bg-muted text-text-tertiary hover:text-text-primary transition-colors"
                    >
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                {/* Description */}
                <p className="text-text-secondary text-sm leading-relaxed">
                    {ticket.description}
                </p>

                {/* Photo Preview */}
                {ticket.photo_before_url && (
                    <div className="flex gap-3">
                        <div className="relative group">
                            <img
                                src={ticket.photo_before_url}
                                alt="Before"
                                className="w-24 h-24 rounded-xl object-cover border border-border"
                            />
                            <span className="absolute bottom-1 left-1 text-[9px] px-1.5 py-0.5 bg-black/60 text-white rounded font-bold">
                                BEFORE
                            </span>
                        </div>
                        {ticket.photo_after_url && (
                            <div className="relative group">
                                <img
                                    src={ticket.photo_after_url}
                                    alt="After"
                                    className="w-24 h-24 rounded-xl object-cover border border-border"
                                />
                                <span className="absolute bottom-1 left-1 text-[9px] px-1.5 py-0.5 bg-emerald-500/80 text-white rounded font-bold">
                                    AFTER
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Creator Info */}
                {ticket.creator && (
                    <div className="flex items-center gap-2 text-xs text-text-tertiary bg-muted rounded-lg px-3 py-2">
                        <span>Requested by</span>
                        <span className="font-medium text-text-secondary">{ticket.creator.full_name}</span>
                        <span>•</span>
                        <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div className="p-5 pt-0">
                <div className="flex gap-3">
                    {isAssigned && (
                        <button
                            onClick={onStartWork}
                            disabled={isLoading}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                        >
                            <PlayCircle className="w-5 h-5" />
                            Start Work
                        </button>
                    )}

                    {isInProgress && !isPaused && (
                        <>
                            <button
                                onClick={onPauseWork}
                                disabled={isLoading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-500 text-white rounded-xl font-bold text-sm hover:bg-amber-600 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
                            >
                                <PauseCircle className="w-5 h-5" />
                                Pause
                            </button>
                            <button
                                onClick={onComplete}
                                disabled={isLoading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                            >
                                <CheckCircle2 className="w-5 h-5" />
                                Complete
                            </button>
                        </>
                    )}

                    {isPaused && (
                        <>
                            <button
                                onClick={onStartWork}
                                disabled={isLoading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                            >
                                <PlayCircle className="w-5 h-5" />
                                Resume Work
                            </button>
                            <button
                                onClick={onComplete}
                                disabled={isLoading}
                                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-500 text-white rounded-xl font-bold text-sm hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                            >
                                <CheckCircle2 className="w-5 h-5" />
                                Complete
                            </button>
                        </>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

/**
 * Empty state when no active ticket
 */
export function NoActiveTicketCard({ onBrowseDepartment }: { onBrowseDepartment: () => void }) {
    return (
        <div className="bg-card border border-border rounded-2xl p-8 text-center">
            <div className="w-16 h-16 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Clock className="w-8 h-8 text-text-tertiary" />
            </div>
            <h3 className="text-lg font-bold text-text-primary mb-2">No Active Work</h3>
            <p className="text-text-secondary text-sm mb-6">
                You don't have any tickets in progress. Browse department tickets to pick up work.
            </p>
            <button
                onClick={onBrowseDepartment}
                className="px-6 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-all"
            >
                Browse Department Tickets
            </button>
        </div>
    );
}
