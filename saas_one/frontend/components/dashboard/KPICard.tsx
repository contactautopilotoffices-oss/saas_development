/**
 * KPICard
 * Clickable KPI metric card with icon, value, label, and trend indicator.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface KPICardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: LucideIcon;
    trend?: {
        value: string;
        direction: 'up' | 'down' | 'neutral';
    };
    neonAccent?: 'cyan' | 'magenta' | 'none';
    onClick?: () => void;
}

export default function KPICard({
    title,
    value,
    subtitle,
    icon: Icon,
    trend,
    neonAccent = 'none',
    onClick
}: KPICardProps) {
    const getNeonBorderClass = () => {
        if (neonAccent === 'cyan') return 'border-l-4 border-l-[var(--neon-cyan)]';
        if (neonAccent === 'magenta') return 'border-l-4 border-l-[var(--neon-magenta)]';
        return '';
    };

    const getNeonTextClass = () => {
        if (neonAccent === 'cyan') return 'neon-cyan';
        if (neonAccent === 'magenta') return 'neon-magenta';
        return 'text-text-primary';
    };

    const getTrendColor = () => {
        if (trend?.direction === 'up') return 'text-success bg-success/10 border-success/20';
        if (trend?.direction === 'down') return 'text-error bg-error/10 border-error/20';
        return 'text-text-tertiary bg-surface-elevated/50 border-border';
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.4, 0.0, 0.2, 1] }}
            className={`kpi-card h-full flex flex-col justify-between cursor-pointer ${getNeonBorderClass()}`}
            onClick={onClick}
        >
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                    <p className="text-xs font-body tracking-wider text-text-tertiary font-medium mb-1">
                        {title}
                    </p>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-4xl metric-number tracking-tight ${getNeonTextClass()}`}>
                            {value}
                        </span>
                        {trend && (
                            <span className={`text-xs font-semibold px-2 py-1 rounded-[var(--radius-sm)] border font-body ${getTrendColor()}`}>
                                {trend.direction === 'up' && '↑'}
                                {trend.direction === 'down' && '↓'}
                                {trend.direction === 'neutral' && '→'}
                                {' '}{trend.value}
                            </span>
                        )}
                    </div>
                </div>
                <div className="w-12 h-12 kpi-icon flex items-center justify-center flex-shrink-0">
                    <Icon className={`w-6 h-6 text-text-secondary`} />
                </div>
            </div>

            {/* Subtitle */}
            {subtitle && (
                <p className="text-sm font-body text-text-tertiary pt-4 border-t border-border/50">
                    {subtitle}
                </p>
            )}
        </motion.div>
    );
}
