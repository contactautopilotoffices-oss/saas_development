/**
 * KanbanCard
 * Card component for tickets displayed in Kanban board columns.
 * @remarks Client component.
 */

'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import { Clock, User, Wrench, Zap, Droplets, Sparkles, GripVertical } from 'lucide-react';

interface Ticket {
    id: string;
    title: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: string;
    assigned_to: string | null;
    skill_group?: { code: string; name: string };
    created_at: string;
    mst?: { full_name: string };
}

interface KanbanCardProps {
    ticket: Ticket;
    isDragging?: boolean;
}

const priorityConfig = {
    low: { color: 'text-success', bg: 'bg-success/10', border: 'border-success/30' },
    medium: { color: 'text-info', bg: 'bg-info/10', border: 'border-info/30' },
    high: { color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
    critical: { color: 'text-error', bg: 'bg-error/10', border: 'border-error/30' },
};

const skillConfig: Record<string, { icon: typeof Wrench; color: string; label: string }> = {
    technical: { icon: Wrench, color: 'text-blue-500', label: 'Tech' },
    electrical: { icon: Zap, color: 'text-orange-500', label: 'Elec' },
    plumbing: { icon: Droplets, color: 'text-emerald-500', label: 'Plumb' },
    soft_services: { icon: Sparkles, color: 'text-purple-500', label: 'Soft' },
};

function getRelativeTime(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d`;
    if (diffHours > 0) return `${diffHours}h`;
    if (diffMins > 0) return `${diffMins}m`;
    return 'now';
}

/**
 * Kanban Card - Draggable ticket card for Kanban board
 * PRD 5.3: Drag between columns = status change, between swimlanes = reassignment
 */
export default function KanbanCard({ ticket, isDragging = false }: KanbanCardProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging: isSortableDragging,
    } = useSortable({ id: ticket.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const config = priorityConfig[ticket.priority] || priorityConfig.medium;
    const shortId = ticket.id.slice(-4).toUpperCase();
    const timeAgo = getRelativeTime(ticket.created_at);
    const skill = ticket.skill_group?.code ? skillConfig[ticket.skill_group.code] : null;
    const SkillIcon = skill?.icon;

    const isBeingDragged = isDragging || isSortableDragging;

    return (
        <motion.div
            ref={setNodeRef}
            style={style}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`
                p-3 rounded-lg border ${config.border} bg-surface backdrop-blur-sm relative
                cursor-grab active:cursor-grabbing transition-all select-none
                ${isBeingDragged ? 'opacity-90 shadow-2xl scale-105 rotate-2' : 'hover:shadow-md'}
            `}
            {...attributes}
            {...listeners}
        >
            {/* Drag Handle Indicator */}
            <div className="absolute top-2 right-2 opacity-30 group-hover:opacity-60">
                <GripVertical className="w-3 h-3" />
            </div>

            {/* Top Row: ID, Skill, Priority */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap pr-4">
                <span className="text-[9px] font-mono font-bold text-text-muted bg-muted px-1.5 py-0.5 rounded">
                    T-{shortId}
                </span>
                {skill && SkillIcon && (
                    <span className={`text-[8px] font-bold uppercase flex items-center gap-0.5 ${skill.color} bg-muted/50 px-1 py-0.5 rounded`}>
                        <SkillIcon className="w-2 h-2" />
                        {skill.label}
                    </span>
                )}
                <span className={`text-[9px] font-bold uppercase ${config.color} ${config.bg} px-1.5 py-0.5 rounded-full ml-auto`}>
                    {ticket.priority}
                </span>
            </div>

            {/* Title */}
            <h4 className="text-xs font-semibold text-text-primary line-clamp-2 mb-2">
                {ticket.title}
            </h4>

            {/* Bottom Row: Time, Assignee */}
            <div className="flex items-center justify-between text-[9px] text-text-tertiary">
                <div className="flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{timeAgo}</span>
                </div>
                {ticket.mst?.full_name && (
                    <div className="flex items-center gap-1">
                        <User className="w-2.5 h-2.5" />
                        <span className="truncate max-w-[60px]">{ticket.mst.full_name}</span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}
