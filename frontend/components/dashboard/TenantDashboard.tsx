'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import {
    LayoutDashboard, Ticket as TicketIcon, Settings, LogOut, Plus,
    CheckCircle2, Clock, MessageSquare, UsersRound, Coffee, UserCircle,
    Calendar, Building2, Shield, ChevronRight, Sun, Moon, Menu, X, Camera, Pencil, Loader2, Filter, ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import { useAuth } from '@/frontend/context/AuthContext';
import { useTheme } from '@/frontend/context/ThemeContext';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import NextImage from 'next/image';
import { useDataCache } from '@/frontend/context/DataCacheContext';
import Skeleton from '@/frontend/components/ui/Skeleton';
import SignOutModal from '@/frontend/components/ui/SignOutModal';
import NotificationBell from './NotificationBell';
import DieselStaffDashboard from '@/frontend/components/diesel/DieselStaffDashboard';
import VMSAdminDashboard from '@/frontend/components/vms/VMSAdminDashboard';
import TenantTicketingDashboard from '@/frontend/components/tickets/TenantTicketingDashboard';
import SettingsView from './SettingsView';
import Loader from '@/frontend/components/ui/Loader';
import TicketCard from '@/frontend/components/shared/TicketCard';
import TenantRoomBooking from '@/frontend/components/meeting-rooms/TenantRoomBooking';

// Types
type Tab = 'overview' | 'requests' | 'create_request' | 'visitors' | 'room_booking' | 'settings' | 'profile';

interface Property {
    id: string;
    name: string;
    code: string;
    address: string;
    organization_id: string;
}

interface Ticket {
    id: string;
    ticket_number: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    created_at: string;
    photo_before_url?: string;
    raised_by?: string;
    raised_by_name?: string;
    assignee?: { full_name: string; user_photo_url?: string | null };
    ticket_escalation_logs?: { from_level: number; to_level: number | null; escalated_at: string; from_employee?: { full_name: string; user_photo_url?: string | null } | null; to_employee?: { full_name: string; user_photo_url?: string | null } | null }[];
}

function buildEscalationChain(logs?: Ticket['ticket_escalation_logs']): { name: string; avatar?: string | null }[] | undefined {
    if (!logs || logs.length === 0) return undefined;
    const sorted = [...logs].sort((a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime());
    const chain: { name: string; avatar?: string | null }[] = [];
    sorted.forEach((log, i) => {
        if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url });
        if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url });
    });
    return chain.length > 0 ? chain : undefined;
}

