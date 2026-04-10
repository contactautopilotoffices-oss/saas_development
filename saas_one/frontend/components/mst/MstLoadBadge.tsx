/**
 * MstLoadBadge
 * Workload indicator badge for MST (Multi-Skilled Technician).
 * Color-coded: green (0-2), amber (3-4), red (5+) active tickets.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { MstLoad } from '@/frontend/types/ticketing';

interface MstLoadBadgeProps {
    load: MstLoad;
    size?: 'sm' | 'md' | 'lg';
    showName?: boolean;
    className?: string;
}

/**
 * Visual indicator showing MST workload
 * Color coding: green (0-2), yellow (3-4), red (5+)
 */
export default function MstLoadBadge({ 
    load, 
    size = 'md',
    showName = true,
    className = ''
}: MstLoadBadgeProps) {
    const { activeTicketCount, pausedTicketCount, fullName, isAvailable } = load;
    const totalActive = activeTicketCount + pausedTicketCount;

    // Determine color based on load
    const getLoadColor = () => {
        if (!isAvailable) return { bg: 'bg-gray-500/10', text: 'text-gray-500', border: 'border-gray-500/20' };
        if (activeTicketCount <= 2) return { bg: 'bg-emerald-500/10', text: 'text-emerald-500', border: 'border-emerald-500/20' };
        if (activeTicketCount <= 4) return { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20' };
        return { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/20' };
    };

    const colors = getLoadColor();

    // Size variants
    const sizeClasses = {
        sm: 'text-[10px] px-1.5 py-0.5',
        md: 'text-xs px-2 py-1',
        lg: 'text-sm px-3 py-1.5'
    };

    return (
        <div className={`inline-flex items-center gap-2 ${className}`}>
            {showName && (
                <span className="text-text-secondary text-sm font-medium truncate max-w-[120px]">
                    {fullName}
                </span>
            )}
            <div className={`
                inline-flex items-center gap-1 rounded-full font-bold border
                ${colors.bg} ${colors.text} ${colors.border} ${sizeClasses[size]}
            `}>
                <span className="font-black">{activeTicketCount}</span>
                {pausedTicketCount > 0 && (
                    <>
                        <span className="text-text-tertiary">+</span>
                        <span className="text-amber-500">{pausedTicketCount}p</span>
                    </>
                )}
                {!isAvailable && (
                    <span className="ml-1 opacity-60">offline</span>
                )}
            </div>
        </div>
    );
}

/**
 * Compact load indicator for inline use
 */
export function MstLoadDot({ count, isAvailable = true }: { count: number; isAvailable?: boolean }) {
    const getColor = () => {
        if (!isAvailable) return 'bg-gray-400';
        if (count <= 2) return 'bg-emerald-500';
        if (count <= 4) return 'bg-amber-500';
        return 'bg-red-500';
    };

    return (
        <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${getColor()}`} />
            <span className="text-[10px] font-bold text-text-tertiary">{count}</span>
        </div>
    );
}

/**
 * Load bar visualization
 */
export function MstLoadBar({ 
    load, 
    maxLoad = 6 
}: { 
    load: MstLoad; 
    maxLoad?: number;
}) {
    const { activeTicketCount, pausedTicketCount, isAvailable } = load;
    const activePercent = Math.min((activeTicketCount / maxLoad) * 100, 100);
    const pausedPercent = Math.min((pausedTicketCount / maxLoad) * 100, 100 - activePercent);

    const getActiveColor = () => {
        if (!isAvailable) return 'bg-gray-400';
        if (activeTicketCount <= 2) return 'bg-emerald-500';
        if (activeTicketCount <= 4) return 'bg-amber-500';
        return 'bg-red-500';
    };

    return (
        <div className="w-full">
            <div className="flex justify-between items-center mb-1">
                <span className="text-xs text-text-secondary">{load.fullName}</span>
                <span className="text-[10px] text-text-tertiary">
                    {activeTicketCount} active {pausedTicketCount > 0 && `+ ${pausedTicketCount} paused`}
                </span>
            </div>
            <div className="h-2 bg-surface-elevated rounded-full overflow-hidden flex">
                <div 
                    className={`h-full ${getActiveColor()} transition-all duration-300`}
                    style={{ width: `${activePercent}%` }}
                />
                {pausedTicketCount > 0 && (
                    <div 
                        className="h-full bg-amber-500/50 transition-all duration-300"
                        style={{ width: `${pausedPercent}%` }}
                    />
                )}
            </div>
        </div>
    );
}
