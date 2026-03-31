'use client';

import React, { useState, useEffect } from 'react';
import {
    LayoutDashboard, Ticket, Clock, CheckCircle2, AlertCircle, Plus,
    LogOut, Settings, Search, UserCircle, Coffee, Fuel, UsersRound,
    ClipboardList, FolderKanban, Moon, Sun, ChevronRight, Cog, X,
    AlertOctagon, BarChart3, FileText, Wrench, Camera, Menu, Pencil, Loader2, Filter, Activity, Zap, Calendar, ClipboardCheck, ScanLine
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import { useAuth } from '@/frontend/context/AuthContext';
import { useDataCache } from '@/frontend/context/DataCacheContext';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { checkInResolver } from '@/frontend/utils/resolver';
import Skeleton from '@/frontend/components/ui/Skeleton';
import SignOutModal from '@/frontend/components/ui/SignOutModal';
import NotificationBell from './NotificationBell';
import Image from 'next/image';
import DieselStaffDashboard from '@/frontend/components/diesel/DieselStaffDashboard';
import ElectricityStaffDashboard from '@/frontend/components/electricity/ElectricityStaffDashboard';
import TenantTicketingDashboard from '@/frontend/components/tickets/TenantTicketingDashboard';
import { useTheme } from '@/frontend/context/ThemeContext';
import SettingsView from './SettingsView';
import VMSAdminDashboard from '@/frontend/components/vms/VMSAdminDashboard';
import TicketFlowMap from '@/frontend/components/ops/TicketFlowMap';
import { ShiftToast } from '@/frontend/components/mst/ShiftStatus';
import NavbarShiftStatus from '@/frontend/components/mst/NavbarShiftStatus';
import TicketCard from '@/frontend/components/shared/TicketCard';
import SOPDashboard from '@/frontend/components/sop/SOPDashboard';
import dynamic from 'next/dynamic';
const UniversalQRScannerModal = dynamic(() => import('@/frontend/components/shared/UniversalQRScannerModal'), { ssr: false });

// Types
type Tab = 'dashboard' | 'requests' | 'create_request' | 'visitors' | 'diesel' | 'electricity' | 'settings' | 'profile' | 'flow-map' | 'checklist';

interface Property {
    id: string;
    name: string;
    code: string;
    address: string;
    organization_id?: string;
}

interface Ticket {
    id: string;
    ticket_number: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    created_at: string;
    assigned_to?: string | null;
    assignee?: {
        full_name: string;
        email: string;
    } | null;
    photo_before_url?: string;
    raised_by?: string;
    internal?: boolean;
    property_id?: string;
    creator?: { property_memberships?: { role: string; property_id: string }[] };
    ticket_escalation_logs?: { from_level: number; to_level: number | null; escalated_at: string; from_employee?: { full_name: string; user_photo_url?: string | null } | null; to_employee?: { full_name: string; user_photo_url?: string | null } | null }[];
}

const MstDashboard = () => {
    const { user, signOut } = useAuth();
    const params = useParams();
    const router = useRouter();
    const propertyId = params?.propertyId as string;

    // State
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [property, setProperty] = useState<Property | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const { theme, toggleTheme } = useTheme();
    const isDarkMode = theme === 'dark';
    const [showQuickActions, setShowQuickActions] = useState(true);
    const [incomingTickets, setIncomingTickets] = useState<Ticket[]>([]);
    const [completedTickets, setCompletedTickets] = useState<Ticket[]>([]);
    const [isFetching, setIsFetching] = useState(false);
    const [userRole, setUserRole] = useState('MST Professional');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showQRScanner, setShowQRScanner] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const searchParams = useSearchParams();
    const { getCachedData, setCachedData } = useDataCache();
    const cacheKeyPrefix = `mst-${propertyId}`;

    // Edit Modal State
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // Shift Tracking State
    const [isCheckedIn, setIsCheckedIn] = useState(false);
    const [isShiftLoading, setIsShiftLoading] = useState(false);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error', visible: boolean }>({
        message: '',
        type: 'success',
        visible: false
    });
    const [requestFilter, setRequestFilter] = useState<'all' | 'active' | 'completed'>(
        (searchParams.get('filter') as any) || 'all'
    );

    const supabase = createClient();

    useEffect(() => {
        if (propertyId) {
            // Priority 1: Restore from cache for instant navigation
            const cachedProperty = getCachedData(`${cacheKeyPrefix}-details`);
            const cachedTickets = getCachedData(`${cacheKeyPrefix}-tickets`);

            if (cachedProperty) setProperty(cachedProperty);
            if (cachedTickets) {
                setIncomingTickets(cachedTickets.incoming);
                setCompletedTickets(cachedTickets.completed);
                setIsLoading(false);
            }

            fetchPropertyDetails();
            fetchTickets();
            fetchUserRole();
            fetchShiftStatus();
            if (user?.id) {
                checkInResolver(user.id, propertyId);
            }
        }
    }, [propertyId, user?.id]);

    // Global loading timeout to prevent infinite spinners
    useEffect(() => {
        let timeout: NodeJS.Timeout;
        if (isLoading && !property && !incomingTickets.length) {
            timeout = setTimeout(() => {
                setErrorMsg('Service is taking longer than expected. Please retry.');
            }, 10000);
        }
        return () => clearTimeout(timeout);
    }, [isLoading, property, incomingTickets.length]);

    // Restore tab from URL
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['dashboard', 'requests', 'create_request', 'visitors', 'diesel', 'electricity', 'settings', 'profile', 'flow-map'].includes(tab)) {
            setActiveTab(tab as Tab);
        }
    }, [searchParams]);

    // Helper to change tab with URL persistence
    const handleTabChange = (tab: Tab, filter?: 'all' | 'active' | 'completed') => {
        setActiveTab(tab);
        if (filter) {
            setRequestFilter(filter);
        }
        setSidebarOpen(false);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        if (filter) {
            url.searchParams.set('filter', filter);
        } else {
            // Keep existing filter if it's there, or delete if coming from a non-request tab
            const currentFilter = searchParams.get('filter');
            if (currentFilter && tab === 'requests') {
                url.searchParams.set('filter', currentFilter);
            } else if (tab !== 'requests') {
                url.searchParams.delete('filter');
            }
        }
        window.history.pushState({}, '', url.toString());
    };

    const fetchShiftStatus = async () => {
        if (!propertyId) return;
        try {
            const res = await fetch(`/api/mst/shift?propertyId=${propertyId}`);
            if (res.ok) {
                const data = await res.json();
                setIsCheckedIn(data.isCheckedIn);
            }
        } catch (error) {
            console.error('Failed to fetch shift status:', error);
        }
    };

    const handleShiftToggle = async () => {
        if (!propertyId) return;
        setIsShiftLoading(true);
        try {
            const action = isCheckedIn ? 'check-out' : 'check-in';
            const res = await fetch('/api/mst/shift', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId, action })
            });

            if (res.ok) {
                const data = await res.json();
                setIsCheckedIn(data.isCheckedIn);
                showToast(data.message, 'success');
            } else {
                const err = await res.json();
                showToast(err.error || 'Operation failed', 'error');
            }
        } catch (error) {
            showToast('Network error occurred', 'error');
        } finally {
            setIsShiftLoading(false);
        }
    };

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type, visible: true });
        setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
    };

    const fetchUserRole = async () => {
        if (!user) return;
        const { data: member } = await supabase
            .from('property_memberships')
            .select('role')
            .eq('user_id', user.id)
            .eq('property_id', propertyId)
            .single();

        if (member) {
            setUserRole(member.role.replace('_', ' '));
        } else {
            // Check org membership if property not found
            const { data: orgMember } = await supabase
                .from('organization_memberships')
                .select('role')
                .eq('user_id', user.id)
                .single();
            if (orgMember) setUserRole(orgMember.role.replace('_', ' '));
        }
    };

    const fetchTickets = async () => {
        if (!user || !propertyId) return;
        setIsFetching(true);
        console.log('Fetching all property tickets for MST view:', propertyId);

        const { data, error } = await supabase
            .from('tickets')
            .select(`
                *,
                assignee:users!assigned_to(id, full_name, email, user_photo_url),
                creator:users!raised_by(property_memberships(role, property_id)),
                ticket_escalation_logs(from_level, to_level, escalated_at, from_employee:users!from_employee_id(full_name, user_photo_url), to_employee:users!to_employee_id(full_name, user_photo_url))
            `)
            .eq('property_id', propertyId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching tickets:', error);
        } else {
            const active = (data || []).filter((t: any) => !['resolved', 'closed'].includes(t.status));
            const completed = (data || []).filter((t: any) => ['resolved', 'closed'].includes(t.status));
            setIncomingTickets(active);
            setCompletedTickets(completed);
            setCachedData(`${cacheKeyPrefix}-tickets`, { incoming: active, completed });
        }
        setIsFetching(false);
    };

    const fetchPropertyDetails = async () => {
        setIsLoading(true);
        setErrorMsg('');

        const { data, error } = await supabase
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .maybeSingle();

        if (error || !data) {
            console.error('Property fetch error:', error);
            setErrorMsg(`Property not found (ID: ${propertyId})`);
        } else {
            setProperty(data);
            setCachedData(`${cacheKeyPrefix}-details`, data);
        }
        setIsLoading(false);
    };

    if (isLoading && !property) return (
        <div className="min-h-screen bg-background flex">
            {/* Sidebar Skeleton */}
            <aside className="w-64 border-r border-border p-6 space-y-6 hidden lg:block bg-white">
                <Skeleton className="w-full h-12" />
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="w-full h-10" />)}
                </div>
            </aside>
            <main className="flex-1">
                <header className="h-14 border-b border-border px-6 flex items-center justify-between bg-white">
                    <Skeleton className="w-32 h-6" />
                    <Skeleton className="w-48 h-8 rounded-full" />
                </header>
                <div className="p-8 space-y-8">
                    <header className="flex justify-between items-center">
                        <div className="space-y-2">
                            <Skeleton className="w-64 h-10" />
                            <Skeleton className="w-48 h-4" />
                        </div>
                    </header>
                    <div className="bg-white border border-border rounded-2xl p-8 space-y-6">
                        <Skeleton className="w-48 h-6" />
                        <div className="grid grid-cols-3 gap-8">
                            <Skeleton className="h-24" />
                            <Skeleton className="h-24" />
                            <Skeleton className="h-24" />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );

    if (!property) return (
        <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="text-center">
                <h2 className="text-xl font-bold text-error">Error Loading Dashboard</h2>
                <p className="text-text-secondary mt-2">{errorMsg || 'Property not found.'}</p>
                <button onClick={() => router.back()} className="mt-4 text-primary font-bold hover:underline">Go Back</button>
            </div>
        </div>
    );



    const handleEditClick = (e: React.MouseEvent, ticket: Ticket) => {
        e.stopPropagation();
        setEditingTicket(ticket);
        setEditTitle(ticket.title);
        setEditDescription(ticket.description);
    };

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


    return (
        <div className="min-h-screen bg-background flex font-inter text-text-primary">
            {/* Mobile Overlay */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside className={`
                w-64 bg-sidebar border-r border-slate-300 flex flex-col inset-y-0 z-50 transition-all duration-300
                fixed left-0
                ${sidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 lg:translate-x-0 lg:opacity-100'}
                overflow-hidden
            `}>
                {/* Mobile Close Button */}
                <button
                    onClick={() => setSidebarOpen(false)}
                    className="absolute top-4 right-4 lg:hidden p-2 rounded-lg hover:bg-surface-elevated transition-colors"
                >
                    <X className="w-5 h-5 text-text-secondary" />
                </button>

                {/* Logo */}
                <div className="p-5 lg:p-6 pb-1 flex-shrink-0">
                    <div className="flex flex-col items-center gap-1.5 mb-3">
                        <img src="/autopilot-logo-new.png" alt="Autopilot Logo" className="h-10 w-auto object-contain" />
                        <p className="text-[9px] text-text-tertiary font-black uppercase tracking-[0.2em]">Maintenance Portal</p>
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="px-3 pb-3">
                    <div className="flex items-center justify-between mb-2 px-1">
                        <span className="text-[9px] font-bold text-text-tertiary uppercase tracking-wider">Quick Actions</span>
                        <button onClick={() => setShowQuickActions(!showQuickActions)} className="text-text-tertiary hover:text-slate-300">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                    {showQuickActions && (
                        <div className="grid grid-cols-1 gap-2">
                            <button
                                onClick={() => handleTabChange('create_request')}
                                className="w-full flex items-center gap-2.5 px-3 py-2 bg-surface-elevated text-text-primary rounded-xl hover:bg-muted transition-all border border-border group shadow-sm"
                            >
                                <div className="w-7 h-7 bg-primary/20 rounded-lg flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                                    <Plus className="w-4 h-4 font-black" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest">New Request</span>
                            </button>
                            <button
                                onClick={() => { setSidebarOpen(false); setShowQRScanner(true); }}
                                className="w-full flex items-center gap-2.5 px-3 py-2 bg-surface-elevated text-text-primary rounded-xl hover:bg-muted transition-all border border-border group shadow-sm"
                            >
                                <div className="w-7 h-7 bg-primary/20 rounded-lg flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                                    <ScanLine className="w-4 h-4" />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-widest">Scan QR</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 overflow-y-auto min-h-0 custom-scrollbar">
                    {/* Daily Work */}
                    <div className="mb-4">
                        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-2 flex items-center gap-1.5">
                            <span className="w-0.5 h-2.5 bg-primary rounded-full" />
                            Daily Work
                        </p>
                        <div className="space-y-0.5">
                            <button
                                onClick={() => handleTabChange('dashboard')}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-sm font-bold ${activeTab === 'dashboard'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <LayoutDashboard className="w-4 h-4" />
                                Overview
                            </button>
                            <button
                                onClick={() => handleTabChange('requests')}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-sm font-bold ${activeTab === 'requests'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Ticket className="w-4 h-4" />
                                Requests
                            </button>
                            <button
                                onClick={() => handleTabChange('flow-map')}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all text-sm font-bold ${activeTab === 'flow-map'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Activity className="w-4 h-4" />
                                Live Flow Map
                            </button>
                            {/* Hidden until feature complete: Projects */}
                        </div>
                    </div>

                    {/* Operations */}
                    <div className="mb-4">
                        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-2 flex items-center gap-1.5">
                            <span className="w-0.5 h-2.5 bg-primary rounded-full" />
                            Operations
                        </p>
                        <div className="space-y-0.5">
                            <button
                                onClick={() => handleTabChange('visitors')}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all text-sm font-bold ${activeTab === 'visitors'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <UsersRound className="w-4 h-4" />
                                Visitors
                            </button>
                            <button
                                onClick={() => handleTabChange('diesel')}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all text-sm font-bold ${activeTab === 'diesel'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Fuel className="w-4 h-4" />
                                Diesel Logger
                            </button>
                            <button
                                onClick={() => handleTabChange('electricity')}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all text-sm font-bold ${activeTab === 'electricity'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Zap className="w-4 h-4" />
                                Electricity Logger
                            </button>
                            <button
                                onClick={() => handleTabChange('checklist')}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all text-sm font-bold ${activeTab === 'checklist'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <ClipboardCheck className="w-4 h-4" />
                                Checklists
                            </button>
                        </div>
                    </div>

                    {/* System & Personal */}
                    <div className="mb-4">
                        <p className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-2 flex items-center gap-1.5">
                            <span className="w-0.5 h-2.5 bg-primary rounded-full" />
                            System & Personal
                        </p>
                        <div className="space-y-0.5">
                            <button
                                onClick={() => handleTabChange('settings')}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all text-sm font-bold ${activeTab === 'settings'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Settings className="w-4 h-4" />
                                Settings
                            </button>
                            <button
                                onClick={() => handleTabChange('profile')}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg transition-all text-sm font-bold ${activeTab === 'profile'
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

                {/* Footer */}
                <div className="border-t border-border p-4 pb-12 flex-shrink-0 bg-sidebar">
                    <button
                        onClick={() => setShowSignOutModal(true)}
                        className="flex items-center gap-2 px-3 py-2 text-text-tertiary hover:text-red-400 rounded-lg w-full transition-colors text-[11px] font-bold uppercase tracking-wider"
                    >
                        <LogOut className="w-3.5 h-3.5" />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 lg:ml-64 flex flex-col bg-background border-l border-slate-300 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.05)] relative z-10">
                {/* Top Header */}
                <header className="h-14 bg-white border-b border-border flex items-center justify-between px-4 md:px-6 sticky top-0 z-30">
                    <div className="flex items-center gap-4">
                        {/* Mobile Menu Toggle */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 -ml-2 lg:hidden text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Notification Bell */}
                        <NotificationBell />

                        {/* Shift Status in Navbar */}
                        <NavbarShiftStatus
                            isCheckedIn={isCheckedIn}
                            isLoading={isShiftLoading}
                            onToggle={handleShiftToggle}
                        />
                        <span className="text-xs text-text-secondary font-medium">
                            {user?.user_metadata?.full_name || user?.email?.split('@')[0]}
                        </span>
                    </div>
                </header>

                {/* Page Content */}
                {/* Page Content */}
                <main className={`flex-1 w-full min-h-0 overflow-y-auto overflow-x-hidden ${activeTab === 'checklist' ? 'p-0' : 'p-2 sm:p-4 md:p-6'} bg-slate-50/50`}>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {activeTab === 'dashboard' && property && user && (
                                <DashboardTab
                                    tickets={incomingTickets.filter(t =>
                                        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        t.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
                                    )}
                                    completedCount={completedTickets.filter(t =>
                                        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        t.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
                                    ).length}
                                    onTicketClick={(id) => router.push(`/tickets/${id}?from=${activeTab}`)}
                                    userId={user.id}
                                    isLoading={isLoading}
                                    propertyId={propertyId}
                                    propertyName={property.name}
                                    userName={user.user_metadata?.full_name || user.email?.split('@')[0] || 'MST'}
                                    onSettingsClick={() => handleTabChange('settings')}
                                    onEditClick={handleEditClick}
                                    onFilterClick={(filter) => handleTabChange('requests', filter)}
                                />
                            )}
                            {activeTab === 'requests' && user && (
                                <RequestsTab
                                    activeTickets={incomingTickets.filter(t =>
                                        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        t.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
                                    )}
                                    completedTickets={completedTickets.filter(t =>
                                        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        t.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                        t.description?.toLowerCase().includes(searchQuery.toLowerCase())
                                    )}
                                    onTicketClick={(id) => router.push(`/tickets/${id}?from=${activeTab}`)}
                                    userId={user.id}
                                    isLoading={isFetching}
                                    propertyName={property?.name}
                                    userName={user.user_metadata?.full_name || user.email?.split('@')[0] || 'MST'}
                                    onEditClick={handleEditClick}
                                    propertyId={propertyId}
                                    onTabChange={handleTabChange}
                                    filter={requestFilter}
                                    onFilterChange={(newFilter) => {
                                        setRequestFilter(newFilter);
                                        const url = new URL(window.location.href);
                                        url.searchParams.set('filter', newFilter);
                                        window.history.pushState({}, '', url.toString());
                                    }}
                                />
                            )}
                            {activeTab === 'create_request' && property && user && (
                                <TenantTicketingDashboard
                                    propertyId={property.id}
                                    organizationId={property.organization_id || ''}
                                    user={{ id: user.id, full_name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Staff' }}
                                    propertyName={property.name}
                                    isStaff={true}
                                    showInternalToggle={true}
                                />
                            )}
                            {activeTab === 'flow-map' && (
                                <TicketFlowMap propertyId={propertyId} />
                            )}
                            {activeTab === 'visitors' && propertyId && (
                                <VMSAdminDashboard propertyId={propertyId} />
                            )}
                            {activeTab === 'diesel' && <DieselStaffDashboard isDark={isDarkMode} />}
                            {activeTab === 'electricity' && property && <ElectricityStaffDashboard propertyId={property.id} isDark={isDarkMode} />}
                            {activeTab === 'checklist' && property && <SOPDashboard propertyId={property.id} />}
                            {activeTab === 'settings' && <SettingsView />}
                            {activeTab === 'profile' && (
                                <div className="flex justify-center items-start py-8">
                                    <div className="bg-white border border-slate-100 rounded-3xl shadow-lg w-full max-w-md overflow-hidden">
                                        {/* Card Header with Autopilot Logo */}
                                        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 flex flex-col items-center">
                                            {/* Autopilot Logo */}
                                            <div className="flex items-center justify-center mb-6">
                                                <img
                                                    src="/autopilot-logo-new.png"
                                                    alt="Autopilot Logo"
                                                    className="h-10 w-auto object-contain dark:invert transition-smooth"
                                                />
                                            </div>

                                            {/* User Avatar */}
                                            <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center border-4 border-white/20 mb-4 overflow-hidden">
                                                {user?.user_metadata?.user_photo_url || user?.user_metadata?.avatar_url ? (
                                                    <Image
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
                                            <span className="px-4 py-1.5 bg-primary text-text-inverse rounded-full text-xs font-black uppercase tracking-wider">
                                                {userRole}
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
                                                        {property?.name || 'Not Assigned'}
                                                    </span>
                                                </div>

                                                <div className="flex justify-between items-center py-3">
                                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Work Email</span>
                                                    <span className="text-xs font-medium text-primary">
                                                        {user?.email}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div >

            <SignOutModal
                isOpen={showSignOutModal}
                onClose={() => setShowSignOutModal(false)}
                onConfirm={signOut}
            />

            {showQRScanner && (
                <UniversalQRScannerModal
                    onResult={(result) => {
                        setShowQRScanner(false);
                        if (result.type === 'checklist') {
                            router.push(`/checklist/${result.templateId}`);
                        } else if (result.type === 'stock') {
                            router.push(`/property/${propertyId}/stock/scan?item=${result.itemId}`);
                        } else if (result.type === 'barcode') {
                            router.push(`/property/${propertyId}/stock/scan?barcode=${encodeURIComponent(result.value)}`);
                        }
                    }}
                    onClose={() => setShowQRScanner(false)}
                />
            )}

            <ShiftToast
                message={toast.message}
                type={toast.type}
                visible={toast.visible}
            />

            {/* Edit Ticket Modal */}
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
                            className="bg-white/90 backdrop-blur-xl rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl border border-white/20"
                        >
                            <div className="p-8 border-b border-border">
                                <div className="flex items-center justify-between mb-2">
                                    <h2 className="text-2xl font-display font-semibold text-slate-800">Edit Maintenance Request</h2>
                                    <button
                                        onClick={() => setEditingTicket(null)}
                                        className="p-2 hover:bg-muted rounded-full transition-smooth"
                                    >
                                        <X className="w-5 h-5 text-text-tertiary" />
                                    </button>
                                </div>
                                <p className="text-text-tertiary text-sm">Update the details of your service request.</p>
                            </div>

                            <div className="p-8 space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Request Title</label>
                                    <input
                                        type="text"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-primary transition-all font-bold text-slate-700"
                                        placeholder="Brief summary of the issue"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Detailed Description</label>
                                    <textarea
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        rows={4}
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl focus:outline-none focus:border-primary transition-all font-medium text-slate-600 resize-none"
                                        placeholder="Please provide more details about your request..."
                                    />
                                </div>
                            </div>

                            <div className="p-8 bg-slate-50 flex gap-4">
                                <button
                                    onClick={() => setEditingTicket(null)}
                                    className="flex-1 px-6 py-3 border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-white transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUpdateTicket}
                                    disabled={isUpdating || !editTitle.trim()}
                                    className="flex-1 px-6 py-3 bg-primary text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:opacity-95 shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {isUpdating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save Changes'}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div >
    );
};

// Helper Sub-component for Ticket Row - DEPRECATED - Use shared/TicketCard

// Dashboard Tab
const DashboardTab = ({ tickets, completedCount, onTicketClick, userId, isLoading, propertyId, propertyName, userName, onSettingsClick, onEditClick, onFilterClick }: { tickets: Ticket[], completedCount: number, onTicketClick: (id: string) => void, userId: string, isLoading: boolean, propertyId: string, propertyName?: string, userName?: string, onSettingsClick?: () => void, onEditClick?: (e: React.MouseEvent, t: Ticket) => void, onFilterClick?: (filter: 'all' | 'active' | 'completed') => void }) => {
    const total = tickets.length + completedCount;
    const active = tickets.filter(t => t.status === 'in_progress' || t.status === 'assigned' || t.status === 'open').length;
    const completed = completedCount;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-text-primary">Maintenance Dashboard</h1>
                <p className="text-text-tertiary text-sm mt-1">{propertyName || 'Property'} • MST: {userName}</p>
            </div>

            {/* Dashboard Section */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-base font-bold text-text-primary">Dashboard</h2>
                    <button
                        onClick={onSettingsClick}
                        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary border border-border px-3 py-1.5 rounded-lg bg-surface-elevated transition-colors">
                        <Settings className="w-3 h-3" />
                        Customize
                    </button>
                </div>

                {/* Work Orders Overview */}
                {/* WORK ORDERS OVERVIEW (Horizontal, wraps if needed) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <button
                        onClick={() => onFilterClick?.('all')}
                        className="bg-surface-elevated border border-border rounded-xl p-4 text-center hover:bg-muted transition-colors group"
                    >
                        <p className="text-3xl font-black text-text-primary group-hover:scale-110 transition-transform">{total}</p>
                        <p className="text-xs font-bold text-text-tertiary uppercase tracking-wider mt-1">Total</p>
                    </button>
                    <button
                        onClick={() => onFilterClick?.('active')}
                        className="bg-surface-elevated border border-border rounded-xl p-4 text-center hover:bg-muted transition-colors group"
                    >
                        <p className="text-3xl font-black text-info group-hover:scale-110 transition-transform">{active}</p>
                        <p className="text-xs font-bold text-text-tertiary uppercase tracking-wider mt-1">Active</p>
                    </button>
                    <button
                        onClick={() => onFilterClick?.('completed')}
                        className="bg-surface-elevated border border-border rounded-xl p-4 text-center hover:bg-muted transition-colors group"
                    >
                        <p className="text-3xl font-black text-success group-hover:scale-110 transition-transform">{completed}</p>
                        <p className="text-xs font-bold text-text-tertiary uppercase tracking-wider mt-1">Completed</p>
                    </button>
                </div>
            </div>

            {/* Property Requests */}
            {/* Property Requests - Independent Cards */}
            <div className="space-y-4">
                <div className="mb-2">
                    <h2 className="text-base font-bold text-text-primary">Property Requests</h2>
                    <p className="text-xs text-text-tertiary">All requests for this property</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {isLoading ? (
                        [1, 2, 3].map(i => (
                            <div key={i} className="h-48 bg-surface-elevated border border-border rounded-2xl animate-pulse" />
                        ))
                    ) : tickets.length === 0 ? (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-text-tertiary border-2 border-dashed border-border rounded-3xl">
                            <p className="font-bold text-sm">No requests found</p>
                        </div>
                    ) : (
                        [...tickets]
                            .sort((a, b) => {
                                if (a.assigned_to === userId && b.assigned_to !== userId) return -1;
                                if (a.assigned_to !== userId && b.assigned_to === userId) return 1;
                                return 0;
                            })
                            .map((ticket) => (
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
                                    assigneePhotoUrl={(ticket.assignee as any)?.user_photo_url}
                                    photoUrl={ticket.photo_before_url}
                                    escalationChain={(() => { const logs = ticket.ticket_escalation_logs; if (!logs || logs.length === 0) return undefined; const sorted = [...logs].sort((a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime()); const chain: { name: string; avatar?: string | null }[] = []; sorted.forEach((log, i) => { if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url }); if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url }); }); return chain.length > 0 ? chain : undefined; })()}
                                    raisedByTenant={((ticket.creator as any)?.property_memberships || []).some((m: any) => m.property_id === ticket.property_id && ['tenant', 'super_tenant'].includes((m.role || '').toLowerCase()))}
                                    onClick={() => onTicketClick?.(ticket.id)}
                                    onEdit={onEditClick ? (e) => onEditClick(e, ticket) : undefined}
                                />
                            ))
                    )}
                </div>
            </div>
        </div>
    );
};

// Tasks Tab
const TasksTab = () => (
    <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">My Tasks</h1>
        <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
            <ClipboardList className="w-12 h-12 text-text-tertiary/40 mx-auto mb-3" />
            <p className="text-text-tertiary text-sm">No tasks assigned to you</p>
        </div>
    </div>
);

// Projects Tab
const ProjectsTab = () => (
    <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">My Project Work</h1>
        <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
            <FolderKanban className="w-12 h-12 text-text-tertiary/40 mx-auto mb-3" />
            <p className="text-text-tertiary text-sm">No projects assigned to you</p>
        </div>
    </div>
);

// Requests Tab
const RequestsTab = ({ activeTickets = [], completedTickets = [], onTicketClick, userId, isLoading, propertyName, userName, onEditClick, propertyId, onTabChange, filter = 'all', onFilterChange }: { activeTickets?: Ticket[], completedTickets?: Ticket[], onTicketClick?: (id: string) => void, userId: string, isLoading: boolean, propertyName?: string, userName?: string, onEditClick?: (e: React.MouseEvent, t: Ticket) => void, propertyId?: string, onTabChange?: (tab: Tab) => void, filter?: 'all' | 'active' | 'completed' | 'tasks' | 'completed_by_me' | 'waitlist', onFilterChange?: (filter: any) => void }) => {
    // Local state for MST-specific filters, but parent can override via props
    // Using a more flexible type for filter to support both property-wide and MST-specific views

    const getFilteredTickets = () => {
        const uId = userId || '';
        switch (filter) {
            case 'completed_by_me':
                return completedTickets.filter(t =>
                    String(t.assigned_to) === String(uId) ||
                    (t as any).assignee?.id === uId
                );
            case 'completed':
                return completedTickets;
            case 'tasks':
                // Shows ACTIVE tasks assigned to the logged-in user
                return activeTickets.filter(t =>
                    String(t.assigned_to) === String(uId) ||
                    (t as any).assignee?.id === uId
                );
            case 'active':
                return activeTickets;
            case 'waitlist':
                // Shows unassigned or waitlisted property-wide requests
                return activeTickets.filter(t => !t.assigned_to || t.status === 'waitlist');
            case 'all':
            default:
                // Shows all activity for the property
                return [...activeTickets, ...completedTickets];
        }
    };

    const filtered = getFilteredTickets();

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Requests</h1>
                    <p className="text-text-tertiary text-xs mt-1">Manage and track service requests</p>
                </div>

                <div className="flex flex-col sm:flex-row shadow-sm sm:shadow-none items-stretch sm:items-center gap-2 sm:gap-3 p-1 sm:p-0 bg-white sm:bg-transparent rounded-2xl border border-gray-100 sm:border-none">
                    <div className="flex items-center gap-2 bg-surface-elevated border border-border px-3 py-2 sm:py-1.5 rounded-xl">
                        <Filter className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
                        <select
                            value={filter}
                            onChange={(e) => onFilterChange?.(e.target.value as any)}
                            className="bg-transparent text-xs font-bold text-text-secondary focus:outline-none cursor-pointer w-full"
                        >
                            <option value="all">All Property Requests</option>
                            <option value="active">All Active Requests</option>
                            <option value="completed">All Completed Requests</option>
                            <option value="tasks">Your Tasks (Active)</option>
                            <option value="completed_by_me">Completed By You</option>
                            <option value="waitlist">Waitlist (Unassigned)</option>
                        </select>
                    </div>
                    {propertyId && onTabChange && (
                        <button
                            onClick={() => window.open(`/property/${propertyId}/flow-map`, '_blank')}
                            className="flex items-center justify-center gap-2 px-4 py-2 bg-primary/10 text-primary text-xs font-bold rounded-xl border border-primary/20 hover:bg-primary/20 transition-all active:scale-[0.98]"
                        >
                            <Activity className="w-4 h-4" /> <span>Live Flow Map</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Content Area */}
            <div className="bg-card border border-border rounded-xl p-3 sm:p-5 shadow-sm min-h-[400px]">
                <div className="flex items-center justify-between mb-6 px-2">
                    <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider flex items-center gap-2">
                        {filter === 'completed' || filter === 'completed_by_me' ? <CheckCircle2 className="w-4 h-4 text-success" /> :
                            filter === 'tasks' ? <ClipboardList className="w-4 h-4 text-primary" /> :
                                filter === 'waitlist' ? <AlertCircle className="w-4 h-4 text-warning" /> :
                                    filter === 'active' ? <Zap className="w-4 h-4 text-info" /> :
                                        <FolderKanban className="w-4 h-4 text-info" />
                        }
                        {filter === 'all' ? 'All Property Activity' :
                            filter === 'active' ? 'All Active Requests' :
                                filter === 'completed' ? 'All Completed Requests' :
                                    filter === 'tasks' ? 'Tasks Assigned To You' :
                                        filter === 'completed_by_me' ? 'Your Completed Work' : 'Awaiting Assignment'}
                        <span className="ml-2 text-[10px] bg-muted px-2 py-0.5 rounded-full text-text-tertiary">{filtered.length}</span>
                    </h2>
                </div>

                {isLoading ? (
                    <div className="flex flex-col gap-3 py-4">
                        {[1, 2, 3, 4].map(i => (
                            <div key={i} className="h-24 bg-surface-elevated border border-border rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center bg-muted/30 rounded-[2rem] border border-dashed border-border group">
                        <div className="w-16 h-16 bg-surface-elevated rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                            {filter === 'completed' ? <CheckCircle2 className="w-8 h-8 text-text-tertiary/20" /> :
                                filter === 'tasks' ? <ClipboardList className="w-8 h-8 text-text-tertiary/20" /> :
                                    filter === 'waitlist' ? <AlertCircle className="w-8 h-8 text-text-tertiary/20" /> :
                                        <Ticket className="w-8 h-8 text-text-tertiary/20" />
                            }
                        </div>
                        <p className="text-text-secondary font-bold">No matching records found</p>
                        <p className="text-text-tertiary text-xs mt-1">Try switching the filter to see more data.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                        {filtered
                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                            .map((ticket) => (
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
                                    assigneePhotoUrl={(ticket.assignee as any)?.user_photo_url}
                                    photoUrl={ticket.photo_before_url}
                                    escalationChain={(() => { const logs = ticket.ticket_escalation_logs; if (!logs || logs.length === 0) return undefined; const sorted = [...logs].sort((a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime()); const chain: { name: string; avatar?: string | null }[] = []; sorted.forEach((log, i) => { if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url }); if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url }); }); return chain.length > 0 ? chain : undefined; })()}
                                    raisedByTenant={((ticket.creator as any)?.property_memberships || []).some((m: any) => m.property_id === ticket.property_id && ['tenant', 'super_tenant'].includes((m.role || '').toLowerCase()))}
                                    onClick={() => onTicketClick?.(ticket.id)}
                                    onEdit={onEditClick ? (e) => onEditClick(e, ticket) : undefined}
                                />
                            ))}
                    </div>
                )}
            </div>
        </div>
    );
};





// Visitors Tab
const VisitorsTab = () => (
    <div className="space-y-6">
        <h1 className="text-2xl font-bold text-text-primary">Visitors</h1>
        <div className="bg-card border border-border rounded-xl p-12 text-center shadow-sm">
            <UsersRound className="w-12 h-12 text-text-tertiary/40 mx-auto mb-3" />
            <p className="text-text-tertiary text-sm">Check-in and verify property visitors</p>
        </div>
    </div>
);



export default MstDashboard;
