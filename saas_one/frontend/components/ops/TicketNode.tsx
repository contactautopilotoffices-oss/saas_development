/**
 * TicketNode - Draggable, status-colored ticket card rendered in the flow map.
 *
 * Displays a compact rectangular badge showing the ticket's status symbol (A=Assigned/W,
 * W=Waitlist, C=Completed), the short ticket ID, and optionally the MST assignee's initials.
 * Supports hover tooltips with the full title, description, and assignee name. Integrates
 * with @dnd-kit's useDraggable for drag-and-drop within the flow map. When used as a
 * DragOverlay ghost, the draggable behavior is disabled.
 *
 * PRD color coding: Assigned=Yellow(A), Waitlisted=Red(W), Completed=Green(C).
 *
 * @example
 * <TicketNode
 *   id="ticket-1"
 *   ticketNumber="T-00042"
 *   status="assigned"
 *   assignedToName="John Doe"
 *   onClick={() => openTicket('ticket-1')}
 * />
 */
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';

interface TicketNodeProps {
    id: string;
    ticketNumber: string;
    status: string; // 'assigned', 'waitlist', 'completed', 'in_progress', 'resolved', 'closed'
    title?: string;
    description?: string;
    assignedToName?: string;
    onClick?: () => void;
    isSaving?: boolean;
    isOverlay?: boolean;
}

const statusConfig: Record<string, { bg: string; text: string; symbol: string }> = {
    assigned: { bg: '#fbbf24', text: '#000000', symbol: 'A' },
    in_progress: { bg: '#fbbf24', text: '#000000', symbol: 'A' },
    waitlist: { bg: '#ef4444', text: '#ffffff', symbol: 'W' },
    completed: { bg: '#10b981', text: '#ffffff', symbol: 'C' },
    resolved: { bg: '#10b981', text: '#ffffff', symbol: 'C' },
    closed: { bg: '#10b981', text: '#ffffff', symbol: 'C' },
};

/**
 * TicketNode - Rendered as a status-colored rectangular ticket box
 * PRD Lock: Assigned=Yellow(A), Waitlisted=Red(W), Completed=Green(C)
 * Enhanced: Larger size, MST info, and hover details
 */
export default function TicketNode({
    id,
    ticketNumber,
    status,
    title,
    description,
    assignedToName,
    onClick,
    isSaving,
    isOverlay,
}: TicketNodeProps) {
    const [isHovered, setIsHovered] = useState(false);

    // DND Kit Draggable - skip if this is the overlay ghost
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: id,
        disabled: isSaving || isOverlay,
    });

    // When used in DragOverlay, we don't want the node behaving like a draggable source
    const dragListeners = isOverlay ? {} : listeners;
    const dragAttributes = isOverlay ? {} : attributes;
    const dragRef = isOverlay ? null : setNodeRef;

    const config = statusConfig[status.toLowerCase()] || statusConfig.waitlist;
    const shortId = ticketNumber.replace('T-', '').slice(-4);

    // Get MST initials if assigned
    const mstInitials = assignedToName
        ? assignedToName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
        : null;

    const style = transform ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 1000,
    } : undefined;

    return (
        <div
            className="relative"
            ref={dragRef}
            style={{ ...style, touchAction: 'none' }}
            {...dragListeners}
            {...dragAttributes}
            onClick={(e) => {
                e.stopPropagation();
                if (!isDragging && onClick) onClick();
            }}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{
                    scale: isDragging ? 1.05 : 1,
                    opacity: isDragging ? 0 : 1
                }}
                whileHover={{ scale: 1.1, zIndex: 50 }}
                onHoverStart={() => setIsHovered(true)}
                onHoverEnd={() => setIsHovered(false)}
                className="flex flex-col items-center justify-center cursor-pointer select-none overflow-hidden relative shadow-sm"
                style={{
                    backgroundColor: config.bg,
                    color: config.text,
                    width: '80px', // Increased size
                    height: '44px', // Increased size
                    borderRadius: '6px',
                    border: '1px solid rgba(0,0,0,0.1)',
                    touchAction: 'none',
                }}
            >
                <div className="flex flex-col items-center justify-center leading-none">
                    {isSaving ? (
                        <div className="animate-spin mb-1">
                            <svg className="w-3 h-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1">
                            <span className="text-[14px] font-black uppercase tracking-tighter">
                                {config.symbol}
                            </span>
                            {mstInitials && (
                                <span className="text-[10px] font-black opacity-90 bg-black/10 px-1.5 rounded-sm">
                                    {mstInitials}
                                </span>
                            )}
                        </div>
                    )}
                    <span className="text-[9px] font-bold opacity-80 mt-0.5">
                        #{shortId}
                    </span>
                </div>
            </motion.div>

            {/* Hover Tooltip */}
            <AnimatePresence>
                {isHovered && (title || description) && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.95 }}
                        className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-3 bg-surface-elevated border border-border rounded-xl shadow-2xl z-[100] pointer-events-none"
                    >
                        {title && (
                            <div className="text-[11px] font-black text-text-primary mb-1 line-clamp-2 leading-tight uppercase tracking-tight">
                                {title}
                            </div>
                        )}
                        {description && (
                            <div className="text-[9px] text-text-secondary line-clamp-3 leading-snug">
                                {description}
                            </div>
                        )}
                        {assignedToName && (
                            <div className="mt-2 pt-2 border-t border-border/50 flex items-center gap-1.5">
                                <div className="w-4 h-4 rounded-full bg-primary/10 flex items-center justify-center text-[8px] font-black text-primary">
                                    {mstInitials}
                                </div>
                                <span className="text-[9px] font-black text-text-primary truncate">
                                    {assignedToName}
                                </span>
                            </div>
                        )}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 bg-surface-elevated border-t border-l border-border rotate-45 -mb-1" />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
