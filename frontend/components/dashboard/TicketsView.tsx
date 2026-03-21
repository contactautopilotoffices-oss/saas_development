'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    AlertCircle, MessageSquare, User, Building2, Clock, CheckCircle2,
    XCircle, RefreshCw, Filter, Send, ChevronRight, Camera, Plus, Pencil, X, Loader2, Activity, Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import TicketCard from '@/frontend/components/shared/TicketCard';
import { useDataCache } from '@/frontend/context/DataCacheContext';
import Skeleton from '@/frontend/components/ui/Skeleton';
import { useAuth } from '@/frontend/context/AuthContext';

interface Ticket {
    id: string;
    title: string;
    description: string;
    category: string;
    status: string;
    priority: string;
    ticket_number: string;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    raised_by?: string;
    assigned_to?: string;
    organization: { id: string; name: string; code: string };
    property: { id: string; name: string; code: string } | null;
    property_id?: string;
    creator: { id: string; full_name: string; email: string; property_memberships?: { role: string; property_id: string }[] };
    assignee: { id: string; full_name: string; email: string; user_photo_url?: string | null } | null;
    ticket_comments: { count: number }[];
    photo_before_url?: string;
    photo_after_url?: string;
    sla_paused?: boolean;
    sla_deadline?: string | null;
    internal?: boolean;
    ticket_escalation_logs?: { from_level: number; to_level: number | null; escalated_at: string; from_employee?: { full_name: string; user_photo_url?: string | null } | null; to_employee?: { full_name: string; user_photo_url?: string | null } | null }[];
}

interface Comment {
    id: string;
    comment: string;
    is_internal: boolean;
    created_at: string;
    user: { id: string; full_name: string; email: string };
}

interface TicketsViewProps {
    propertyId?: string;
    canDelete?: boolean;
    onNewRequest?: () => void;
    initialStatusFilter?: string;
}

