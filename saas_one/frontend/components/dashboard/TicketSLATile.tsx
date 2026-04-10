/**
 * TicketSLATile
 * Displays open ticket count and SLA compliance percentage for a property.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface TicketSLATileProps {
    openTickets: number;
    slaPercentage: number;
    highPriorityCount: number;
}

export default function TicketSLATile({
    openTickets,
    slaPercentage,
    highPriorityCount
}: TicketSLATileProps) {
    const getSLAColor = () => {
        if (slaPercentage >= 90) return 'neon-cyan';
        if (slaPercentage >= 75) return 'text-success';
        if (slaPercentage >= 60) return 'text-warning';
        return 'text-error';
    };

    const getSLAProgressColor = () => {
        if (slaPercentage >= 90) return 'bg-[var(--neon-cyan)]';
        if (slaPercentage >= 75) return 'bg-success';
        if (slaPercentage >= 60) return 'bg-warning';
        return 'bg-error';
    };

    return (
        <div className="glass-card p-6 flex flex-col justify-between h-full border-l-4 border-l-[var(--neon-magenta)]">
            <div>
                <h3 className="text-text-primary font-display font-bold text-xl mb-6">Tickets & SLA</h3>

                <div className="space-y-6">
                    {/* Open Tickets */}
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className="text-4xl font-display font-bold neon-magenta">{openTickets}</span>
                            <span className="text-text-tertiary text-xs font-body font-medium uppercase tracking-wider mt-1">
                                Open Tickets
                            </span>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="w-12 h-3 bg-success/30 rounded-full"></div>
                            <div className="w-3 h-3 rounded-full bg-warning/30"></div>
                        </div>
                    </div>

                    {/* SLA Percentage */}
                    <div className="flex items-center justify-between">
                        <div className="flex flex-col">
                            <span className={`text-4xl font-display font-bold ${getSLAColor()}`}>
                                {slaPercentage}%
                            </span>
                            <span className="text-text-tertiary text-xs font-body font-medium uppercase tracking-wider mt-1">
                                SLA Met
                            </span>
                        </div>
                        <div className="w-16 h-2 bg-border rounded-full overflow-hidden">
                            <div 
                                className={`h-full ${getSLAProgressColor()} rounded-full transition-smooth`}
                                style={{ width: `${slaPercentage}%` }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* High Priority Alert */}
            {highPriorityCount > 0 && (
                <div className="mt-6 pt-4 border-t border-border/50 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-warning" />
                    </div>
                    <span className="text-text-secondary font-body font-semibold text-sm">
                        {highPriorityCount} High Priority {highPriorityCount === 1 ? 'Ticket' : 'Tickets'}
                    </span>
                </div>
            )}
        </div>
    );
}
