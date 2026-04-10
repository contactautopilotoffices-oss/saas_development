/**
 * SuperTenantDashboard
 * Super tenant dashboard providing multi-property portfolio view.
 * Features: ticket management across properties, visitor management, room booking,
 * property overview, settings, and profile.
 * @remarks Client component using Supabase, AuthContext, GlobalContext.
 */

'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
    LayoutDashboard, Ticket as TicketIcon, Settings, LogOut, Plus,
    CheckCircle2, UsersRound, UserCircle,
    Calendar, Building2, ChevronRight, Menu, X,
    ChevronDown, Briefcase, Clock, Activity, AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import { useAuth } from '@/frontend/context/AuthContext';
import SignOutModal from '@/frontend/components/ui/SignOutModal';
import Loader from '@/frontend/components/ui/Loader';
import TenantTicketingDashboard from '@/frontend/components/tickets/TenantTicketingDashboard';
import TenantRoomBooking from '@/frontend/components/meeting-rooms/TenantRoomBooking';
import SettingsView from './SettingsView';
import TicketCard from '@/frontend/components/shared/TicketCard';
import NotificationBell from './NotificationBell';
import { useRouter, useSearchParams } from 'next/navigation';
import { Filter } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'requests' | 'create_request' | 'visitors' | 'room_booking' | 'settings' | 'profile';

interface AssignedProperty {
    property_id: string;
    organization_id: string;
    properties: { id: string; name: string; code: string; status: string; address?: string };
}

interface Ticket {
    id: string;
    ticket_number: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    created_at: string;
    floor_number?: number | null;
    location?: string | null;
    raised_by?: string;
    assigned_to?: string | null;
    photo_before_url?: string;
    property?: { name: string };
    assignee?: { full_name: string };
    creator?: { full_name: string };
    ticket_escalation_logs?: { from_level: number; to_level: number | null; escalated_at: string; from_employee?: { full_name: string; user_photo_url?: string | null } | null; to_employee?: { full_name: string; user_photo_url?: string | null } | null }[];
    material_requests?: { id: string }[];
}

// ── Status helpers ─────────────────────────────────────────────────────────────

const CLOSED_VALIDATED = ['closed', 'resolved'];   // tenant approved or fully closed
const CLOSED_NOT_VALID = ['pending_validation'];    // awaiting tenant sign-off only
const WIP_STATUSES = ['open', 'waitlist', 'assigned', 'in_progress', 'paused'];

const pct = (n: number, total: number) =>
    total > 0 ? ((n / total) * 100).toFixed(2) + '%' : '0%';

const STATUS_BADGE: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    waitlist: 'bg-yellow-100 text-yellow-700',
    assigned: 'bg-purple-100 text-purple-700',
    in_progress: 'bg-orange-100 text-orange-700',
    paused: 'bg-slate-100 text-slate-500',
    pending_validation: 'bg-pink-100 text-pink-700',
    resolved: 'bg-emerald-100 text-emerald-700',
    closed: 'bg-green-100 text-green-700',
};
const formatStatus = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// ── Coming Soon ────────────────────────────────────────────────────────────────

const ComingSoon = ({ title, description }: { title: string; description: string }) => (
    <div className="flex-1 flex flex-col items-center justify-center py-20 px-8 text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <UsersRound className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-2">{title}</h2>
        <p className="text-sm text-text-secondary max-w-sm">{description}</p>
        <span className="mt-4 px-3 py-1 bg-warning/10 text-warning text-xs font-bold rounded-full border border-warning/20">Coming Soon</span>
    </div>
);

// ── Snag Stat Card ─────────────────────────────────────────────────────────────