const TicketsView: React.FC<TicketsViewProps> = ({ propertyId, canDelete, onNewRequest, initialStatusFilter = 'all' }) => {
    const router = useRouter();
    const { getCachedData, setCachedData } = useDataCache();
    const { membership } = useAuth();

    const [statusFilter, setStatusFilter] = useState<string>(initialStatusFilter);
    const [searchQuery, setSearchQuery] = useState('');
    const cacheKey = `tickets-${propertyId}-${statusFilter}`; // Use statusFilter here for dynamic key

    const [tickets, setTickets] = useState<Ticket[]>(() => getCachedData(`tickets-${propertyId}-${initialStatusFilter}`) || []);
    const [isLoading, setIsLoading] = useState(!getCachedData(`tickets-${propertyId}-${initialStatusFilter}`));
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // Edit Modal State
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    const supabase = createClient();

    useEffect(() => {
        setStatusFilter(initialStatusFilter);
    }, [initialStatusFilter]);

    useEffect(() => {
        // Get current user
        const getCurrentUser = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setCurrentUserId(user.id);
            }
        };
        getCurrentUser();
    }, []);

    useEffect(() => {
        fetchTickets();
    }, [statusFilter, propertyId]);

    const fetchTickets = async () => {
        setIsLoading(true);
        try {
            let url: string;
            if (statusFilter === 'tenant_raised') {
                // Tenant filter: use raisedByRole param instead of status
                url = '/api/tickets?raisedByRole=tenant';
            } else if (statusFilter === 'internal') {
                url = '/api/tickets?isInternal=true';
            } else if (statusFilter === 'all' || statusFilter === 'sla_paused' || statusFilter === 'sla_breached' || statusFilter === 'pending_validation') {
                url = '/api/tickets';
            } else {
                url = `/api/tickets?status=${statusFilter}`;
            }

            if (propertyId) {
                const sep = url.includes('?') ? '&' : '?';
                url += `${sep}propertyId=${propertyId}`;
            }

            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                let fetchedTickets = data.tickets || [];

                // Filter by SLA Paused if selected
                if (statusFilter === 'sla_paused') {
                    fetchedTickets = fetchedTickets.filter((t: Ticket) => t.sla_paused);
                }

                // Filter by Pending Validation
                if (statusFilter === 'pending_validation') {
                    fetchedTickets = fetchedTickets.filter((t: Ticket) => t.status === 'pending_validation');
                }

                // Filter by SLA Breached: deadline has passed and ticket is not resolved/closed
                if (statusFilter === 'sla_breached') {
                    const now = new Date();
                    fetchedTickets = fetchedTickets.filter((t: Ticket) =>
                        t.sla_deadline &&
                        new Date(t.sla_deadline) < now &&
                        !['resolved', 'closed'].includes(t.status)
                    );
                }

                // Sort tickets: strictly by created_at descending (latest first)
                const sorted = [...fetchedTickets].sort((a, b) => {
                    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                });

                setTickets(sorted);
                setCachedData(cacheKey, sorted);
            }
        } catch (error) {
            console.error('Error fetching tickets:', error);
            setTickets([]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
        try {
            const response = await fetch(`/api/tickets/${ticketId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (response.ok) {
                fetchTickets();
            }
        } catch (error) {
            console.error('Error updating ticket:', error);
        }
    };

    const handleDelete = async (e: React.MouseEvent, ticketId: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this ticket?')) return;

        try {
            const response = await fetch(`/api/tickets/${ticketId}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                fetchTickets();
            }
        } catch (error) {
            console.error('Error deleting ticket:', error);
        }
    };

    const handleEditClick = (e: React.MouseEvent, ticket: Ticket) => {
        e.stopPropagation();
        setEditingTicket(ticket);
        setEditTitle(ticket.title);
        setEditDescription(ticket.description);
    };

    const handleEditSubmit = async () => {
        if (!editingTicket || !editTitle.trim()) return;

        setIsUpdating(true);
        try {
            const response = await fetch(`/api/tickets/${editingTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: editTitle.trim(),
                    description: editDescription.trim()
                })
            });

            if (response.ok) {
                setEditingTicket(null);
                fetchTickets();
            } else {
                const data = await response.json();
                alert(data.error || 'Failed to update ticket');
            }
        } catch (error) {
            console.error('Error updating ticket:', error);
            alert('Failed to update ticket');
        } finally {
            setIsUpdating(false);
        }
    };

    // Check if current user can edit this ticket
    const canEditTicket = (ticket: Ticket): boolean => {
        if (!currentUserId) return false;
        // In this view (mostly used by admins/staff), we rely on the backend for strict checks,
        // but for UI purposes, we'll show the edit button for now.
        return true;
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'critical': return 'text-error bg-error/10 border-error/20';
            case 'high': return 'text-warning bg-warning/10 border-warning/20';
            case 'medium': return 'text-secondary bg-secondary/10 border-secondary/20';
            case 'low': return 'text-text-tertiary bg-surface-elevated border-border';
            default: return 'text-text-tertiary bg-surface-elevated border-border';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'resolved':
            case 'closed':
                return 'text-success bg-success/10 border-success/20';
            case 'in_progress':
            case 'assigned':
                return 'text-info bg-info/10 border-info/20';
            case 'open': return 'text-warning bg-warning/10 border-warning/20';
            case 'waitlist': return 'text-slate-500 bg-slate-100 border-slate-200';
            default: return 'text-text-tertiary bg-surface-elevated border-border';
        }
    };

    const filteredTickets = searchQuery.trim()
        ? tickets.filter(t =>
            t.ticket_number?.toLowerCase().includes(searchQuery.trim().toLowerCase()) ||
            t.title?.toLowerCase().includes(searchQuery.trim().toLowerCase())
          )
        : tickets;

    return (
        <div className="space-y-4 sm:space-y-6 px-1 sm:px-0">
            {/* Header with Filters */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 px-1 sm:px-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <h3 className="text-xl font-display font-bold text-text-primary whitespace-nowrap">Support Tickets</h3>
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-text-tertiary shrink-0" />
                        <select
                            value={statusFilter}
                            onChange={(e) => {
                                const newFilter = e.target.value;
                                setStatusFilter(newFilter);
                                // Update URL with new filter
                                const url = new URL(window.location.href);
                                if (newFilter !== 'all') {
                                    url.searchParams.set('filter', newFilter);
                                } else {
                                    url.searchParams.delete('filter');
                                }
                                window.history.pushState({}, '', url.toString());
                            }}
                            className="h-9 w-full sm:w-auto px-3 bg-surface border border-border rounded-[var(--radius-md)] text-xs font-semibold font-body text-text-primary transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50"
                        >
                            <option value="all">All</option>
                            <option value="resolved,closed">Completed</option>
                            <option value="open,assigned,in_progress,blocked">Open</option>
                            <option value="waitlist">Waitlist</option>
                            <option value="sla_paused">SLA Paused</option>
                            <option value="sla_breached">SLA Breached</option>
                            <option value="pending_validation">Pending Validation</option>
                            <option value="tenant_raised">Client Raised</option>
                            <option value="internal">Internal</option>
                        </select>
                    </div>
                    {!isLoading && (
                        <span className="px-2.5 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full whitespace-nowrap">
                            {filteredTickets.length} Result{filteredTickets.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2 sm:gap-3">
                    {/* Search by Ticket ID */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search by ticket ID..."
                            className="h-9 pl-8 pr-3 w-44 sm:w-52 bg-surface border border-border rounded-[var(--radius-md)] text-xs font-semibold font-body text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50 transition-smooth"
                        />
                        {searchQuery && (
                            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary">
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    {propertyId && !['org_super_admin', 'master_admin', 'owner'].includes(membership?.org_role || '') && (
                        <button
                            onClick={() => router.push(`/property/${propertyId}/flow-map?from=requests`)}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-secondary/10 text-secondary text-[10px] sm:text-xs font-bold rounded-[var(--radius-md)] border border-secondary/20 hover:bg-secondary/20 transition-all active:scale-[0.98]"
                            title="View Operational Flow Map"
                        >
                            <Activity className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="whitespace-nowrap">Live Flow Map</span>
                        </button>
                    )}
                    {onNewRequest && (
                        <button
                            onClick={onNewRequest}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-primary text-text-inverse text-[10px] sm:text-xs font-bold rounded-[var(--radius-md)] hover:opacity-90 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]"
                        >
                            <Plus className="w-3 h-3 sm:w-4 sm:h-4" /> <span className="whitespace-nowrap">New Request</span>
                        </button>
                    )}
                    <button
                        onClick={fetchTickets}
                        className="p-2 bg-surface-elevated/50 hover:bg-surface-elevated rounded-[var(--radius-md)] transition-smooth shrink-0"
                    >
                        <RefreshCw className="w-4 h-4 text-text-secondary" />
                    </button>
                </div>
            </div>

            {/* Tickets List */}
            <div className="glass-card overflow-hidden">
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-6 p-1.5 sm:p-6">
                        {[1, 2, 3, 4, 5, 6].map((i) => (
                            <div key={i} className="w-full h-[220px] bg-white rounded-2xl border border-gray-100 p-5 flex flex-col gap-4">
                                <div className="flex justify-between items-start gap-4">
                                    <div className="flex-1 flex gap-3">
                                        <Skeleton className="w-16 h-16 rounded-xl flex-shrink-0" />
                                        <div className="flex-1 space-y-2">
                                            <Skeleton className="h-4 w-3/4 rounded" />
                                            <Skeleton className="h-4 w-1/2 rounded" />
                                        </div>
                                    </div>
                                    <Skeleton className="w-16 h-8 rounded-lg" />
                                </div>
                                <div className="flex gap-2">
                                    <Skeleton className="h-6 w-16 rounded-full" />
                                    <Skeleton className="h-6 w-20 rounded-full" />
                                </div>
                                <div className="mt-auto pt-4 border-t border-gray-50 flex justify-between items-center">
                                    <Skeleton className="h-4 w-24 rounded" />
                                    <Skeleton className="h-8 w-24 rounded-lg" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredTickets.length === 0 ? (
                    <div className="p-12 text-center text-text-tertiary font-body">
                        {searchQuery ? `No tickets found matching "${searchQuery}"` : 'No tickets found'}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-6 p-1.5 sm:p-6">
                        {filteredTickets.map((ticket) => (
                            <TicketCard
                                key={ticket.id}
                                id={ticket.id}
                                title={ticket.title}
                                priority={ticket.priority?.toUpperCase() as any || 'MEDIUM'}
                                status={
                                    ['closed', 'resolved'].includes(ticket.status) ? 'COMPLETED' :
                                        ticket.status === 'in_progress' ? 'IN_PROGRESS' :
                                            ticket.assigned_to ? 'ASSIGNED' : 'OPEN'
                                }
                                ticketNumber={ticket.ticket_number}
                                createdAt={ticket.created_at}
                                assignedTo={ticket.assignee?.full_name}
                                assigneePhotoUrl={ticket.assignee?.user_photo_url}
                                photoUrl={ticket.photo_before_url}
                                isSlaPaused={ticket.sla_paused}
                                propertyName={ticket.property?.name}
                                escalationChain={(() => {
                                    const logs = ticket.ticket_escalation_logs;
                                    if (!logs || logs.length === 0) return undefined;
                                    const sorted = [...logs].sort((a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime());
                                    const chain: { name: string; avatar?: string | null }[] = [];
                                    sorted.forEach((log, i) => {
                                        if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url });
                                        if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url });
                                    });
                                    return chain.length > 0 ? chain : undefined;
                                })()}
                                raisedByTenant={(ticket.creator?.property_memberships || []).some((m) => m.property_id === (ticket.property_id || ticket.property?.id) && ['tenant', 'super_tenant'].includes((m.role || '').toLowerCase()))}
                                onClick={() => router.push(`/tickets/${ticket.id}?from=requests`)}
                                onEdit={canEditTicket(ticket) ? (e) => handleEditClick(e, ticket) : undefined}
                                onDelete={canDelete ? (e) => handleDelete(e, ticket.id) : undefined}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            <AnimatePresence>
                {editingTicket && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setEditingTicket(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-6 border-b border-slate-200">
                                <h2 className="text-xl font-bold text-slate-900">Edit Request</h2>
                                <button
                                    onClick={() => setEditingTicket(null)}
                                    className="text-slate-400 hover:text-slate-700 transition-colors p-1 hover:bg-slate-100 rounded-lg"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Modal Content */}
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="text-sm font-bold text-slate-700 mb-2 block">Title</label>
                                    <input
                                        type="text"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                                        placeholder="Request title"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-bold text-slate-700 mb-2 block">Description</label>
                                    <textarea
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        className="w-full h-32 px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all"
                                        placeholder="Describe the issue in your own words...&#10;Example: Leaking tap in kitchenette, 2nd floor"
                                    />
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
                                <button
                                    onClick={() => setEditingTicket(null)}
                                    className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleEditSubmit}
                                    disabled={isUpdating || !editTitle.trim()}
                                    className="flex items-center gap-2 px-5 py-2 bg-primary text-white font-bold rounded-xl hover:opacity-90 transition-colors disabled:opacity-50"
                                >
                                    {isUpdating ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <CheckCircle2 className="w-4 h-4" />
                                    )}
                                    Save Changes
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
};

export default TicketsView;

