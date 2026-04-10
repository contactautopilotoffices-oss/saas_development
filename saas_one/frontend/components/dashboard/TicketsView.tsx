/**
 * TicketsView
 * Ticket list and Kanban board view with filtering, sorting, search, and scroll restoration.
 * Supports both grid and Kanban layouts with real-time updates.
 * @remarks Client component using Supabase, AuthContext, GlobalContext.
 */

'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter, usePathname, useSearchParams } from 'next/navigation';
import { CheckCircle2, Filter, Plus, X, Loader2, Activity, Search, Calendar, User, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Custom styled dropdown to replace native <select>
function FilterDropdown({
    value, onChange, options, icon, placeholder
}: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    icon?: React.ReactNode;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const selected = options.find(o => o.value === value);
    const isActive = value !== options[0]?.value;

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(p => !p)}
                className={`flex items-center gap-2 h-9 px-3 bg-white border rounded-full shadow-sm hover:border-slate-300 transition-all text-xs font-semibold whitespace-nowrap ${isActive ? 'border-primary/40 text-primary' : 'border-slate-200 text-slate-600'}`}
            >
                {icon && <span className={isActive ? 'text-primary' : 'text-slate-400'}>{icon}</span>}
                <span>{selected?.label ?? placeholder}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''} ${isActive ? 'text-primary' : 'text-slate-400'}`} />
            </button>

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[180px] max-w-[240px] bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden"
                    >
                        <div className="max-h-60 overflow-y-auto py-1.5">
                            {options.map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => { onChange(opt.value); setOpen(false); }}
                                    className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-xs font-semibold text-left transition-colors hover:bg-slate-50 ${value === opt.value ? 'text-primary bg-primary/5' : 'text-slate-700'}`}
                                >
                                    <span className="truncate">{opt.label}</span>
                                    {value === opt.value && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
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
    organizationId?: string;
    canDelete?: boolean;
    onNewRequest?: () => void;
    initialStatusFilter?: string;
}

