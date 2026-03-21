'use client';

import { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle, User, MapPin, ChevronRight } from 'lucide-react';
import Link from 'next/link';

interface Ticket {
    id: string;
    ticket_number: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    created_at: string;
    sla_deadline: string | null;
    sla_breached: boolean;
    is_internal: boolean;
    current_escalation_level?: number;
    category?: { name: string; icon: string };
    creator?: { full_name: string };
    assignee?: { full_name: string };
}

interface TicketListProps {
    propertyId: string;
    status?: string;
    isInternal?: boolean;
    assignedTo?: string;
    createdBy?: string;
    onTicketClick?: (ticket: Ticket) => void;
}

const STATUS_COLORS: Record<string, string> = {
    open: 'bg-blue-500/20 text-blue-400',
    waitlist: 'bg-yellow-500/20 text-yellow-400',
    assigned: 'bg-purple-500/20 text-purple-400',
    in_progress: 'bg-cyan-500/20 text-cyan-400',
    blocked: 'bg-red-500/20 text-red-400',
    resolved: 'bg-green-500/20 text-green-400',
    closed: 'bg-gray-500/20 text-gray-400',
};

const PRIORITY_COLORS: Record<string, string> = {
    low: 'bg-gray-500/20 text-gray-400',
    medium: 'bg-blue-500/20 text-blue-400',
    high: 'bg-orange-500/20 text-orange-400',
    urgent: 'bg-red-500/20 text-red-400',
};

function getSLAStatus(deadline: string | null, breached: boolean) {
    if (breached) return { text: 'SLA Breached', color: 'text-red-400' };
    if (!deadline) return null;

    const now = new Date();
    const sla = new Date(deadline);
    const diffMs = sla.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 0) return { text: 'SLA Breached', color: 'text-red-400' };
    if (diffMins < 30) return { text: `${diffMins}m left`, color: 'text-red-400' };
    if (diffMins < 60) return { text: `${diffMins}m left`, color: 'text-orange-400' };

    const hours = Math.floor(diffMins / 60);
    return { text: `${hours}h left`, color: 'text-gray-400' };
}

export default function TicketList({
    propertyId,
    status,
    isInternal,
    assignedTo,
    createdBy,
    onTicketClick,
}: TicketListProps) {
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchTickets();
    }, [propertyId, status, isInternal, assignedTo, createdBy]);

    const fetchTickets = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ propertyId });
            if (status) params.append('status', status);
            if (isInternal !== undefined) params.append('isInternal', String(isInternal));
            if (assignedTo) params.append('assignedTo', assignedTo);
            if (createdBy) params.append('createdBy', createdBy);

            const response = await fetch(`/api/tickets?${params}`);
            const data = await response.json();

            if (!response.ok) throw new Error(data.error);
            setTickets(data.tickets || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load tickets');
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-[#161b22] rounded-xl p-4 animate-pulse">
                        <div className="h-4 bg-[#21262d] rounded w-3/4 mb-2" />
                        <div className="h-3 bg-[#21262d] rounded w-1/2" />
                    </div>
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-8 text-red-400">
                <AlertTriangle className="w-8 h-8 mx-auto mb-2" />
                {error}
            </div>
        );
    }

    if (tickets.length === 0) {
        return (
            <div className="text-center py-12 text-gray-400">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No tickets found</p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {tickets.map((ticket) => {
                const slaStatus = getSLAStatus(ticket.sla_deadline, ticket.sla_breached);

                return (
                    <div
                        key={ticket.id}
                        onClick={() => onTicketClick?.(ticket)}
                        className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 hover:border-[#484f58] transition-colors cursor-pointer"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                {/* Title & Category */}
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs text-gray-500">{ticket.ticket_number}</span>
                                    {ticket.category && (
                                        <span className="text-xs px-2 py-0.5 bg-[#21262d] rounded text-gray-400">
                                            {ticket.category.name}
                                        </span>
                                    )}
                                    {ticket.is_internal && (
                                        <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                                            Internal
                                        </span>
                                    )}
                                    {ticket.current_escalation_level ? (
                                        <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded flex items-center gap-1 border border-red-500/30">
                                            <AlertTriangle className="w-3 h-3" />
                                            L{ticket.current_escalation_level} Escalation
                                        </span>
                                    ) : null}
                                </div>

                                <h3 className="text-white font-medium truncate">{ticket.title}</h3>

                                {/* Meta */}
                                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                                    {ticket.creator && (
                                        <span className="flex items-center gap-1">
                                            <User className="w-3 h-3" />
                                            {ticket.creator.full_name}
                                        </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(ticket.created_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>

                            <div className="flex flex-col items-end gap-2">
                                {/* Status & Priority */}
                                <div className="flex items-center gap-2">
                                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[ticket.status]}`}>
                                        {ticket.status.replace(/_/g, ' ')}
                                    </span>
                                    <span className={`text-xs px-2 py-1 rounded-full ${PRIORITY_COLORS[ticket.priority]}`}>
                                        {ticket.priority}
                                    </span>
                                </div>

                                {/* SLA */}
                                {slaStatus && (
                                    <span className={`text-xs ${slaStatus.color}`}>
                                        {slaStatus.text}
                                    </span>
                                )}

                                <ChevronRight className="w-4 h-4 text-gray-500" />
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