const SnagCard = ({
    label, value, icon, trend, trendPositive, progressPct, progressColor, isPriority, onClick,
}: {
    label: string;
    value: number;
    icon: React.ReactNode;
    trend?: string;
    trendPositive?: boolean;
    progressPct?: number;
    progressColor?: string;
    isPriority?: boolean;
    onClick?: () => void;
}) => (
    <div
        onClick={onClick}
        className={`relative rounded-2xl bg-white p-4 sm:p-5 flex flex-col gap-2.5 sm:gap-3 transition-transform duration-200 hover:-translate-y-0.5 ${onClick ? 'cursor-pointer hover:shadow-md' : ''}`}
        style={isPriority
            ? { border: '2px solid var(--warning)', boxShadow: '0 4px 20px rgba(245,158,11,0.12)' }
            : { border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }
        }
    >
        {/* Top row: label + icon */}
        <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] font-semibold tracking-widest uppercase leading-tight max-w-[65%]"
                style={{ color: 'var(--text-tertiary)' }}>
                {label}
            </span>
            <div className="flex-shrink-0">{icon}</div>
        </div>

        {/* Big number */}
        <p className="text-3xl sm:text-4xl metric-number leading-none"
            style={{ color: isPriority ? 'var(--warning)' : 'var(--text-primary)' }}>
            {value.toLocaleString()}
        </p>

        {/* Trend / action badge */}
        {trend && (
            <span className="text-[11px] font-bold tracking-wide"
                style={{ color: isPriority ? 'var(--warning)' : trendPositive ? 'var(--success)' : 'var(--text-secondary)' }}>
                {trend}
            </span>
        )}

        {/* Progress bar */}
        {progressPct !== undefined && (
            <div className="space-y-1 mt-auto">
                <div className="w-full h-1.5 rounded-full" style={{ background: 'var(--border)' }}>
                    <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(Math.max(progressPct, 0), 100)}%`, background: progressColor || 'var(--primary)' }}
                    />
                </div>
                <p className="text-[10px] font-semibold" style={{ color: progressColor || 'var(--text-tertiary)' }}>
                    {progressPct.toFixed(0)}%
                </p>
            </div>
        )}
    </div>
);

// ── Main Dashboard ─────────────────────────────────────────────────────────────

const SuperTenantDashboard = () => {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, signOut } = useAuth();
    const supabase = useMemo(() => createClient(), []);

    const [activeTab, setActiveTabState] = useState<Tab>((searchParams.get('tab') as Tab) || 'overview');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const [showPropDropdown, setShowPropDropdown] = useState(false);

    // Sync tab + filter to URL so back button restores state
    const setActiveTab = useCallback((tab: Tab) => {
        setActiveTabState(tab);
        const params = new URLSearchParams(window.location.search);
        params.set('tab', tab);
        window.history.replaceState(null, '', `?${params.toString()}`);
    }, []);

    // Properties
    const [assignedProperties, setAssignedProperties] = useState<AssignedProperty[]>([]);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string>('all');
    const [isLoadingProps, setIsLoadingProps] = useState(true);
    const [timePeriod, setTimePeriod] = useState<'all' | 'thismonth' | 'today'>('thismonth'); // Default to match Org Admin

    // Tickets
    const [allPropertyTickets, setAllPropertyTickets] = useState<any[]>([]); // for overview across all props
    const [activeTickets, setActiveTickets] = useState<Ticket[]>([]);
    const [completedTickets, setCompletedTickets] = useState<Ticket[]>([]);
    const [isFetchingTickets, setIsFetchingTickets] = useState(false);
    const [ticketFilter, setTicketFilter] = useState<'all' | 'mine'>('all');
    const [statusFilter, setStatusFilterState] = useState(searchParams.get('filter') || 'all');

    const setStatusFilter = useCallback((f: string) => {
        setStatusFilterState(f);
        const params = new URLSearchParams(window.location.search);
        params.set('filter', f);
        window.history.replaceState(null, '', `?${params.toString()}`);
    }, []);

    // Edit
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // ── Load properties ─────────────────────────────────────────────────────────

    useEffect(() => {
        if (!user) return;
        const load = async () => {
            setIsLoadingProps(true);
            const { data } = await supabase
                .from('super_tenant_properties')
                .select('property_id, organization_id, properties(id, name, code, status, address)')
                .eq('user_id', user.id)
                .order('created_at', { ascending: true });
            if (data) {
                const props = data as unknown as AssignedProperty[];
                setAssignedProperties(props);
                // Default to 'all' instead of first property to match portfolio view
                setSelectedPropertyId('all');
            }
            setIsLoadingProps(false);
        };
        load();
    }, [user, supabase]);

    // ── Load tickets for selected property ──────────────────────────────────────

    const TICKET_PAGE_SIZE = 10000;

    const fetchTickets = useCallback(async () => {
        if (!user || !selectedPropertyId) return;
        setIsFetchingTickets(true);
        let allRows: any[] = [];
        let from = 0;
        let to = TICKET_PAGE_SIZE - 1;
        let totalExpected = -1;
        while (true) {
            const { data, count } = await supabase
                .from('tickets')
                .select('*, assignee:users!assigned_to(full_name, user_photo_url), creator:users!raised_by(full_name, property_memberships(role, property_id)), property:properties(name), ticket_escalation_logs(from_level, to_level, escalated_at, from_employee:users!from_employee_id(full_name, user_photo_url), to_employee:users!to_employee_id(full_name, user_photo_url)), material_requests(id)')
                .eq('property_id', selectedPropertyId)
                .order('created_at', { ascending: false })
                .limit(to + 1)
                .range(from, to);
            if (totalExpected === -1 && count !== null) totalExpected = count;
            if (data && data.length > 0) allRows = allRows.concat(data);
            if (totalExpected !== -1 && allRows.length >= totalExpected) break;
            if (!data || data.length < TICKET_PAGE_SIZE) break;
            from = to + 1;
            to = from + TICKET_PAGE_SIZE - 1;
        }
        setActiveTickets(allRows.filter((t: any) => !['resolved', 'closed'].includes(t.status)));
        setCompletedTickets(allRows.filter((t: any) => ['resolved', 'closed'].includes(t.status)));
        setIsFetchingTickets(false);
    }, [user, selectedPropertyId, supabase]);

    // Load all-properties tickets for the overview analytics and portfolio requests view
    const fetchAllTickets = useCallback(async () => {
        if (!user || assignedProperties.length === 0) return;
        const ids = assignedProperties.map(p => p.property_id);
        let allRows: any[] = [];
        let from = 0;
        let to = TICKET_PAGE_SIZE - 1;
        let totalExpected = -1;
        while (true) {
            const { data, count } = await supabase
                .from('tickets')
                .select('*, assignee:users!assigned_to(full_name, user_photo_url), creator:users!raised_by(full_name, property_memberships(role, property_id)), property:properties(name), ticket_escalation_logs(from_level, to_level, escalated_at, from_employee:users!from_employee_id(full_name, user_photo_url), to_employee:users!to_employee_id(full_name, user_photo_url))')
                .in('property_id', ids)
                .order('created_at', { ascending: false })
                .limit(to + 1)
                .range(from, to);
            if (totalExpected === -1 && count !== null) totalExpected = count;
            if (data && data.length > 0) allRows = allRows.concat(data);
            if (totalExpected !== -1 && allRows.length >= totalExpected) break;
            if (!data || data.length < TICKET_PAGE_SIZE) break;
            from = to + 1;
            to = from + TICKET_PAGE_SIZE - 1;
        }
        setAllPropertyTickets(allRows);
    }, [user, assignedProperties, supabase]);

    useEffect(() => {
        if (!selectedPropertyId || selectedPropertyId === 'all') return;
        fetchTickets();
        const channel = supabase
            .channel(`st-tix-${selectedPropertyId}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'tickets', filter: `property_id=eq.${selectedPropertyId}` },
                fetchTickets)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [selectedPropertyId, user?.id, fetchTickets]);

    useEffect(() => { fetchAllTickets(); }, [assignedProperties.length, fetchAllTickets]);

    // Real-time subscription for Portfolio View (all assigned properties)
    useEffect(() => {
        if (!user || assignedProperties.length === 0) return;
        const channel = supabase.channel('st-all-properties-tix');
        assignedProperties.forEach(({ property_id }) => {
            channel.on('postgres_changes',
                { event: '*', schema: 'public', table: 'tickets', filter: `property_id=eq.${property_id}` },
                fetchAllTickets
            );
        });
        channel.subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [assignedProperties.length, user?.id, fetchAllTickets]);

    // ── Ticket actions ──────────────────────────────────────────────────────────

    const handleUpdateTicket = async () => {
        if (!editingTicket || !editTitle.trim()) return;
        setIsUpdating(true);
        const res = await fetch(`/api/tickets/${editingTicket.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: editTitle, description: editDescription }),
        });
        if (res.ok) { setEditingTicket(null); fetchTickets(); }
        setIsUpdating(false);
    };

    const handleDelete = async (ticketId: string) => {
        if (!confirm('Delete this request?')) return;
        await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' });
        fetchTickets();
        fetchAllTickets();
    };

    const handleValidate = async (ticketId: string, approved: boolean) => {
        await fetch(`/api/tickets/${ticketId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'validate', validation_approved: approved }),
        });
        fetchTickets();
        fetchAllTickets();
    };

    // ── Derived analytics ────────────────────────────────────────────────────────

    // Use allPropertyTickets for overview stats, filtered by selected property and time period
    const analyticsTickets = useMemo(() => {
        if (activeTab !== 'overview') return [];
        let filtered = allPropertyTickets;

        if (selectedPropertyId !== 'all') {
            filtered = filtered.filter(t => t.property_id === selectedPropertyId);
        }

        if (timePeriod === 'thismonth') {
            const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
            filtered = filtered.filter(t => new Date(t.created_at) >= monthStart);
        } else if (timePeriod === 'today') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            filtered = filtered.filter(t => new Date(t.created_at) >= today);
        }

        return filtered;
    }, [activeTab, selectedPropertyId, allPropertyTickets, timePeriod]);

    const total = analyticsTickets.length;
    const closedValid = analyticsTickets.filter(t => CLOSED_VALIDATED.includes(t.status)).length;
    const closedPend = analyticsTickets.filter(t => CLOSED_NOT_VALID.includes(t.status)).length;
    const wip = analyticsTickets.filter(t => WIP_STATUSES.includes(t.status)).length;

    // Extra derived stats for enhanced KPI cards
    const completionRate = total > 0 ? Math.round((closedValid / total) * 100) : 0;
    const openOnly = analyticsTickets.filter(t => t.status === 'open' || t.status === 'blocked').length;
    const waitlistOnly = analyticsTickets.filter(t => t.status === 'waitlist').length;
    const inProgressOnly = analyticsTickets.filter(t => ['assigned', 'in_progress', 'paused'].includes(t.status)).length;
    const urgentOpen = analyticsTickets.filter(t => (t.priority === 'urgent' || t.priority === 'high' || t.priority === 'critical') && !CLOSED_VALIDATED.includes(t.status) && t.status !== 'pending_validation').length;
    const avgResolutionHours = (() => {
        const resolved = analyticsTickets.filter((t: any) => t.resolved_at);
        if (resolved.length === 0) return 0;
        const totalMs = resolved.reduce((sum: number, t: any) => sum + (new Date(t.resolved_at).getTime() - new Date(t.created_at).getTime()), 0);
        return Math.round(totalMs / resolved.length / (1000 * 60 * 60));
    })();

    // Floor breakdown for bar chart
    const floorMap = new Map<string, { validated: number; pending: number }>();
    analyticsTickets.forEach((t: any) => {
        let floorKey = 'Unknown';
        if (t.floor_number != null) {
            floorKey = t.floor_number === 0 ? 'Ground Floor'
                : t.floor_number === 1 ? '1st Floor'
                    : t.floor_number === 2 ? '2nd Floor'
                        : t.floor_number === 3 ? '3rd Floor'
                            : `${t.floor_number}th Floor`;
        } else if (t.location) {
            floorKey = t.location;
        }
        const existing = floorMap.get(floorKey) || { validated: 0, pending: 0 };
        if (CLOSED_VALIDATED.includes(t.status)) existing.validated++;
        else if (CLOSED_NOT_VALID.includes(t.status)) existing.pending++;
        floorMap.set(floorKey, existing);
    });

    const floorChartData = Array.from(floorMap.entries())
        .map(([name, v]) => ({ name, validated: v.validated, pending: v.pending, total: v.validated + v.pending }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

    // Filtered requests list — use allPropertyTickets in portfolio view
    const allTickets = selectedPropertyId === 'all'
        ? allPropertyTickets
        : [...activeTickets, ...completedTickets];
    const filteredTickets = allTickets
        .filter(t => ticketFilter === 'mine' ? t.raised_by === user?.id : true)
        .filter(t => {
            if (statusFilter === 'all') return true;
            if (statusFilter === 'in_progress') return !['waitlist', 'resolved', 'closed', 'pending_validation'].includes(t.status);
            if (statusFilter === 'waitlist') return t.status === 'waitlist';
            if (statusFilter === 'pending_validation') return t.status === 'pending_validation';
            if (statusFilter === 'completed') return ['resolved', 'closed'].includes(t.status);
            return true;
        });

    const selectedProperty = assignedProperties.find(p => p.property_id === selectedPropertyId);
    const selectedPropertyName = selectedPropertyId === 'all' ? 'Portfolio View' : (selectedProperty?.properties?.name || 'Select Property');
    const periodName = timePeriod === 'all' ? 'All Time' : timePeriod === 'today' ? 'Today' : 'This Month';

    const tabInfo: Record<Tab, { title: string; subtitle: string }> = {
        overview: { title: 'Dashboard', subtitle: `${selectedPropertyName} • ${periodName}` },
        requests: { title: 'My Requests', subtitle: `${selectedPropertyName} • All Time` },
        create_request: { title: 'New Request', subtitle: selectedPropertyName },
        visitors: { title: 'Visitors', subtitle: 'Manage guests' },
        room_booking: { title: 'Meeting Rooms', subtitle: selectedPropertyName },
        settings: { title: 'Settings', subtitle: 'App preferences' },
        profile: { title: 'Profile', subtitle: 'Your account' },
    };

    if (isLoadingProps) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <Loader size="lg" />
        </div>
    );

    // ── Sidebar nav ─────────────────────────────────────────────────────────────

    const navGroups = [
        {
            label: 'Core',
            items: [
                { id: 'overview' as Tab, label: 'Dashboard', icon: LayoutDashboard },
                { id: 'requests' as Tab, label: 'My Requests', icon: TicketIcon },
            ],
        },
        {
            label: 'Services',
            items: [
                { id: 'visitors' as Tab, label: 'Visitor Management', icon: UsersRound },
                { id: 'room_booking' as Tab, label: 'Meeting Rooms', icon: Calendar },
            ],
        },
        {
            label: 'Account',
            items: [
                { id: 'settings' as Tab, label: 'Settings', icon: Settings },
                { id: 'profile' as Tab, label: 'Profile', icon: UserCircle },
            ],
        },
    ];

    const SidebarContent = () => (
        <>
            {/* Quick Action */}
            <div className="px-4 pt-4 pb-3">
                <button
                    onClick={() => { setActiveTab('create_request'); setSidebarOpen(false); }}
                    disabled={!selectedPropertyId}
                    className="w-full flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                    <Plus className="w-4 h-4" />
                    New Request
                </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-4 py-3 space-y-5 overflow-y-auto min-h-0 custom-scrollbar">
                {navGroups.map(group => (
                    <div key={group.label}>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary mb-1.5 px-2">{group.label}</p>
                        <div className="space-y-0.5">
                            {group.items.map(item => {
                                const active = activeTab === item.id;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${active ? 'bg-primary text-white font-semibold'
                                            : 'text-text-secondary hover:text-text-primary hover:bg-muted'
                                            }`}
                                    >
                                        <item.icon className="w-4 h-4 flex-shrink-0" />
                                        {item.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className="px-4 pb-12 pt-4 border-t border-border flex-shrink-0 bg-surface">
                <button
                    onClick={() => setShowSignOutModal(true)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-error hover:bg-error/10 transition-colors"
                >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                </button>
            </div>
        </>
    );

    // ── Overview Tab ─────────────────────────────────────────────────────────────

    const OverviewTab = () => (
        <div className="space-y-4">
            {/* Time Period Toggle — mobile only (desktop shown in header) */}
            <div className="md:hidden flex items-center justify-center bg-slate-600/80 backdrop-blur-sm rounded-full p-1 shadow-inner">
                {(['today', 'thismonth', 'all'] as const).map((p) => (
                    <button
                        key={p}
                        onClick={() => setTimePeriod(p)}
                        className={`flex-1 py-1 text-[9px] font-black uppercase tracking-widest rounded-full transition-all ${timePeriod === p
                            ? 'bg-yellow-400 text-slate-900 shadow-md'
                            : 'text-white/80 hover:text-white'}`}
                    >
                        {p === 'today' ? 'Today' : p === 'thismonth' ? 'This Month' : 'All Time'}
                    </button>
                ))}
            </div>

            {/* 4 KPI Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

                {/* Card 1 — Total Tickets */}
                <div
                    onClick={() => { setStatusFilter('all'); setActiveTab('requests'); }}
                    className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md cursor-pointer hover:border-slate-300 transition-all group"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">Total Tickets</span>
                        <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center">
                            <Briefcase className="w-3.5 h-3.5 text-slate-500" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl font-black text-slate-900">{total}</span>
                        <span className="text-xs text-slate-400 font-bold">{completionRate}% resolved</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(completionRate, 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                        <span>{wip + closedPend} active</span>
                        <span>{avgResolutionHours > 0 ? `Avg ${avgResolutionHours}h` : 'No data'}</span>
                    </div>
                </div>

                {/* Card 2 — Open & Active */}
                <div
                    onClick={() => { setStatusFilter('in_progress'); setActiveTab('requests'); }}
                    className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md cursor-pointer hover:border-blue-200 transition-all group"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-blue-500 transition-colors">Open & Active</span>
                        <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center">
                            <AlertCircle className="w-3.5 h-3.5 text-blue-500" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl font-black text-slate-900">{wip}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                            {openOnly} Open
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                            {waitlistOnly} Waitlist
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                            {inProgressOnly} In Progress
                        </span>
                        {urgentOpen > 0 && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                                {urgentOpen} High/Urgent
                            </span>
                        )}
                    </div>
                </div>

                {/* Card 3 — Resolved & Closed */}
                <div
                    onClick={() => { setStatusFilter('completed'); setActiveTab('requests'); }}
                    className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md cursor-pointer hover:border-emerald-200 transition-all group"
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-emerald-500 transition-colors">Resolved & Closed</span>
                        <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                        <span className="text-4xl font-black text-slate-900">{closedValid}</span>
                        <span className="text-xs text-emerald-500 font-bold">{completionRate}%</span>
                    </div>
                    {closedValid > 0 && (
                        <div className="w-full h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: '100%' }} />
                        </div>
                    )}
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                        <span className="text-emerald-600">{closedValid} validated</span>
                        <span>{avgResolutionHours > 0 ? `Avg ${avgResolutionHours}h` : ''}</span>
                    </div>
                </div>

                {/* Card 4 — Pending Validation */}
                <div
                    onClick={() => { setStatusFilter('pending_validation'); setActiveTab('requests'); }}
                    className={`bg-white rounded-2xl p-3 border shadow-sm hover:shadow-md cursor-pointer transition-all group ${closedPend > 0 ? 'border-amber-200 hover:border-amber-300' : 'border-slate-100 hover:border-slate-200'
                        }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-amber-500 transition-colors">Pending Validation</span>
                        <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${closedPend > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                            <Clock className={`w-3.5 h-3.5 ${closedPend > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2 mb-2">
                        <span className={`text-4xl font-black ${closedPend > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{closedPend}</span>
                        {closedPend === 0 && <span className="text-[10px] text-emerald-500 font-black">All clear ✓</span>}
                        {closedPend > 0 && <span className="text-[10px] text-amber-500 font-black bg-amber-50 px-1.5 py-0.5 rounded-md">Needs action</span>}
                    </div>
                    <div className="text-[10px] font-bold text-slate-400">
                        {closedPend > 0 ? (
                            <span className="text-amber-600">Awaiting your sign-off</span>
                        ) : (
                            <span className="text-emerald-600">All resolved tickets confirmed</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Charts row */}
            {total > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

                    {/* Snags by Floor — CSS list bars */}
                    <div className="bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                Tickets by Floor
                            </h3>
                        </div>

                        {floorChartData.length > 0 ? (
                            <div className="space-y-5">
                                {floorChartData.map((floor) => {
                                    const maxTotal = floorChartData[0].total;
                                    const barPct = maxTotal > 0 ? (floor.total / maxTotal) * 100 : 0;
                                    return (
                                        <div key={floor.name}>
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>
                                                    {floor.name}
                                                </span>
                                                <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                                    {floor.total}
                                                </span>
                                            </div>
                                            <div className="w-full h-2 rounded-full overflow-hidden"
                                                style={{ background: 'var(--border)' }}>
                                                <div
                                                    className="h-full rounded-full transition-all duration-700 ease-out"
                                                    style={{ width: `${barPct}%`, background: 'var(--primary)' }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-sm text-center py-8" style={{ color: 'var(--text-secondary)' }}>
                                No floor data available.
                            </p>
                        )}
                    </div>

                    {/* Status Breakdown — CSS horizontal bars */}
                    <div className="bg-white border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                                Status Breakdown
                            </h3>
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg"
                                style={{ background: 'var(--surface-elevated)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                                {total} total
                            </span>
                        </div>

                        {/* Bars */}
                        <div className="space-y-5 flex-1">
                            {[
                                {
                                    label: 'Validated & Closed',
                                    sublabel: 'Closed by Autopilot & confirmed by tenant',
                                    value: closedValid,
                                    color: 'var(--success)',
                                    bgColor: 'rgba(16,185,129,0.1)',
                                },
                                {
                                    label: 'Pending Validation',
                                    sublabel: 'Closed by Autopilot, awaiting tenant sign-off',
                                    value: closedPend,
                                    color: 'var(--warning)',
                                    bgColor: 'rgba(245,158,11,0.1)',
                                },
                                {
                                    label: 'In Progress',
                                    sublabel: 'Open, assigned or being worked on',
                                    value: wip,
                                    color: 'var(--primary)',
                                    bgColor: 'rgba(112,143,150,0.1)',
                                },
                            ].map((item) => {
                                const maxVal = Math.max(closedValid, closedPend, wip, 1);
                                const barPct = (item.value / maxVal) * 100;
                                const sharePct = total > 0 ? ((item.value / total) * 100).toFixed(0) : '0';
                                return (
                                    <div key={item.label}>
                                        <div className="flex items-start justify-between mb-1.5 gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-0.5"
                                                    style={{ background: item.color }} />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold leading-tight"
                                                        style={{ color: 'var(--text-primary)' }}>
                                                        {item.label}
                                                    </p>
                                                    <p className="text-[10px] leading-tight mt-0.5 truncate"
                                                        style={{ color: 'var(--text-tertiary)' }}>
                                                        {item.sublabel}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex-shrink-0 text-right">
                                                <p className="text-sm font-black leading-tight"
                                                    style={{ color: 'var(--text-primary)' }}>
                                                    {item.value}
                                                </p>
                                                <p className="text-[10px] font-semibold leading-tight"
                                                    style={{ color: item.color }}>
                                                    {sharePct}%
                                                </p>
                                            </div>
                                        </div>
                                        <div className="w-full h-2 rounded-full overflow-hidden"
                                            style={{ background: 'var(--border)' }}>
                                            <div
                                                className="h-full rounded-full transition-all duration-700 ease-out"
                                                style={{ width: `${barPct}%`, background: item.color }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer total bar */}
                        <div className="mt-6 pt-4 flex items-center justify-between"
                            style={{ borderTop: '1px solid var(--border)' }}>
                            <div className="flex items-center gap-4 text-[11px] font-semibold"
                                style={{ color: 'var(--text-tertiary)' }}>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--success)' }} />
                                    {closedValid} validated
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--warning)' }} />
                                    {closedPend} pending
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: 'var(--primary)' }} />
                                    {wip} active
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Recent active requests (for selected property) */}
            {activeTickets.length > 0 && (
                <div className="bg-white border border-border rounded-2xl overflow-hidden shadow-sm">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                        <h3 className="text-sm font-bold text-text-primary">Recent Active Requests</h3>
                        <button onClick={() => setActiveTab('requests')} className="text-xs font-semibold text-primary flex items-center gap-1 hover:underline">
                            View all <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <div className="divide-y divide-border">
                        {activeTickets.slice(0, 5).map(t => (
                            <div key={t.id} className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors">
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-text-primary truncate">{t.title}</p>
                                    <p className="text-xs text-text-secondary">{t.ticket_number} · {formatDate(t.created_at)}</p>
                                </div>
                                <span className={`ml-3 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_BADGE[t.status] || 'bg-muted text-text-secondary'}`}>
                                    {formatStatus(t.status)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {total === 0 && (
                <div className="bg-white border border-border rounded-2xl p-12 text-center">
                    <Briefcase className="w-10 h-10 mx-auto mb-3 text-text-secondary opacity-30" />
                    <p className="text-sm text-text-secondary">No snag data available for your assigned properties yet.</p>
                </div>
            )}
        </div>
    );

    // ── Requests Tab ─────────────────────────────────────────────────────────────

    const RequestsTab = () => (
        <div className="space-y-6">
            <div className="bg-surface border border-border rounded-2xl p-5 flex flex-wrap items-center gap-3 shadow-sm">
                {/* Raised by filter */}
                <div className="flex gap-1 p-1 bg-muted rounded-xl border border-border">
                    {(['all', 'mine'] as const).map(mode => (
                        <button key={mode} onClick={() => setTicketFilter(mode)}
                            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${ticketFilter === mode ? 'bg-surface text-text-primary shadow-sm border border-border' : 'text-text-secondary hover:text-text-primary hover:bg-surface/50'}`}>
                            {mode === 'all' ? 'All' : 'Mine'}
                        </button>
                    ))}
                </div>

                {/* Status filter */}
                <div className="flex items-center gap-2 bg-surface border border-border px-3 py-2 rounded-xl">
                    <Filter className="w-3.5 h-3.5 text-text-tertiary" />
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                        className="text-xs font-bold bg-transparent text-text-primary focus:outline-none cursor-pointer">
                        <option value="all">All Status</option>
                        <option value="open">Open</option>
                        <option value="in_progress">In Progress</option>
                        <option value="waitlist">Waitlist</option>
                        <option value="pending_validation">Needs Validation</option>
                        <option value="completed">Completed</option>
                    </select>
                </div>

                <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] font-black text-text-tertiary uppercase tracking-widest bg-muted px-2.5 py-1 rounded-full border border-border/50">
                        {filteredTickets.length} Result{filteredTickets.length !== 1 ? 's' : ''}
                    </span>
                </div>
            </div>

            {isFetchingTickets ? (
                <div className="flex items-center justify-center py-24"><Loader size="md" /></div>
            ) : filteredTickets.length === 0 ? (
                <div className="bg-surface border border-border rounded-[2.5rem] py-24 text-center border-dashed">
                    <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
                        <TicketIcon className="w-10 h-10 text-text-tertiary opacity-30" />
                    </div>
                    <p className="text-base font-bold text-text-secondary">No requests found</p>
                    <p className="text-sm text-text-tertiary mt-1">Try adjusting your filters or raising a new request.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredTickets.map(t => (
                        <TicketCard
                            key={t.id}
                            id={t.id}
                            title={t.title}
                            priority={t.priority?.toUpperCase() as any || 'MEDIUM'}
                            status={
                                ['closed', 'resolved'].includes(t.status) ? 'COMPLETED' :
                                    t.status === 'in_progress' ? 'IN_PROGRESS' :
                                        t.status === 'pending_validation' ? 'PENDING_VALIDATION' :
                                            t.assigned_to ? 'ASSIGNED' : 'OPEN'
                            }
                            ticketNumber={t.ticket_number}
                            createdAt={t.created_at}
                            assignedTo={t.assignee?.full_name}
                            assigneePhotoUrl={(t.assignee as any)?.user_photo_url}
                            photoUrl={t.photo_before_url}
                            propertyName={t.property?.name}
                            escalationChain={(() => { const logs = (t as any).ticket_escalation_logs; if (!logs || logs.length === 0) return undefined; const sorted = [...logs].sort((a: any, b: any) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime()); const chain: { name: string; avatar?: string | null }[] = []; sorted.forEach((log: any, i: number) => { if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url }); if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url }); }); return chain.length > 0 ? chain : undefined; })()}
                            raisedByTenant={((t.creator as any)?.property_memberships || []).some((m: any) => m.property_id === t.property_id && ['tenant', 'super_tenant'].includes((m.role || '').toLowerCase()))}
                            onClick={() => router.push(`/tickets/${t.id}?from=requests`)}
                            onEdit={t.raised_by === user?.id ? (e) => {
                                e.stopPropagation();
                                setEditingTicket(t);
                                setEditTitle(t.title);
                                setEditDescription(t.description);
                            } : undefined}
                            onDelete={t.raised_by === user?.id ? (e) => {
                                e.stopPropagation();
                                handleDelete(t.id);
                            } : undefined}
                            onValidate={t.status === 'pending_validation' ? (e) => {
                                e.stopPropagation();
                                handleValidate(t.id, true);
                            } : undefined}
                            onReject={t.status === 'pending_validation' ? (e) => {
                                e.stopPropagation();
                                handleValidate(t.id, false);
                            } : undefined}
                            hasMaterialRequest={Boolean((t.material_requests?.length ?? 0) > 0)}
                        />
                    ))}
                </div>
            )}
        </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────────

    return (
        <div className="h-screen w-full bg-background text-foreground flex overflow-hidden">

            {/* Mobile overlay */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/20 z-[60]" onClick={() => setSidebarOpen(false)} />
                )}
            </AnimatePresence>

            {/* Mobile Sidebar */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed left-0 inset-y-0 w-72 bg-surface border-r border-border flex flex-col z-[70] shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
                                    <Building2 className="w-4 h-4 text-white" />
                                </div>
                                <span className="text-sm font-bold text-text-primary">Super Client</span>
                            </div>
                            <button onClick={() => setSidebarOpen(false)} className="p-1.5 rounded-lg hover:bg-muted text-text-secondary">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex-1 flex flex-col min-h-0"><SidebarContent /></div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Desktop Sidebar */}
            <aside className="hidden md:flex flex-col w-60 lg:w-64 xl:w-72 border-r border-border bg-surface sticky top-0 h-screen overflow-hidden min-h-0">
                <div className="px-5 py-5 border-b border-border">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-primary rounded-xl flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-text-secondary leading-none">Super Client</p>
                            <p className="text-sm font-bold text-text-primary">Portfolio Portal</p>
                        </div>
                    </div>
                </div>
                <div className="flex-1 flex flex-col min-h-0"><SidebarContent /></div>
            </aside>

            {/* Main Area */}
            <div id="main-scroll-container" className="flex-1 flex flex-col min-w-0 overflow-y-auto">

                {/* Header */}
                <header className="sticky top-0 z-40 bg-surface border-b border-border">
                    <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-2">

                        {/* Left: mobile menu + title */}
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button onClick={() => setSidebarOpen(true)} className="md:hidden shrink-0 p-2 rounded-lg border border-border text-text-secondary hover:bg-muted transition-colors">
                                <Menu className="w-4 h-4" />
                            </button>
                            <div className="min-w-0">
                                <h1 className="text-sm font-bold text-text-primary leading-tight truncate">{tabInfo[activeTab].title}</h1>
                                <p className="text-xs text-text-secondary leading-tight truncate hidden sm:block">{tabInfo[activeTab].subtitle}</p>
                            </div>
                        </div>

                        {/* Right: Property dropdown + desktop time filter + avatar */}
                        <div className="flex items-center gap-4 shrink-0">
                            <NotificationBell />

                            {/* Time Period Filter — desktop only; mobile shown inside overview content */}
                            {activeTab === 'overview' && (
                                <div className="hidden md:flex items-center bg-slate-600/80 backdrop-blur-sm rounded-full p-1 shadow-inner">
                                    <button
                                        onClick={() => setTimePeriod('today')}
                                        className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full transition-all ${timePeriod === 'today'
                                            ? 'bg-yellow-400 text-slate-900 shadow-md'
                                            : 'text-white/80 hover:text-white'}`}
                                    >
                                        Today
                                    </button>
                                    <button
                                        onClick={() => setTimePeriod('thismonth')}
                                        className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full transition-all ${timePeriod === 'thismonth'
                                            ? 'bg-yellow-400 text-slate-900 shadow-md'
                                            : 'text-white/80 hover:text-white'}`}
                                    >
                                        This Month
                                    </button>
                                    <button
                                        onClick={() => setTimePeriod('all')}
                                        className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest rounded-full transition-all ${timePeriod === 'all'
                                            ? 'bg-yellow-400 text-slate-900 shadow-md'
                                            : 'text-white/80 hover:text-white'}`}
                                    >
                                        All Time
                                    </button>
                                </div>
                            )}

                            {/* Property dropdown — always visible in header */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowPropDropdown(v => !v)}
                                    className="flex items-center gap-2 px-3 py-2 bg-surface border border-border rounded-xl text-sm font-semibold text-text-primary hover:bg-muted transition-colors shadow-sm"
                                >
                                    <Building2 className="w-4 h-4 text-primary" />
                                    <span className="max-w-[140px] truncate hidden sm:block">{selectedPropertyName}</span>
                                    <ChevronDown className={`w-3.5 h-3.5 text-text-secondary transition-transform ${showPropDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showPropDropdown && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowPropDropdown(false)} />
                                        <div className="absolute right-0 top-full mt-1.5 z-20 bg-surface border border-border rounded-xl shadow-lg py-1.5 min-w-[200px] max-h-60 overflow-y-auto">
                                            <button
                                                onClick={() => { setSelectedPropertyId('all'); setShowPropDropdown(false); }}
                                                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${selectedPropertyId === 'all' ? 'bg-primary/10 text-primary font-semibold' : 'text-text-primary hover:bg-muted'}`}>
                                                <div className="font-medium">All Properties</div>
                                                <div className="text-[10px] text-text-secondary">Portfolio View</div>
                                            </button>
                                            <div className="my-1 border-t border-border" />
                                            {assignedProperties.map(p => (
                                                <button key={p.property_id}
                                                    onClick={() => { setSelectedPropertyId(p.property_id); setShowPropDropdown(false); }}
                                                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${selectedPropertyId === p.property_id ? 'bg-primary/10 text-primary font-semibold' : 'text-text-primary hover:bg-muted'}`}>
                                                    <div className="font-medium truncate">{p.properties?.name}</div>
                                                    {p.properties?.code && <div className="text-[10px] text-text-secondary">{p.properties.code}</div>}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Avatar */}
                            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {user?.email?.charAt(0).toUpperCase() || 'S'}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content */}
                <main className="flex-1 p-3 sm:p-4 pb-20 md:pb-6 overflow-y-auto bg-background">
                    <AnimatePresence mode="wait">
                        <motion.div key={`${activeTab}-${selectedPropertyId}`}
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}>

                            {activeTab === 'overview' && <OverviewTab />}
                            {activeTab === 'requests' && <RequestsTab />}

                            {activeTab === 'create_request' && selectedPropertyId && selectedPropertyId !== 'all' && selectedProperty && (
                                <TenantTicketingDashboard
                                    propertyId={selectedPropertyId}
                                    organizationId={selectedProperty.organization_id}
                                    user={{ id: user!.id, full_name: user!.user_metadata?.full_name || user!.email || '' }}
                                    propertyName={selectedProperty.properties?.name}
                                />
                            )}
                            {activeTab === 'create_request' && (!selectedPropertyId || selectedPropertyId === 'all' || !selectedProperty) && (
                                <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
                                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-5">
                                        <Building2 className="w-8 h-8 text-primary" />
                                    </div>
                                    <h2 className="text-xl font-bold text-text-primary mb-2">Select a Property</h2>
                                    <p className="text-sm text-text-secondary max-w-sm mb-6">
                                        Choose a property below to create a new service request.
                                    </p>
                                    <div className="w-full max-w-sm space-y-2">
                                        {assignedProperties.map(p => (
                                            <button
                                                key={p.property_id}
                                                onClick={() => {
                                                    setSelectedPropertyId(p.property_id);
                                                }}
                                                className="w-full flex items-center gap-3 px-4 py-3 bg-white border border-border rounded-xl text-left hover:border-primary/50 hover:shadow-md transition-all group"
                                            >
                                                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                                                    <Building2 className="w-5 h-5 text-primary" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-text-primary truncate">{p.properties?.name}</p>
                                                    {p.properties?.code && <p className="text-[10px] text-text-secondary">{p.properties.code}</p>}
                                                </div>
                                                <ChevronRight className="w-4 h-4 text-text-tertiary group-hover:text-primary transition-colors" />
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'visitors' && (
                                <ComingSoon title="Visitor Management" description="We're building a seamless way for you to manage guests, pre-authorize entries, and track visitor history." />
                            )}

                            {activeTab === 'room_booking' && selectedPropertyId && (
                                <TenantRoomBooking propertyId={selectedPropertyId} user={user!} hideHeader={true} />
                            )}
                            {activeTab === 'room_booking' && !selectedPropertyId && (
                                <div className="text-center py-16 text-text-secondary">Select a property to book a meeting room.</div>
                            )}

                            {activeTab === 'settings' && <SettingsView />}

                            {activeTab === 'profile' && (
                                <div className="max-w-md">
                                    <div className="bg-surface border border-border rounded-2xl p-6 space-y-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-white text-2xl font-bold">
                                                {user?.email?.charAt(0).toUpperCase() || 'S'}
                                            </div>
                                            <div>
                                                <p className="text-base font-bold text-text-primary">{user?.user_metadata?.full_name || 'Super Client'}</p>
                                                <p className="text-sm text-text-secondary">{user?.email}</p>
                                                <span className="mt-1 inline-flex px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-bold rounded-full border border-primary/20">Super Client</span>
                                            </div>
                                        </div>
                                        <div className="border-t border-border pt-4">
                                            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-2">Assigned Properties</p>
                                            <div className="space-y-2">
                                                {assignedProperties.map(p => (
                                                    <div key={p.property_id} className="flex items-center gap-2.5 px-3 py-2 bg-muted rounded-xl border border-border">
                                                        <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-semibold text-text-primary truncate">{p.properties?.name}</p>
                                                            {p.properties?.code && <p className="text-[10px] text-text-secondary">{p.properties.code}</p>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </main>

                {/* Mobile Bottom Navigation */}
                <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-border safe-area-inset-bottom">
                    <div className="flex items-stretch h-16 px-1">
                        {[
                            { id: 'overview' as Tab, icon: LayoutDashboard, label: 'Home' },
                            { id: 'requests' as Tab, icon: TicketIcon, label: 'Requests' },
                            { id: 'create_request' as Tab, icon: Plus, label: 'New', accent: true },
                            { id: 'room_booking' as Tab, icon: Calendar, label: 'Rooms' },
                            { id: 'settings' as Tab, icon: Settings, label: 'Settings' },
                        ].map(item => {
                            const active = activeTab === item.id;
                            const Icon = item.icon;
                            if (item.accent) {
                                return (
                                    <button key={item.id}
                                        onClick={() => setActiveTab(item.id)}
                                        disabled={item.id === 'create_request' && !selectedPropertyId}
                                        className="flex-1 flex flex-col items-center justify-center gap-0.5 disabled:opacity-40"
                                    >
                                        <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center shadow-md -mt-4">
                                            <Icon className="w-5 h-5 text-white" />
                                        </div>
                                        <span className="text-[9px] font-bold text-text-tertiary mt-0.5">{item.label}</span>
                                    </button>
                                );
                            }
                            return (
                                <button key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors"
                                >
                                    <Icon className={`w-5 h-5 transition-colors ${active ? 'text-primary' : 'text-text-tertiary'}`} />
                                    <span className={`text-[9px] font-bold transition-colors ${active ? 'text-primary' : 'text-text-tertiary'}`}>
                                        {item.label}
                                    </span>
                                    {active && <div className="absolute bottom-0 w-6 h-0.5 bg-primary rounded-full" />}
                                </button>
                            );
                        })}
                    </div>
                </nav>
            </div>

            {/* Edit Modal */}
            <AnimatePresence>
                {editingTicket && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
                        onClick={() => setEditingTicket(null)}>
                        <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-surface border border-border rounded-2xl p-6 w-full max-w-md shadow-2xl">
                            <h3 className="text-base font-bold text-text-primary mb-4">Edit Request</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-semibold text-text-secondary block mb-1">Title</label>
                                    <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                                        className="w-full px-3 py-2 border border-border rounded-xl bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-text-secondary block mb-1">Description</label>
                                    <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3}
                                        className="w-full px-3 py-2 border border-border rounded-xl bg-surface text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none" />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-4">
                                <button onClick={() => setEditingTicket(null)}
                                    className="flex-1 px-4 py-2 border border-border rounded-xl text-sm font-semibold text-text-secondary hover:bg-muted transition-colors">Cancel</button>
                                <button onClick={handleUpdateTicket} disabled={isUpdating || !editTitle.trim()}
                                    className="flex-1 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                                    {isUpdating ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <SignOutModal isOpen={showSignOutModal} onClose={() => setShowSignOutModal(false)} onConfirm={signOut} />
        </div>
    );
};

export default SuperTenantDashboard;