const TicketsView: React.FC<TicketsViewProps> = ({ propertyId, organizationId, canDelete, onNewRequest, initialStatusFilter = 'all' }) => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    
    const { getCachedData, setCachedData, invalidateCache } = useDataCache();
    const { membership } = useAuth();

    const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || initialStatusFilter);
    const [categoryFilter, setCategoryFilter] = useState<string>(searchParams.get('category') || 'all');
    const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority_high' | 'priority_low'>((searchParams.get('sortBy') as any) || 'newest');
    const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') || '');
    const [dateTo, setDateTo] = useState(searchParams.get('dateTo') || '');
    const [raisedByFilter, setRaisedByFilter] = useState(searchParams.get('raisedBy') || 'all');
    const [resolvedByFilter, setResolvedByFilter] = useState(searchParams.get('resolvedBy') || 'all');
    const [assignedToFilter, setAssignedToFilter] = useState(searchParams.get('assignedTo') || 'all');
    const [allAssignees, setAllAssignees] = useState<{ id: string; name: string }[]>([]);
    
    // Note: The cacheKey logic heavily depends on the filter values so changes will cleanly bypass legacy state cache instances
    const cacheKey = `tickets-${propertyId ?? organizationId ?? 'all'}-${statusFilter}-${categoryFilter}-${raisedByFilter}-${assignedToFilter}-${searchQuery}-${dateFrom}-${dateTo}`;

    // SWR (Stale-While-Revalidate): Show cached data INSTANTLY, revalidate silently in background
    const cachedTickets = getCachedData(cacheKey);
    const isReturningFromDetail = typeof window !== 'undefined' && !!sessionStorage.getItem('lastTicketId');
    const hasCacheHit = !!cachedTickets && cachedTickets.length > 0;

    const [tickets, setTickets] = useState<Ticket[]>(() => cachedTickets || []);
    const [isLoading, setIsLoading] = useState(!hasCacheHit);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [totalCount, setTotalCount] = useState<number | null>(null);
    const [allCreators, setAllCreators] = useState<{ id: string; name: string }[]>([]);

    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // Edit Modal State
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    const supabase = createClient();

    // Instant Scroll Restoration — runs once on mount when cache data is available
    const scrollRestoredRef = useRef(false);
    useEffect(() => {
        if (scrollRestoredRef.current) return;
        if (tickets.length === 0) return;

        const ticketId = sessionStorage.getItem('lastTicketId');
        const savedScrollY = sessionStorage.getItem('scrollY');
        if (!ticketId && !savedScrollY) return;

        // Data is already rendered from cache — restore immediately
        scrollRestoredRef.current = true;
        const scrollContainer = document.getElementById('main-scroll-container');
        const container = scrollContainer || window;

        // Disable smooth scrolling temporarily
        if (container instanceof HTMLElement) {
            container.style.setProperty('scroll-behavior', 'auto', 'important');
        }

        let retryCount = 0;
        const maxRetries = 8;

        const attemptRestore = () => {
            // Priority 1: Scroll to the exact ticket card
            if (ticketId) {
                const el = document.getElementById(`ticket-${ticketId}`);
                if (el) {
                    el.scrollIntoView({ behavior: 'auto', block: 'center' });
                    sessionStorage.removeItem('lastTicketId');
                    sessionStorage.removeItem('scrollY');
                    sessionStorage.removeItem('ticketsLoadedCount');
                    if (container instanceof HTMLElement) {
                        setTimeout(() => { container.style.scrollBehavior = ''; }, 50);
                    }
                    return;
                }
            }

            // Priority 2: Pixel offset fallback
            if (savedScrollY) {
                const targetY = parseInt(savedScrollY, 10);
                container.scrollTo({ top: targetY, behavior: 'auto' });
                sessionStorage.removeItem('scrollY');
                sessionStorage.removeItem('lastTicketId');
                sessionStorage.removeItem('ticketsLoadedCount');
                if (container instanceof HTMLElement) {
                    setTimeout(() => { container.style.scrollBehavior = ''; }, 50);
                }
                return;
            }

            if (retryCount < maxRetries) {
                retryCount++;
                requestAnimationFrame(attemptRestore);
            }
        };

        // Use rAF for first frame, then retry if needed
        requestAnimationFrame(attemptRestore);
    }, [tickets]); // Fires when tickets are populated (instantly from cache)

    // Sync filters to URL params
    useEffect(() => {
        const currentParams = new URLSearchParams(Array.from(searchParams.entries()));
        let changed = false;

        const setOrDelete = (key: string, val: string, defaultVal: string) => {
            if (val && val !== defaultVal) {
                if (currentParams.get(key) !== val) {
                    currentParams.set(key, val);
                    changed = true;
                }
            } else {
                if (currentParams.has(key)) {
                    currentParams.delete(key);
                    changed = true;
                }
            }
        };

        setOrDelete('status', statusFilter, initialStatusFilter);
        setOrDelete('category', categoryFilter, 'all');
        setOrDelete('search', searchQuery, '');
        setOrDelete('sortBy', sortBy, 'newest');
        setOrDelete('dateFrom', dateFrom, '');
        setOrDelete('dateTo', dateTo, '');
        setOrDelete('raisedBy', raisedByFilter, 'all');
        setOrDelete('resolvedBy', resolvedByFilter, 'all');
        setOrDelete('assignedTo', assignedToFilter, 'all');

        if (changed) {
            const newUrl = `${pathname}?${currentParams.toString()}`;
            // Use router.replace to ensure Next.js router state (including useSearchParams) is kept in sync
            // shallow: true is implicit in Next.js 13+ App Router for the same page
            router.replace(newUrl, { scroll: false });
        }
    }, [statusFilter, categoryFilter, searchQuery, sortBy, dateFrom, dateTo, raisedByFilter, resolvedByFilter, assignedToFilter, searchParams, initialStatusFilter, pathname, router]);

    useEffect(() => {
        // If initialStatusFilter prop changes (e.g. user toggles tabs outside), reset it
        if (!searchParams.has('status')) {
            setStatusFilter(initialStatusFilter);
        }
    }, [initialStatusFilter, searchParams]);

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

    const PAGE_SIZE = 100;

    // Pre-seed the ref when we have cache to prevent redundant initial fetch on back-navigation
    const currentParamsSnapshot = JSON.stringify({
        statusFilter, propertyId, organizationId,
        raisedByFilter, assignedToFilter, categoryFilter,
        searchQuery, dateFrom, dateTo
    });
    const lastFetchedRef = useRef<string>(hasCacheHit ? currentParamsSnapshot : '');

    // Re-fetch only when filters actually change (SWR: skip initial if cache exists)
    useEffect(() => {
        const currentParams = JSON.stringify({
            statusFilter, propertyId, organizationId,
            raisedByFilter, assignedToFilter, categoryFilter,
            searchQuery, dateFrom, dateTo
        });

        if (lastFetchedRef.current === currentParams) {
            // Cache hit on mount — do a SILENT background revalidation after scroll restoration
            if (hasCacheHit && !scrollRestoredRef.current) {
                // Wait for scroll restore, then silently revalidate
                const bgTimer = setTimeout(() => {
                    fetchTickets(0);
                    fetchFilterOptions();
                }, 800); // Delay background fetch so scroll restores first
                return () => clearTimeout(bgTimer);
            }
            return;
        }

        const timer = setTimeout(() => {
            lastFetchedRef.current = currentParams;
            fetchTickets(0);
            fetchFilterOptions();
        }, searchQuery ? 300 : 0); // Only debounce for text search

        return () => clearTimeout(timer);
    }, [statusFilter, propertyId, organizationId, raisedByFilter, assignedToFilter, categoryFilter, searchQuery, dateFrom, dateTo]);

    const buildUrl = (offset: number, limitOverride?: number) => {
        const params = new URLSearchParams();

        if (statusFilter === 'tenant_raised') params.set('raisedByRole', 'tenant');
        else if (statusFilter === 'internal') params.set('isInternal', 'true');
        else if (statusFilter === 'sla_breached') params.set('slaBreached', 'true');
        else if (statusFilter === 'pending_validation') params.set('status', 'pending_validation');
        else if (statusFilter !== 'all') params.set('status', statusFilter);

        if (propertyId) params.set('propertyId', propertyId);
        else if (organizationId) params.set('organizationId', organizationId);

        if (raisedByFilter !== 'all') params.set('raisedBy', raisedByFilter);
        if (assignedToFilter !== 'all') params.set('assignedTo', assignedToFilter);
        if (categoryFilter !== 'all') params.set('skillGroup', categoryFilter);
        if (dateFrom) params.set('dateFrom', dateFrom);
        if (dateTo) params.set('dateTo', dateTo);
        if (searchQuery.trim()) params.set('search', searchQuery.trim());

        params.set('limit', String(limitOverride || PAGE_SIZE));
        params.set('offset', String(offset));

        return `/api/tickets?${params.toString()}`;
    };

    const fetchTickets = async (offset: number) => {
        const isInitial = offset === 0;
        const hasCachedTickets = tickets.length > 0;

        // Check if we need to restore a larger set of tickets (pagination restoration)
        let limitOverride: number | undefined;
        if (isInitial) {
            const savedCount = sessionStorage.getItem('ticketsLoadedCount');
            if (savedCount) {
                limitOverride = Math.max(PAGE_SIZE, parseInt(savedCount, 10));
            }
        }

        if (isInitial) {
            // Only show full-page loading skeleton if we don't have cached data yet
            if (!hasCachedTickets) {
                setIsLoading(true);
                setTotalCount(null);
            }
        } else {
            setIsLoadingMore(true);
        }
        try {
            const res = await fetch(buildUrl(offset, limitOverride));
            if (!res.ok) return;
            const data = await res.json();
            const fetched: Ticket[] = data.tickets || [];
            const total: number = data.total ?? fetched.length;

            if (isInitial) {
                setTickets(fetched);
                setCachedData(cacheKey, fetched);
            } else {
                setTickets(prev => [...prev, ...fetched]);
            }
            setTotalCount(total);
            setHasMore(fetched.length === PAGE_SIZE && offset + fetched.length < total);
        } catch (error) {
            console.error('Error fetching tickets:', error);
            if (isInitial) setTickets([]);
        } finally {
            if (isInitial) setIsLoading(false);
            else setIsLoadingMore(false);
        }
    };

    // Fetch distinct creator/assignee users for filter dropdowns
    const fetchFilterOptions = async () => {
        const params = new URLSearchParams();
        if (propertyId) params.set('propertyId', propertyId);
        else if (organizationId) params.set('organizationId', organizationId);
        try {
            const res = await fetch(`/api/tickets/filter-options?${params.toString()}`);
            if (!res.ok) return;
            const data = await res.json();
            setAllCreators((data.creators || []).map((u: any) => ({ id: u.id, name: u.full_name })));
            setAllAssignees((data.assignees || []).map((u: any) => ({ id: u.id, name: u.full_name })));
        } catch (error) {
            console.error('Error fetching filter options:', error);
        }
    };

    const loadMoreTickets = () => fetchTickets(tickets.length);

    const handleUpdateStatus = async (ticketId: string, newStatus: string) => {
        try {
            const response = await fetch(`/api/tickets/${ticketId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (response.ok) {
                fetchTickets(0);
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
                fetchTickets(0);
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
                invalidateCache('tickets-');
                fetchTickets(0);
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

    const handleTicketClick = (ticketId: string) => {
        // Save exact scroll position and ticket ID immediately before navigating out
        const scrollContainer = document.getElementById('main-scroll-container');
        const scrollPos = scrollContainer ? scrollContainer.scrollTop : window.scrollY;
        
        sessionStorage.setItem('scrollY', scrollPos.toString());
        sessionStorage.setItem('lastTicketId', ticketId);
        sessionStorage.setItem('ticketsLoadedCount', tickets.length.toString());
        
        router.push(`/tickets/${ticketId}?from=requests`);
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

    const priorityOrder: Record<string, number> = { critical: 0, urgent: 1, high: 2, medium: 3, low: 4 };

    const raisedByUsers = allCreators;

    const hasActiveFilters = dateFrom !== '' || dateTo !== '' || raisedByFilter !== 'all' || resolvedByFilter !== 'all' || assignedToFilter !== 'all' || sortBy !== 'newest';

    const filteredTickets = useMemo(() => {
        // dateFrom, dateTo, raisedByFilter, assignedToFilter, categoryFilter, searchQuery
        // are all applied server-side — only sort client-side within the fetched page.
        let result = [...tickets];

        result = result.sort((a, b) => {
            if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            if (sortBy === 'priority_high') return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
            if (sortBy === 'priority_low') return (priorityOrder[b.priority] ?? 3) - (priorityOrder[a.priority] ?? 3);
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        return result;
    }, [tickets, sortBy]);

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
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="h-9 w-full sm:w-auto px-3 bg-surface border border-border rounded-[var(--radius-md)] text-xs font-semibold font-body text-text-primary transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50"
                        >
                            <option value="all">All</option>
                            <option value="resolved,closed">Completed</option>
                            <option value="open,assigned,in_progress,blocked">Open</option>
                            <option value="waitlist">Waitlist</option>
                            <option value="sla_breached">SLA Breached</option>
                            <option value="pending_validation">Pending Validation</option>
                            <option value="tenant_raised">Client Raised</option>
                            <option value="internal">Internal</option>
                        </select>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            className="h-9 w-full sm:w-auto px-3 bg-surface border border-border rounded-[var(--radius-md)] text-xs font-semibold font-body text-text-primary transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50"
                        >
                            <option value="all">All Categories</option>
                            <option value="technical">Technical</option>
                            <option value="soft_services">Soft Service</option>
                            <option value="plumbing">Plumbing</option>
                        </select>
                    </div>
                    {!isLoading && (
                        <span className="px-2.5 py-1 bg-primary/10 text-primary text-xs font-bold rounded-full whitespace-nowrap flex items-center gap-1.5">
                            {hasActiveFilters || categoryFilter !== 'all' || searchQuery.trim() ? filteredTickets.length : (totalCount ?? filteredTickets.length)} Result{(hasActiveFilters || categoryFilter !== 'all' || searchQuery.trim() ? filteredTickets.length : (totalCount ?? filteredTickets.length)) !== 1 ? 's' : ''}
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
                </div>
            </div>

            {/* Sort / Date / User Filter Bar */}
            <div className="flex flex-wrap items-center gap-2">
                {/* Sort */}
                <FilterDropdown
                    value={sortBy}
                    onChange={(v) => setSortBy(v as any)}
                    options={[
                        { value: 'newest', label: 'Newest First' },
                        { value: 'oldest', label: 'Oldest First' },
                        { value: 'priority_high', label: 'Priority: High → Low' },
                        { value: 'priority_low', label: 'Priority: Low → High' },
                    ]}
                    placeholder="Sort"
                />

                {/* Date From */}
                <div className={`flex items-center gap-2 h-9 px-3 bg-white border rounded-full shadow-sm hover:border-slate-300 transition-all ${dateFrom ? 'border-primary/40' : 'border-slate-200'}`}>
                    <Calendar className={`w-3.5 h-3.5 shrink-0 ${dateFrom ? 'text-primary' : 'text-slate-400'}`} />
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer w-[112px]"
                    />
                </div>

                {/* Date To */}
                <div className={`flex items-center gap-2 h-9 px-3 bg-white border rounded-full shadow-sm hover:border-slate-300 transition-all ${dateTo ? 'border-primary/40' : 'border-slate-200'}`}>
                    <Calendar className={`w-3.5 h-3.5 shrink-0 ${dateTo ? 'text-primary' : 'text-slate-400'}`} />
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-transparent text-xs font-semibold text-slate-600 focus:outline-none cursor-pointer w-[112px]"
                    />
                </div>

                {/* Raised By User Filter */}
                {!propertyId ? (
                    <div className="flex items-center gap-2 h-9 px-3 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-400 font-medium select-none" title="Select a property to filter by user">
                        <User className="w-3.5 h-3.5 shrink-0" />
                        <span>Raised By: Select property</span>
                    </div>
                ) : raisedByUsers.length > 0 && (
                    <FilterDropdown
                        value={raisedByFilter}
                        onChange={setRaisedByFilter}
                        options={[
                            { value: 'all', label: 'Raised By: All' },
                            ...raisedByUsers.map(u => ({ value: u.id, label: u.name }))
                        ]}
                        icon={<User className="w-3.5 h-3.5" />}
                    />
                )}

                {/* Assigned To Filter */}
                {!propertyId ? (
                    <div className="flex items-center gap-2 h-9 px-3 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-400 font-medium select-none" title="Select a property to filter by user">
                        <User className="w-3.5 h-3.5 shrink-0" />
                        <span>Assigned To: Select property</span>
                    </div>
                ) : allAssignees.length > 0 && (
                    <FilterDropdown
                        value={assignedToFilter}
                        onChange={setAssignedToFilter}
                        options={[
                            { value: 'all', label: 'Assigned To: All' },
                            ...allAssignees.map(u => ({ value: u.id, label: u.name }))
                        ]}
                        icon={<User className="w-3.5 h-3.5" />}
                    />
                )}

                {/* Clear Filters */}
                {hasActiveFilters && (
                    <button
                        onClick={() => { setDateFrom(''); setDateTo(''); setRaisedByFilter('all'); setResolvedByFilter('all'); setAssignedToFilter('all'); setSortBy('newest'); }}
                        className="h-9 px-4 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-full transition-all border border-rose-200 bg-white shadow-sm"
                    >
                        Clear Filters
                    </button>
                )}
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
                        {filteredTickets.map((ticket: any) => (
                            <div key={ticket.id} id={`ticket-${ticket.id}`}>
                                <TicketCard
                                    id={ticket.id}
                                    title={ticket.title}
                                    priority={ticket.priority?.toUpperCase() as any || 'MEDIUM'}
                                    status={
                                        ['closed', 'resolved'].includes(ticket.status) ? 'COMPLETED' :
                                            ticket.status === 'in_progress' ? 'IN_PROGRESS' :
                                                ticket.status === 'pending_validation' ? 'PENDING_VALIDATION' :
                                                    ticket.status === 'waitlist' ? 'WAITLISTED' :
                                                        ticket.assigned_to ? 'ASSIGNED' : 'OPEN'
                                    }
                                    ticketNumber={ticket.ticket_number}
                                    createdAt={ticket.created_at}
                                    assignedTo={ticket.assignee?.full_name}
                                    assigneePhotoUrl={ticket.assignee?.user_photo_url}
                                    photoUrl={ticket.photo_before_url}
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
                                    raisedByTenant={(ticket.creator?.property_memberships || []).some((m: any) => m.property_id === (ticket.property_id || ticket.property?.id) && ['tenant', 'super_tenant'].includes((m.role || '').toLowerCase()))}
                                    onClick={() => handleTicketClick(ticket.id)}
                                    onEdit={canEditTicket(ticket) ? (e) => handleEditClick(e, ticket) : undefined}
                                    onDelete={canDelete ? (e) => handleDelete(e, ticket.id) : undefined}
                                    hasMaterialRequest={Boolean((ticket.material_requests?.length ?? 0) > 0)}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* Load More - inline spacer so content isn't hidden behind floating bar */}
                {hasMore && !isLoading && <div className="h-20" />}
            </div>

            {/* Floating sticky Load More bar */}
            <AnimatePresence>
                {hasMore && !isLoading && (
                    <motion.div
                        initial={{ y: 80, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: 80, opacity: 0 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 200 }}
                        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
                    >
                        <button
                            onClick={loadMoreTickets}
                            disabled={isLoadingMore}
                            className="flex items-center gap-2.5 px-6 py-3 bg-slate-900 text-white text-sm font-bold rounded-2xl shadow-2xl hover:bg-slate-700 disabled:opacity-60 transition-all active:scale-95 border border-slate-700 backdrop-blur-sm"
                        >
                            {isLoadingMore ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Loading...</>
                            ) : (
                                <>
                                    <span>Load More Tickets</span>
                                    <span className="px-2 py-0.5 bg-white/20 rounded-lg text-xs font-black">↓</span>
                                </>
                            )}
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>

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