const TenantDashboard = () => {
    const { user, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const params = useParams();
    const router = useRouter();
    const propertyId = params?.propertyId as string;

    // State
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [property, setProperty] = useState<Property | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { getCachedData, setCachedData } = useDataCache();
    const cacheKeyPrefix = `tenant-${propertyId}`;
    const [activeTickets, setActiveTickets] = useState<Ticket[]>([]);
    const [completedTickets, setCompletedTickets] = useState<Ticket[]>([]);
    const [isFetchingTickets, setIsFetchingTickets] = useState(false);

    // Edit Modal State
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    // Tab Mapping for Header
    const tabInfo: Record<Tab, { title: string; subtitle: string }> = {
        overview: { title: 'Dashboard', subtitle: 'Welcome back' },
        requests: { title: 'My Requests', subtitle: 'Track your issues' },
        create_request: { title: 'New Request', subtitle: 'Quick report' },
        visitors: { title: 'Visitors', subtitle: 'Manage guests' },
        room_booking: { title: 'Meeting Rooms', subtitle: 'Book your workspace' },
        settings: { title: 'Settings', subtitle: 'App preferences' },
        profile: { title: 'Profile', subtitle: 'Your account' },
    };

    const searchParams = useSearchParams();

    // Sync activeTab with URL
    useEffect(() => {
        const tab = searchParams.get('tab') as Tab;
        if (tab && tab !== activeTab) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
        const params = new URLSearchParams(searchParams.toString());
        params.set('tab', tab);
        router.push(`?${params.toString()}`);
    };

    const supabase = useMemo(() => createClient(), []);

    // Refs to prevent duplicate fetches
    const hasFetchedProperty = useRef(false);
    const hasFetchedTickets = useRef(false);

    useEffect(() => {
        if (propertyId && !hasFetchedProperty.current) {
            hasFetchedProperty.current = true;
            fetchPropertyDetails();
        }
    }, [propertyId]);

    const fetchPropertyDetails = async () => {
        const cached = getCachedData(`${cacheKeyPrefix}-property`);
        if (cached) {
            setProperty(cached);
            setIsLoading(false);
            // Don't return, still fetch background to update cache
        } else {
            setIsLoading(true);
        }

        setErrorMsg('');

        try {
            const { data, error } = await supabase
                .from('properties')
                .select('*')
                .eq('id', propertyId)
                .maybeSingle();

            if (error || !data) {
                setErrorMsg('Property not found.');
            } else {
                setProperty(data);
                setCachedData(`${cacheKeyPrefix}-property`, data);
            }
        } catch (err) {
            setErrorMsg('Network error.');
        } finally {
            setIsLoading(false);
        }
    };

    const fetchTickets = async () => {
        if (!user || !propertyId) return;
        setIsFetchingTickets(true);

        const { data, error } = await supabase
            .from('tickets')
            .select('*, assignee:users!assigned_to(full_name, user_photo_url), ticket_escalation_logs(from_level, to_level, escalated_at, from_employee:users!from_employee_id(full_name, user_photo_url), to_employee:users!to_employee_id(full_name, user_photo_url))')
            .eq('property_id', propertyId)
            .eq('internal', false)
            .order('created_at', { ascending: false });

        if (!error && data) {
            const active = data.filter((t: any) => !['resolved', 'closed'].includes(t.status));
            const completed = data.filter((t: any) => ['resolved', 'closed'].includes(t.status));
            setActiveTickets(active);
            setCompletedTickets(completed);
        }
        setIsFetchingTickets(false);
    };

    useEffect(() => {
        if (!propertyId || !user) return;

        fetchTickets();

        // Real-time: re-fetch whenever any ticket in this property is inserted/updated/deleted
        const channel = supabase
            .channel(`tickets-property-${propertyId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'tickets', filter: `property_id=eq.${propertyId}` },
                () => { fetchTickets(); }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [propertyId, user?.id]);

    // Removed navItems array as we'll use a hardcoded grouped sidebar

    const handleUpdateTicket = async () => {
        if (!editingTicket || !editTitle.trim()) return;
        setIsUpdating(true);
        try {
            const res = await fetch(`/api/tickets/${editingTicket.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: editTitle,
                    description: editDescription
                })
            });

            if (res.ok) {
                setEditingTicket(null);
                fetchTickets(); // Refresh list
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to update ticket');
            }
        } catch (error) {
            console.error('Update ticket error:', error);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent, ticketId: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this request?')) return;
        try {
            const res = await fetch(`/api/tickets/${ticketId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                fetchTickets();
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete ticket');
            }
        } catch (error) {
            console.error('Delete ticket error:', error);
        }
    };

    const handleEditClick = (e: React.MouseEvent, ticket: Ticket) => {
        e.stopPropagation();
        setEditingTicket(ticket);
        setEditTitle(ticket.title);
        setEditDescription(ticket.description);
    };

    const handleValidate = async (ticketId: string, approved: boolean, note?: string) => {
        try {
            const res = await fetch(`/api/tickets/${ticketId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'validate', validation_approved: approved, validation_note: note }),
            });
            if (res.ok) {
                fetchTickets();
            }
        } catch (error) {
            console.error('Validation error:', error);
        }
    };

    if (isLoading && !property) return (
        <div className="min-h-screen bg-background flex">
            {/* Sidebar Skeleton */}
            <aside className="w-64 border-r border-border p-6 space-y-6 hidden lg:block bg-white">
                <Skeleton className="w-full h-12" />
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="w-full h-10" />)}
                </div>
            </aside>
            <main className="flex-1">
                <header className="h-16 border-b border-border px-6 flex items-center justify-between bg-white">
                    <Skeleton className="w-32 h-6" />
                    <Skeleton className="w-10 h-10 rounded-full" />
                </header>
                <div className="p-8 space-y-6">
                    <Skeleton className="w-64 h-10" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                        <Skeleton className="h-32" />
                    </div>
                </div>
            </main>
        </div>
    );

    if (!property) return (
        <div className="p-10 text-center">
            <h2 className="text-xl font-bold text-error">Error Loading Dashboard</h2>
            <p className="text-text-secondary mt-2">{errorMsg || 'Property not found.'}</p>
            <button onClick={() => router.back()} className="mt-4 text-primary font-bold hover:underline">Go Back</button>
        </div>
    );

    return (
        <div className="min-h-screen w-full bg-background text-foreground flex overflow-x-hidden">


            {/* Overlay when sidebar is open */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/20 z-[60]"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar - Slides in from left */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.aside
                        initial={{ y: '-100%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: '-100%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed left-0 inset-y-0 w-72 bg-white border-r border-border flex flex-col z-[70] shadow-2xl overflow-hidden"
                    >
                        {/* Close Button */}
                        <button
                            onClick={() => setSidebarOpen(false)}
                            className="absolute top-4 right-4 p-2 text-text-tertiary hover:text-text-primary hover:bg-muted rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>

                        <div className="p-5 lg:p-6 pb-2 flex-shrink-0">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 bg-primary rounded-[var(--radius-md)] flex items-center justify-center text-text-inverse font-display font-semibold text-lg shadow-sm">
                                    {property?.name?.substring(0, 1) || 'T'}
                                </div>
                                <div>
                                    <h2 className="font-display font-semibold text-sm leading-tight text-text-primary truncate max-w-[140px]">{property?.name}</h2>
                                    <p className="text-[10px] text-text-tertiary font-body font-medium mt-0.5">Client Portal</p>
                                </div>
                            </div>

                            {/* Quick Action: New Request - Compact */}
                            <div className="mb-4">
                                <button
                                    onClick={() => { handleTabChange('create_request'); setSidebarOpen(false); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white text-text-primary rounded-xl hover:bg-muted transition-all border border-primary/20 group shadow-sm"
                                >
                                    <div className="w-7 h-7 bg-primary/20 rounded-lg flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                                        <Plus className="w-4 h-4 font-black" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest">New Request</span>
                                </button>
                            </div>
                        </div>

                        <nav className="flex-1 px-4 overflow-y-auto min-h-0 custom-scrollbar">
                            {/* Core Operations */}
                            <div className="mb-6">
                                <p className="text-[10px] font-medium text-text-tertiary tracking-widest px-4 mb-3 flex items-center gap-2 font-body">
                                    <span className="w-0.5 h-3 bg-secondary rounded-full"></span>
                                    Core Operations
                                </p>
                                <div className="space-y-1">
                                    <button
                                        onClick={() => { handleTabChange('overview'); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] transition-smooth font-bold text-sm ${activeTab === 'overview'
                                            ? 'bg-primary text-text-inverse shadow-sm'
                                            : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                            }`}
                                    >
                                        <LayoutDashboard className="w-4 h-4" />
                                        Dashboard
                                    </button>
                                    <button
                                        onClick={() => { handleTabChange('requests'); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] transition-smooth font-bold text-sm ${activeTab === 'requests'
                                            ? 'bg-primary text-text-inverse shadow-sm'
                                            : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                            }`}
                                    >
                                        <TicketIcon className="w-4 h-4" />
                                        My Requests
                                    </button>
                                </div>
                            </div>

                            {/* Management Hub */}
                            <div className="mb-6">
                                <p className="text-[10px] font-medium text-text-tertiary tracking-widest px-4 mb-3 flex items-center gap-2 font-body">
                                    <span className="w-0.5 h-3 bg-secondary rounded-full"></span>
                                    Management Hub
                                </p>
                                <div className="space-y-1">
                                    <button
                                        onClick={() => { handleTabChange('visitors'); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] transition-smooth font-bold text-sm ${activeTab === 'visitors'
                                            ? 'bg-primary text-text-inverse shadow-sm'
                                            : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                            }`}
                                    >
                                        <UsersRound className="w-4 h-4" />
                                        Visitor Management
                                    </button>
                                    <button
                                        onClick={() => { handleTabChange('room_booking'); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] transition-smooth font-bold text-sm ${activeTab === 'room_booking'
                                            ? 'bg-primary text-text-inverse shadow-sm'
                                            : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                            }`}
                                    >
                                        <Calendar className="w-4 h-4" />
                                        Meeting Rooms
                                    </button>
                                </div>
                            </div>

                            {/* System & Personal */}
                            <div className="mb-6">
                                <p className="text-[10px] font-medium text-text-tertiary tracking-widest px-4 mb-3 flex items-center gap-2 font-body">
                                    <span className="w-0.5 h-3 bg-secondary rounded-full"></span>
                                    System & Personal
                                </p>
                                <div className="space-y-1">
                                    <button
                                        onClick={() => { handleTabChange('settings'); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] transition-smooth font-bold text-sm ${activeTab === 'settings'
                                            ? 'bg-primary text-text-inverse shadow-sm'
                                            : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                            }`}
                                    >
                                        <Settings className="w-4 h-4" />
                                        Settings
                                    </button>
                                    <button
                                        onClick={() => { handleTabChange('profile'); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] transition-smooth font-bold text-sm ${activeTab === 'profile'
                                            ? 'bg-primary text-text-inverse shadow-sm'
                                            : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                            }`}
                                    >
                                        <UserCircle className="w-4 h-4" />
                                        Profile
                                    </button>
                                </div>
                            </div>
                        </nav>

                        <div className="pt-3 border-t border-border px-4 pb-12 flex-shrink-0 bg-white">
                            {/* User Profile Section */}
                            <div className="flex items-center gap-2 px-1 mb-3">
                                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-xs">
                                    {user?.email?.[0].toUpperCase() || 'T'}
                                </div>
                                <div className="flex flex-col overflow-hidden">
                                    <span className="font-bold text-xs text-foreground truncate">
                                        {user?.user_metadata?.full_name || 'Client'}
                                    </span>
                                    <span className="text-[9px] text-muted-foreground truncate font-medium">
                                        {user?.email}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowSignOutModal(true)}
                                className="flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 rounded-lg w-full transition-all duration-200 text-xs font-bold group"
                            >
                                <LogOut className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                Sign Out
                            </button>
                        </div>
                    </motion.aside>
                )}
            </AnimatePresence>

            {/* Main Content */}
            <motion.main
                animate={{ marginLeft: sidebarOpen ? (typeof window !== 'undefined' && window.innerWidth >= 1024 ? 288 : 0) : 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="flex-1 flex flex-col bg-background relative min-w-0 overflow-x-hidden"
            >
                {/* Static Header Section */}
                <header className="h-16 bg-background/80 border-b border-border flex items-center justify-between px-4 md:px-12 lg:px-20 sticky top-0 z-50 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        {!sidebarOpen && (
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="p-2 hover:bg-slate-50 text-slate-600 rounded-xl transition-all group"
                            >
                                <Menu className="w-5 h-5 group-hover:scale-110 transition-transform" />
                            </button>
                        )}
                    </div>

                    <div className="flex items-center gap-2 pr-2 flex-shrink-0">
                        <NotificationBell />
                    </div>
                </header>

                <div className="max-w-7xl mx-auto w-full min-w-0 px-4 md:px-12 lg:px-20 pt-8 pb-28 md:pb-12">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            {activeTab === 'overview' && <OverviewTab onNavigate={handleTabChange} property={property} onMenuToggle={() => setSidebarOpen(true)} />}
                            {activeTab === 'requests' && property && user && (
                                <RequestsTab
                                    activeTickets={activeTickets}
                                    completedTickets={completedTickets}
                                    onNavigate={handleTabChange}
                                    isLoading={isFetchingTickets}
                                    onEditClick={handleEditClick}
                                    onDeleteClick={handleDelete}
                                    onValidateClick={handleValidate}
                                />
                            )}
                            {activeTab === 'create_request' && property && user && (
                                <TenantTicketingDashboard
                                    propertyId={property.id}
                                    organizationId={property.organization_id}
                                    user={{ id: user.id, full_name: user.user_metadata?.full_name || 'Client' }}
                                    propertyName={property.name}
                                    onSuccess={fetchTickets}
                                />
                            )}
                            {activeTab === 'visitors' && (
                                <ComingSoonView
                                    title="Visitor Management"
                                    icon={UsersRound}
                                    description="We're building a seamless way for you to manage guests, pre-authorize entries, and track visitor history."
                                />
                            )}
                            {activeTab === 'room_booking' && property && (
                                <TenantRoomBooking
                                    propertyId={property.id}
                                    user={user}
                                />
                            )}

                            {activeTab === 'settings' && <SettingsView />}
                            {activeTab === 'profile' && (
                                <div className="flex justify-center items-start py-8">
                                    <div className="bg-white border border-slate-100 rounded-3xl shadow-lg w-full max-w-md overflow-hidden animate-in zoom-in duration-300">
                                        {/* Card Header with Autopilot Logo */}
                                        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 flex flex-col items-center">
                                            {/* Autopilot Logo */}
                                            <div className="flex items-center justify-center mb-6 font-display">
                                                <img
                                                    src="/autopilot-logo-new.png"
                                                    alt="Autopilot Logo"
                                                    className="h-10 w-auto object-contain invert mix-blend-screen"
                                                />
                                            </div>

                                            {/* User Avatar */}
                                            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center border-4 border-white/20 mb-4 overflow-hidden shadow-xl">
                                                {user?.user_metadata?.user_photo_url || user?.user_metadata?.avatar_url ? (
                                                    <NextImage
                                                        src={user.user_metadata.user_photo_url || user.user_metadata.avatar_url}
                                                        alt="Profile"
                                                        width={96}
                                                        height={96}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <span className="text-4xl font-black text-white">
                                                        {user?.user_metadata?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Role Badge */}
                                            <span className="px-4 py-1.5 bg-primary text-white rounded-full text-xs font-black uppercase tracking-wider shadow-lg">
                                                Registered Client
                                            </span>
                                        </div>

                                        {/* Card Body with User Info */}
                                        <div className="p-8 space-y-6">
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name</span>
                                                    <span className="text-sm font-bold text-slate-900">
                                                        {user?.user_metadata?.full_name || 'Not Set'}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone</span>
                                                    <span className="text-sm font-bold text-slate-900">
                                                        {user?.user_metadata?.phone || 'Not Set'}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</span>
                                                    <span className="text-sm font-medium text-slate-700">
                                                        {user?.email || 'Not Set'}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Property</span>
                                                    <span className="text-sm font-bold text-slate-900">
                                                        {property?.name || 'Not Set'}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="pt-4 flex justify-center">
                                                <button
                                                    onClick={() => handleTabChange('settings')}
                                                    className="px-8 py-2.5 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-all w-full"
                                                >
                                                    Edit Profile
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>

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
                                        onClick={() => handleTabChange(item.id)}
                                        className="flex-1 flex flex-col items-center justify-center gap-0.5"
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
                                    onClick={() => handleTabChange(item.id)}
                                    className="flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative"
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
            </motion.main>

            <SignOutModal
                isOpen={showSignOutModal}
                onClose={() => setShowSignOutModal(false)}
                onConfirm={signOut}
            />

            {/* Edit Request Modal */}
            <AnimatePresence>
                {editingTicket && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[9998] p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white/20"
                        >
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50/50">
                                <h3 className="font-display font-semibold text-lg text-slate-800">Edit Request</h3>
                                <button
                                    onClick={() => setEditingTicket(null)}
                                    className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="p-6 space-y-5">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Title</label>
                                    <input
                                        type="text"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium text-slate-900"
                                        placeholder="Brief title of the issue"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider ml-1">Description</label>
                                    <textarea
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all font-medium text-slate-900 min-h-[120px] resize-none"
                                        placeholder="Detailed description..."
                                    />
                                </div>
                            </div>

                            <div className="p-6 border-t border-gray-100 bg-slate-50/50 flex justify-end gap-3">
                                <button
                                    onClick={() => setEditingTicket(null)}
                                    className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUpdateTicket}
                                    disabled={isUpdating}
                                    className="px-6 py-2.5 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                                >
                                    {isUpdating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Saving...
                                        </>
                                    ) : (
                                        'Save Changes'
                                    )}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
};

// Coming Soon Placeholder View
const ComingSoonView = ({ title, icon: Icon, description }: { title: string, icon: any, description: string }) => (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center animate-in fade-in slide-in-from-bottom-8 duration-700">
        <div className="w-24 h-24 bg-primary/5 rounded-[2.5rem] flex items-center justify-center mb-8 border border-primary/10 shadow-inner">
            <Icon className="w-10 h-10 text-primary animate-pulse" />
        </div>
        <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 mb-4 tracking-tighter">
            {title} <span className="text-primary opacity-30"> coming soon</span>
        </h2>
        <p className="text-slate-500 text-lg md:text-xl max-w-lg mx-auto leading-relaxed font-medium">
            {description}
        </p>
        <div className="mt-12 flex items-center gap-3 px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100 shadow-sm">
            <div className="w-2 h-2 bg-primary rounded-full animate-ping" />
            <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Development in progress</span>
        </div>
    </div>
);

// Overview Tab for Tenant - Dark Card-Based Interface
const OverviewTab = ({ onNavigate, property, onMenuToggle }: { onNavigate: (tab: Tab) => void, property: Property | null, onMenuToggle?: () => void }) => {
    const { user } = useAuth();
    const params = useParams();
    const [ticketCount, setTicketCount] = useState({ active: 0, completed: 0 });
    const [visitorCount, setVisitorCount] = useState(0);
    const propertyId = params?.propertyId as string;
    const supabase = createClient();

    useEffect(() => {
        const fetchCounts = async () => {
            if (!user?.id || !propertyId) return;

            // Fetch Ticket Counts — all non-internal tickets for this property
            const { data: tickets } = await supabase
                .from('tickets')
                .select('status')
                .eq('property_id', propertyId)
                .eq('internal', false);

            if (tickets) {
                const active = tickets.filter(t => !['resolved', 'closed'].includes(t.status)).length;
                const completed = tickets.filter(t => ['resolved', 'closed'].includes(t.status)).length;
                setTicketCount({ active, completed });
            }

            // Fetch Active Visitor Count
            if (user?.user_metadata?.full_name) {
                const { data: visitors } = await supabase
                    .from('visitor_logs')
                    .select('id')
                    .eq('property_id', propertyId)
                    .eq('status', 'checked_in')
                    .eq('whom_to_meet', user.user_metadata.full_name);

                if (visitors) {
                    setVisitorCount(visitors.length);
                }
            }
        };
        fetchCounts();
    }, [user?.id, user?.user_metadata?.full_name, propertyId]);

    const userInitial = user?.user_metadata?.full_name?.[0] || user?.email?.[0] || 'U';

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                <div className="flex items-center gap-4">
                    <div className="space-y-1">
                        <h1 className="text-3xl md:text-4xl font-display font-semibold text-slate-800 tracking-tight">
                            Welcome to AUTOPILOT, <span className="text-secondary opacity-80">{user?.user_metadata?.full_name?.split(' ')[0] || 'Member'}</span>
                        </h1>
                        <p className="text-slate-500 font-medium text-sm">
                            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </p>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {/* Helpdesk & Ticketing Card */}
                <button
                    onClick={() => onNavigate('requests')}
                    className="relative group bg-white border border-slate-100 rounded-[3rem] p-12 text-left transition-all hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-1 min-h-[400px] flex flex-col"
                >
                    {/* Badge */}
                    <div className="absolute top-6 right-6 w-9 h-9 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 shadow-sm">
                        <span className="text-slate-400 font-bold text-xs">{ticketCount.active}</span>
                    </div>

                    <div className="relative z-10 flex-1 flex flex-col">
                        <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-10 border border-slate-100 group-hover:bg-secondary group-hover:text-white transition-all">
                            <MessageSquare className="w-10 h-10 text-slate-300 group-hover:text-white" />
                        </div>
                        <h3 className="text-3xl font-display font-semibold text-slate-800 mb-4">Helpdesk & Ticketing</h3>
                        <p className="text-slate-500 text-base mb-8 leading-relaxed">Report issues, track requests & get support instantly.</p>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-secondary">
                            • {ticketCount.active} Active • {ticketCount.completed} Completed
                        </div>
                    </div>
                </button>

                {/* Visitor Management Card */}
                <button
                    onClick={() => onNavigate('visitors')}
                    className="relative group bg-white border border-slate-100 rounded-[3rem] p-12 text-left transition-all hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-1 min-h-[400px] flex flex-col overflow-hidden"
                >
                    <div className="relative z-10 flex-1 flex flex-col">
                        <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-10 border border-slate-100 group-hover:bg-primary group-hover:text-white transition-all">
                            <UsersRound className="w-10 h-10 text-slate-300 group-hover:text-white" />
                        </div>
                        <h3 className="text-3xl font-display font-semibold text-slate-800 mb-4">Visitor Management</h3>
                        <p className="text-slate-500 text-base mb-8 leading-relaxed">Secure building access & visitor check-in system.</p>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                            Access Control Module
                        </div>
                    </div>
                </button>

                {/* Room Bookings Card */}
                <button
                    onClick={() => onNavigate('room_booking')}
                    className="relative group bg-white border border-slate-100 rounded-[3rem] p-12 text-left transition-all hover:shadow-2xl hover:shadow-slate-200/50 hover:-translate-y-1 min-h-[400px] flex flex-col"
                >
                    <div className="relative z-10 flex-1 flex flex-col">
                        <div className="w-20 h-20 bg-slate-50 rounded-[2rem] flex items-center justify-center mb-10 border border-slate-100 group-hover:bg-slate-900 group-hover:text-white transition-all">
                            <Calendar className="w-10 h-10 text-slate-300 group-hover:text-white" />
                        </div>
                        <h3 className="text-3xl font-display font-semibold text-slate-800 mb-4">Meeting Rooms</h3>
                        <p className="text-slate-500 text-base mb-8 leading-relaxed">Reserve meeting spaces & conference rooms with ease.</p>
                    </div>
                </button>
            </div>
        </div>
    );
};

// Helper Sub-component for Ticket Row (MST Style)
// Helper Sub-component for Ticket Row - DEPRECATED - Use shared/TicketCard

// RequestsTab for Tenant
const RequestsTab = ({ activeTickets, completedTickets, onNavigate, isLoading, onEditClick, onDeleteClick, onValidateClick }: { activeTickets: Ticket[], completedTickets: Ticket[], onNavigate: (tab: Tab) => void, isLoading: boolean, onEditClick?: (e: React.MouseEvent, t: Ticket) => void, onDeleteClick?: (e: React.MouseEvent, id: string) => void, onValidateClick?: (ticketId: string, approved: boolean, note?: string) => void }) => {
    const { user } = useAuth();
    const router = useRouter();
    const [filter, setFilter] = useState('all');
    const [viewMode, setViewMode] = useState<'all' | 'mine'>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'priority_high' | 'priority_low'>('newest');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [raisedByFilter, setRaisedByFilter] = useState('all');
    const [rejectingTicketId, setRejectingTicketId] = useState<string | null>(null);
    const [rejectNote, setRejectNote] = useState('');

    const priorityOrder: Record<string, number> = { critical: 0, urgent: 1, high: 2, medium: 3, low: 4 };

    const raisedByUsers = useMemo(() => {
        const all = [...activeTickets, ...completedTickets];
        const names = Array.from(new Set(all.map(t => t.raised_by_name).filter((n): n is string => !!n)));
        return names.sort();
    }, [activeTickets, completedTickets]);

    const applyFilters = (tickets: Ticket[]) => {
        let result = [...tickets];
        if (dateFrom) result = result.filter(t => new Date(t.created_at) >= new Date(dateFrom));
        if (dateTo) result = result.filter(t => new Date(t.created_at) <= new Date(dateTo + 'T23:59:59'));
        if (raisedByFilter !== 'all') result = result.filter(t => t.raised_by_name === raisedByFilter);
        return result;
    };

    const applySorting = (tickets: Ticket[]) => {
        return [...tickets].sort((a, b) => {
            if (sortBy === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            if (sortBy === 'priority_high') return (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
            if (sortBy === 'priority_low') return (priorityOrder[b.priority] ?? 3) - (priorityOrder[a.priority] ?? 3);
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
    };

    // Apply mine/all scoping before status filtering
    const scopedActive = viewMode === 'mine'
        ? activeTickets.filter(t => t.raised_by === user?.id)
        : activeTickets;
    const scopedCompleted = viewMode === 'mine'
        ? completedTickets.filter(t => t.raised_by === user?.id)
        : completedTickets;

    const getFilteredTickets = () => {
        let tickets: Ticket[] = [];
        if (filter === 'completed') tickets = scopedCompleted;
        else if (filter === 'waitlist') tickets = scopedActive.filter(t => t.status === 'waitlist');
        else if (filter === 'in_progress') tickets = scopedActive.filter(t => t.status !== 'waitlist');
        else if (filter === 'pending_validation') tickets = scopedActive.filter(t => t.status === 'pending_validation');
        else return []; // 'all' handled separately
        return applySorting(applyFilters(tickets));
    };

    const displayedTickets = getFilteredTickets();
    const hasActiveFilters = dateFrom !== '' || dateTo !== '' || raisedByFilter !== 'all' || sortBy !== 'newest';

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-0">
                <div>
                    <h2 className="text-2xl md:text-3xl font-display font-semibold text-slate-900 tracking-tight">Support Requests</h2>
                    <p className="text-sm md:text-base text-slate-500 font-medium mt-1">Track and manage your facility assistance tickets.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto flex-wrap">
                    {/* Mine / All toggle */}
                    <div className="flex items-center bg-slate-100 rounded-xl p-1 gap-1">
                        <button
                            onClick={() => setViewMode('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'all' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setViewMode('mine')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'mine' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Mine
                        </button>
                    </div>

                    {/* Status filter */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm flex-1 md:flex-none justify-between md:justify-start">
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-slate-400" />
                            <select
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer appearance-none pr-8 relative z-10"
                            >
                                <option value="all">All Requests</option>
                                <option value="in_progress">In Progress</option>
                                <option value="waitlist">Waitlist</option>
                                <option value="pending_validation">Needs Approval</option>
                                <option value="completed">Completed</option>
                            </select>
                        </div>
                    </div>
                    <button
                        onClick={() => onNavigate('create_request')}
                        className="w-auto px-4 md:px-6 py-3.5 bg-primary text-white font-black text-xs rounded-2xl uppercase tracking-[0.15em] hover:opacity-95 hover:scale-105 transition-all flex items-center justify-center gap-3 shadow-xl shadow-primary/20 shrink-0"
                    >
                        <Plus className="w-4 h-4" />
                        <span className="hidden md:inline">New Request</span>
                        <span className="md:hidden">New</span>
                    </button>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {/* Sort */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider hidden sm:block">Sort</span>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer appearance-none"
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="priority_high">Priority: High → Low</option>
                        <option value="priority_low">Priority: Low → High</option>
                    </select>
                </div>

                {/* Date From */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer w-[130px]"
                    />
                </div>

                {/* Date To */}
                <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer w-[130px]"
                    />
                </div>

                {/* Raised By User Filter */}
                {raisedByUsers.length > 0 && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl shadow-sm">
                        <UserCircle className="w-4 h-4 text-slate-400 shrink-0" />
                        <select
                            value={raisedByFilter}
                            onChange={(e) => setRaisedByFilter(e.target.value)}
                            className="bg-transparent text-sm font-bold text-slate-700 focus:outline-none cursor-pointer appearance-none"
                        >
                            <option value="all">All Users</option>
                            {raisedByUsers.map(name => (
                                <option key={name} value={name}>{name}</option>
                            ))}
                        </select>
                    </div>
                )}

                {/* Clear Filters */}
                {hasActiveFilters && (
                    <button
                        onClick={() => { setDateFrom(''); setDateTo(''); setRaisedByFilter('all'); setSortBy('newest'); }}
                        className="px-3 py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-xl transition-colors border border-rose-200 bg-white"
                    >
                        Clear Filters
                    </button>
                )}
            </div>

            {filter === 'all' ? (
                <>
                    {isLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-40 bg-slate-50 rounded-3xl animate-pulse border border-slate-100" />
                            ))}
                        </div>
                    ) : applySorting(applyFilters([...scopedActive, ...scopedCompleted])).length === 0 ? (
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-20 text-center">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                                <TicketIcon className="w-8 h-8 text-slate-200" />
                            </div>
                            <h4 className="text-lg font-bold text-slate-900 mb-2">{hasActiveFilters ? 'No matching requests' : 'No requests yet'}</h4>
                            <p className="text-slate-500 max-w-xs mx-auto">{hasActiveFilters ? 'Try adjusting your filters.' : 'No support requests have been raised yet.'}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                            {applySorting(applyFilters([...scopedActive, ...scopedCompleted]))
                                .map(ticket => {
                                    const isCompleted = ['resolved', 'closed'].includes(ticket.status);
                                    const isPendingValidation = ticket.status === 'pending_validation';
                                    return (
                                        <TicketCard
                                            key={ticket.id}
                                            id={ticket.id}
                                            title={ticket.title}
                                            priority={ticket.priority?.toUpperCase() as any || 'MEDIUM'}
                                            status={isCompleted ? 'COMPLETED' : isPendingValidation ? 'PENDING_VALIDATION' : ticket.status === 'waitlist' ? 'WAITLISTED' : ticket.status.toUpperCase() as any || 'OPEN'}
                                            ticketNumber={ticket.ticket_number}
                                            createdAt={ticket.created_at}
                                            photoUrl={ticket.photo_before_url}
                                            assignedTo={ticket.assignee?.full_name}
                                            escalationChain={buildEscalationChain(ticket.ticket_escalation_logs)}
                                            raisedByTenant={ticket.raised_by === user?.id}
                                            onClick={() => router.push(`/tickets/${ticket.id}?from=requests`)}
                                            onEdit={!isCompleted && !isPendingValidation && onEditClick ? (e) => onEditClick(e, ticket) : undefined}
                                            onDelete={onDeleteClick ? (e) => onDeleteClick(e, ticket.id) : undefined}
                                            onValidate={isPendingValidation && onValidateClick ? (e) => { e.stopPropagation(); onValidateClick(ticket.id, true); } : undefined}
                                            onReject={isPendingValidation && onValidateClick ? (e) => { e.stopPropagation(); setRejectingTicketId(ticket.id); setRejectNote(''); } : undefined}
                                        />
                                    );
                                })}
                        </div>
                    )}
                </>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center gap-3 px-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${filter === 'completed' ? 'bg-emerald-500' : 'bg-primary'}`} />
                        <h3 className="text-xs md:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                            {filter === 'completed' ? 'Completed Requests' : filter === 'waitlist' ? 'Waitlist Requests' : 'In Progress Requests'} ({displayedTickets.length})
                        </h3>
                    </div>
                    {isLoading ? (
                        <div className="space-y-4">
                            {[1, 2].map(i => (
                                <div key={i} className="h-40 bg-slate-50 rounded-3xl animate-pulse border border-slate-100" />
                            ))}
                        </div>
                    ) : displayedTickets.length === 0 ? (
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-20 text-center">
                            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                                <TicketIcon className="w-8 h-8 text-slate-200" />
                            </div>
                            <h4 className="text-lg font-bold text-slate-900 mb-2">No tickets found</h4>
                            <p className="text-slate-500 max-w-xs mx-auto">No tickets match the selected filter.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                            {displayedTickets.map(ticket => (
                                <TicketCard
                                    key={ticket.id}
                                    id={ticket.id}
                                    title={ticket.title}
                                    priority={ticket.priority?.toUpperCase() as any || 'MEDIUM'}
                                    status={filter === 'completed' ? 'COMPLETED' : ticket.status === 'waitlist' ? 'WAITLISTED' : ticket.status.toUpperCase() as any || 'OPEN'}
                                    ticketNumber={ticket.ticket_number}
                                    createdAt={ticket.created_at}
                                    photoUrl={ticket.photo_before_url}
                                    assignedTo={ticket.assignee?.full_name}
                                    assigneePhotoUrl={ticket.assignee?.user_photo_url}
                                    escalationChain={buildEscalationChain(ticket.ticket_escalation_logs)}
                                    raisedByTenant={ticket.raised_by === user?.id}
                                    onClick={() => router.push(`/tickets/${ticket.id}?from=requests`)}
                                    onEdit={onEditClick ? (e) => onEditClick(e, ticket) : undefined}
                                    onDelete={onDeleteClick ? (e) => onDeleteClick(e, ticket.id) : undefined}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Rejection Note Modal */}
            {rejectingTicketId && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setRejectingTicketId(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 p-6 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h2 className="text-lg font-bold text-slate-900">Why wasn't this resolved?</h2>
                        <p className="text-sm text-slate-500">Optional — let the team know what still needs to be done.</p>
                        <textarea
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            placeholder="Describe what's still missing or incorrect..."
                            className="w-full h-28 px-4 py-3 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 resize-none focus:outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400 transition-all text-sm"
                        />
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setRejectingTicketId(null)}
                                className="px-4 py-2 text-slate-600 font-semibold rounded-xl hover:bg-slate-100 transition-colors text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (rejectingTicketId && onValidateClick) {
                                        onValidateClick(rejectingTicketId, false, rejectNote || undefined);
                                    }
                                    setRejectingTicketId(null);
                                }}
                                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition-colors text-sm"
                            >
                                Reopen Request
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};



export default TenantDashboard;
