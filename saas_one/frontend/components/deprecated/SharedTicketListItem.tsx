/**
 * SharedTicketListItem (deprecated)
 * Legacy shared ticket list item. Use TicketListItem instead.
 * @deprecated
 */

'use client';

import React from 'react';
import { Ticket, Camera, Pencil } from 'lucide-react';
import Image from 'next/image';
import { motion } from 'framer-motion';

/**
 * Standard Ticket List Item Component
 * 
 * Use this for all list views across dashboards (MST, Staff, Tenant, Property Admin)
 * Follows the Component Contract defined in COMPONENT_CONTRACT.md
 */

export interface TicketListItemProps {
    ticket: {
        id: string;
        title: string;
        description: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
        status: string;
        ticket_number: string;
        created_at: string;
        assigned_to?: string;
        raised_by?: string;
        assignee?: { full_name: string };
        photo_before_url?: string;
    };
    currentUserId: string;
    onClick: (id: string) => void;
    onEdit?: (e: React.MouseEvent, ticket: TicketListItemProps['ticket']) => void;
    isCompleted?: boolean;
}

const priorityConfig = {
    low: { color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
    medium: { color: 'text-info', bg: 'bg-info/10', border: 'border-info/20' },
    high: { color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
    critical: { color: 'text-error', bg: 'bg-error/10', border: 'border-error/20' },
};

export default function TicketListItem({
    ticket,
    currentUserId,
    onClick,
    onEdit,
    isCompleted = false,
}: TicketListItemProps) {
    const config = priorityConfig[ticket.priority] || priorityConfig.medium;
    const isAssignedToUser = ticket.assigned_to === currentUserId;
    const isRaisedByUser = ticket.raised_by === currentUserId;

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => onClick(ticket.id)}
            className={`
        bg-surface-elevated border rounded-lg p-3 transition-all group cursor-pointer
        ${isCompleted
                    ? 'opacity-75 grayscale-[0.3] border-border'
                    : isAssignedToUser
                        ? 'border-success ring-1 ring-success/20 shadow-md ring-offset-1 ring-offset-background'
                        : 'border-border hover:border-primary/50 shadow-sm hover:shadow-md'
                }
      `}
        >
            {/* Header Row: Title + Badges */}
            <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <h3 className={`
            text-sm font-semibold truncate max-w-[300px] md:max-w-md
            ${isCompleted ? 'text-text-secondary line-through decoration-text-tertiary' : 'text-text-primary'}
          `}>
                        {ticket.title}
                    </h3>

                    {/* Assignment Badge */}
                    {isAssignedToUser ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-success text-text-inverse font-black uppercase tracking-tighter shadow-sm shrink-0">
                            YOUR TASK
                        </span>
                    ) : ticket.assigned_to ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-info/10 text-info border border-info/20 shrink-0">
                            {ticket.assignee?.full_name || 'Assigned'}
                        </span>
                    ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-warning/10 text-warning border border-warning/20 shrink-0">
                            Unassigned
                        </span>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5 shrink-0">
                    {/* Priority Badge */}
                    {ticket.priority && (
                        <span className={`
              text-[10px] px-1.5 py-0.5 rounded font-medium border
              ${config.bg} ${config.color} ${config.border}
            `}>
                            {ticket.priority}
                        </span>
                    )}

                    {/* Edit Button - Only for user's own tickets */}
                    {isRaisedByUser && !isCompleted && onEdit && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(e, ticket);
                            }}
                            className="p-1 px-2 text-primary hover:bg-primary/10 rounded border border-primary/20 transition-smooth flex items-center gap-1.5"
                            title="Edit Request"
                        >
                            <Pencil className="w-3 h-3" />
                            <span className="text-[9px] font-black uppercase tracking-widest">Edit</span>
                        </button>
                    )}

                    {/* View Button */}
                    <button
                        className={`
              text-[10px] px-3 py-1 rounded transition-all font-bold uppercase tracking-widest
              ${isCompleted
                                ? 'bg-muted text-text-tertiary shadow-none'
                                : 'bg-primary text-text-inverse hover:shadow-lg shadow-primary/20'
                            }
            `}
                    >
                        View
                    </button>
                </div>
            </div>

            {/* Content Row: Photo + Description */}
            <div className="flex gap-4">
                {/* Photo Thumbnail */}
                {ticket.photo_before_url && (
                    <div className="relative group/thumb shrink-0">
                        <Image
                            src={ticket.photo_before_url}
                            alt="Before"
                            width={64}
                            height={64}
                            loading="lazy"
                            className="w-16 h-16 rounded-lg object-cover border border-border group-hover/thumb:border-emerald-500 transition-colors"
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 rounded-lg transition-opacity">
                            <Camera className="w-4 h-4 text-white" />
                        </div>
                    </div>
                )}

                {/* Description + Metadata */}
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-text-tertiary line-clamp-2 mb-2">
                        {ticket.description}
                    </p>

                    {/* Metadata Footer */}
                    <div className="flex items-center gap-2 text-[10px] text-text-tertiary/60 font-medium flex-wrap">
                        <span className="flex items-center gap-1">
                            <Ticket className="w-3 h-3" />
                            {ticket.ticket_number}
                        </span>
                        <span>•</span>
                        <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className={`
              uppercase font-bold
              ${isCompleted
                                ? 'text-success/60'
                                : ticket.status === 'in_progress'
                                    ? 'text-info'
                                    : ticket.assigned_to
                                        ? 'text-primary'
                                        : 'text-text-tertiary'
                            }
            `}>
                            {ticket.status === 'closed' || ticket.status === 'resolved'
                                ? 'COMPLETE'
                                : ticket.assigned_to && (ticket.status === 'waitlist' || ticket.status === 'open')
                                    ? 'ASSIGNED'
                                    : ticket.status.replace('_', ' ')
                            }
                        </span>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
