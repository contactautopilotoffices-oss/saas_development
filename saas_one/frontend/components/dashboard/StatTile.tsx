/**
 * StatTile
 * Displays a single KPI statistic with label, value, and optional icon.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatTileProps {
    label: string;
    value: string | number;
    trend?: {
        value: string;
        isUp: boolean;
    };
    subtitle?: string;
    icon?: LucideIcon;
    neonAccent?: 'cyan' | 'magenta' | 'none';
}

export default function StatTile({ 
    label, 
    value, 
    trend, 
    subtitle, 
    icon: Icon,
    neonAccent = 'none' 
}: StatTileProps) {
    const getNeonClass = () => {
        if (neonAccent === 'cyan') return 'neon-cyan';
        if (neonAccent === 'magenta') return 'neon-magenta';
        return 'text-text-primary';
    };

    const getBorderClass = () => {
        if (neonAccent === 'cyan') return 'border-l-4 border-l-[var(--neon-cyan)]';
        if (neonAccent === 'magenta') return 'border-l-4 border-l-[var(--neon-magenta)]';
        return '';
    };

    return (
        <div className={`kpi-card flex flex-col justify-between h-full ${getBorderClass()}`}>
            <div>
                <div className="flex items-center justify-between mb-6">
                    <p className="text-xs font-body tracking-wider text-text-tertiary font-medium">
                        {label}
                    </p>
                    {Icon && (
                        <div className="w-10 h-10 kpi-icon flex items-center justify-center">
                            <Icon className="w-5 h-5 text-text-secondary" />
                        </div>
                    )}
                </div>
                
                <div className="flex items-baseline gap-3">
                    <span className={`text-4xl metric-number tracking-tight ${getNeonClass()}`}>
                        {value}
                    </span>
                    
                    {trend && (
                        <span className={
                            `text-xs font-semibold px-2 py-1 rounded-[var(--radius-sm)] font-body
                            ${trend.isUp 
                                ? 'bg-success/10 text-success border border-success/20' 
                                : 'bg-error/10 text-error border border-error/20'
                            }`
                        }>
                            {trend.isUp ? '↑' : '↓'} {trend.value}
                        </span>
                    )}
                </div>
            </div>
            
            {subtitle && (
                <p className="text-sm font-body text-text-tertiary mt-4 pt-4 border-t border-border/50">
                    {subtitle}
                </p>
            )}
        </div>
    );
}
