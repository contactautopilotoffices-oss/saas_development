/**
 * OpsTicketCard (deprecated)
 * Legacy operations ticket card. Use TicketCard instead.
 * @deprecated
 */

'use client';

import { motion } from 'framer-motion';
import { Clock, User, Wrench, Zap, Droplets, Sparkles } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface TicketCardProps {
    id: string;
    title: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: string;
    assignedToName?: string;
    createdAt: string;
    skillTag?: string; // 'technical', 'electrical', 'plumbing', 'soft_services'
    onClick: () => void;
}

const priorityConfig = {
    low: { color: 'text-success', bg: 'bg-success/10', border: 'border-success/20' },
    medium: { color: 'text-info', bg: 'bg-info/10', border: 'border-info/20' },
    high: { color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
    critical: { color: 'text-error', bg: 'bg-error/10', border: 'border-error/20' },
};

const skillConfig: Record<string, { icon: typeof Wrench; color: string; label: string }> = {
    technical: { icon: Wrench, color: 'text-info', label: 'Tech' },
    electrical: { icon: Zap, color: 'text-warning', label: 'Elec' },
    plumbing: { icon: Droplets, color: 'text-success', label: 'Plumb' },
    soft_services: { icon: Sparkles, color: 'text-secondary', label: 'Soft' },
};

function getRelativeTime(dateStr: string): string {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    if (diffMins > 0) return `${diffMins}m ago`;
    return 'Just now';
}

export default function TicketCard({
    id,
    title,
    priority,
    status,
    assignedToName,
    createdAt,
    skillTag,
    onClick,
}: TicketCardProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: id,
    });

    const style = transform ? {
        transform: CSS.Translate.toString(transform),
        zIndex: 1000,
        opacity: isDragging ? 0.5 : 1,
    } : undefined;

    const config = priorityConfig[priority] || priorityConfig.medium;
    const shortId = id.slice(-4).toUpperCase();
    const timeAgo = getRelativeTime(createdAt);
    const skill = skillTag ? skillConfig[skillTag] : null;
    const SkillIcon = skill?.icon;

    return (
        <motion.div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            whileHover={{ scale: 1.02, backgroundColor: 'var(--surface-elevated)' }}
            className={`
                p-3 mb-2 rounded-lg border ${status === 'in_progress' ? 'border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.3)]' : config.border} bg-surface/50 backdrop-blur-sm
                cursor-grab active:cursor-grabbing transition-shadow hover:shadow-lg relative overflow-hidden
            `}
            onClick={onClick}
        >
            {status === 'in_progress' && (
                <div className="absolute top-0 right-0 p-1">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                    </span>
                </div>
            )}

            {/* Top row: ID, Skill Tag, Priority */}
            <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                <span className="text-[10px] font-mono font-bold text-text-muted bg-muted px-1.5 py-0.5 rounded">
                    T-{shortId}
                </span>
                {skill && SkillIcon && (
                    <span className={`text-[9px] font-bold uppercase flex items-center gap-0.5 ${skill.color} bg-muted px-1.5 py-0.5 rounded`}>
                        <SkillIcon className="w-2.5 h-2.5" />
                        {skill.label}
                    </span>
                )}
                <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color} ${config.bg} px-2 py-0.5 rounded-full ml-auto`}>
                    {priority}
                </span>
            </div>

            <h4 className="text-sm font-semibold text-text-primary line-clamp-1 mb-2">
                {title}
            </h4>

            {/* Bottom row: Time ago, Assigned to */}
            <div className="flex items-center justify-between text-[10px] text-text-tertiary">
                <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{timeAgo}</span>
                </div>
                {assignedToName && (
                    <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        <span className="truncate max-w-[80px]">{assignedToName}</span>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

