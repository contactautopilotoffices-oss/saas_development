/**
 * PropertyAdminDashboard
 * Property-level admin dashboard with tabs for: overview, requests, reports, users, visitors,
 * meeting rooms, diesel, electricity, cafeteria, settings, stock, checklists, PPM, and escalation.
 * Provides property-level analytics, user management, ticket workflows, and asset monitoring.
 * @remarks Client component using Supabase, AuthContext, GlobalContext.
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import {
    LayoutDashboard, Users, Ticket, Settings, UserCircle, UsersRound,
    Search, Plus, Filter, LogOut, ChevronRight, MapPin, Building2,
    Calendar, CheckCircle2, AlertCircle, Clock, Coffee, IndianRupee, FileDown, Fuel, Store, Activity, Upload, FileBarChart, Menu, X, Zap, RefreshCw,
    Package, ClipboardCheck, Scan, ChevronDown, Check, GitBranch, CalendarDays
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import { useAuth } from '@/frontend/context/AuthContext';
import { useDataCache } from '@/frontend/context/DataCacheContext';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import UserDirectory from './UserDirectory';
import SignOutModal from '@/frontend/components/ui/SignOutModal';
import DieselAnalyticsDashboard from '@/frontend/components/diesel/DieselAnalyticsDashboard';
import DieselStaffDashboard from '@/frontend/components/diesel/DieselStaffDashboard';
import ElectricityStaffDashboard from '@/frontend/components/electricity/ElectricityStaffDashboard';
import ElectricityAnalyticsDashboard from '@/frontend/components/electricity/ElectricityAnalyticsDashboard';
import NotificationBell from './NotificationBell';
import Image from 'next/image';
import Skeleton from '@/frontend/components/ui/Skeleton';
import VendorExportModal from '@/frontend/components/vendor/VendorExportModal';
import VMSAdminDashboard from '@/frontend/components/vms/VMSAdminDashboard';
import TenantTicketingDashboard from '@/frontend/components/tickets/TenantTicketingDashboard';
import TicketCreateModal from '@/frontend/components/tickets/TicketCreateModal';
import TicketsView from './TicketsView';
import { useTheme } from '@/frontend/context/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import SettingsView from './SettingsView';
import AddMemberModal from './InviteMemberModal';
import { ImportReportsView } from '@/frontend/components/snags';
import AdminRoomManager from '@/frontend/components/meeting-rooms/AdminRoomManager';
import StockDashboard from '@/frontend/components/stock/StockDashboard';
import StockMovementModal from '@/frontend/components/stock/StockMovementModal';
import SOPDashboard from '@/frontend/components/sop/SOPDashboard';
import EscalationHierarchyBuilder from '@/frontend/components/escalation/EscalationHierarchyBuilder';
import PPMModule from '@/frontend/components/ppm/PPMModule';
import UniversalQRScannerModal, { QRScanResult } from '@/frontend/components/shared/UniversalQRScannerModal';

// Types
type Tab = 'overview' | 'requests' | 'reports' | 'users' | 'visitors' | 'rooms' | 'diesel' | 'diesel_analytics' | 'electricity' | 'electricity_analytics' | 'cafeteria' | 'settings' | 'profile' | 'units' | 'vendor_revenue' | 'stock' | 'checklist' | 'escalation' | 'ppm';

interface Property {
    id: string;
    name: string;
    code: string;
    address: string;
    organization_id: string;
    image_url?: string;
}

interface TicketData {
    id: string;
    title: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    created_at: string;
}

const PropertyAdminDashboard = () => {
    const { user, signOut, membership } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const params = useParams();
    const router = useRouter();
    const orgSlug = params?.orgId as string;
    const propertyId = params?.propertyId as string;

    // State
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const supabase = useMemo(() => createClient(), []);
    const { getCachedData, setCachedData } = useDataCache();
    const cacheKey = `property-${propertyId}`;
    const searchParams = useSearchParams();

    // State initialized from cache if available
    const [property, setProperty] = useState<Property | null>(() => getCachedData(cacheKey));
    const [tickets, setTickets] = useState<TicketData[]>([]);
    const [isLoading, setIsLoading] = useState(!property);
    const [errorMsg, setErrorMsg] = useState('');
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const [showCreateTicketModal, setShowCreateTicketModal] = useState(false);
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);
    const [statsVersion, setStatsVersion] = useState(0);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [showUniversalScanner, setShowUniversalScanner] = useState(false);
    const [preSelectedStockItemId, setPreSelectedStockItemId] = useState<string | undefined>();
    const [pendingStatusFilter, setPendingStatusFilter] = useState('all');

    // Property switcher — derive directly from AuthContext membership (already fetched + cached)
    const assignedProperties = useMemo(() =>
        (membership?.properties || [])
            .filter(p => !['tenant', 'super_tenant'].includes((p.role || '').toLowerCase()))
            .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i),
        [membership]
    );
    const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);
    const propertyDropdownRef = useRef<HTMLDivElement>(null);

    // Ref to prevent duplicate fetches
    const hasFetchedProperty = useRef(false);

    useEffect(() => {
        if (propertyId && !hasFetchedProperty.current) {
            hasFetchedProperty.current = true;
            fetchPropertyDetails(true);
        }
    }, [propertyId]);

    // Close property dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (propertyDropdownRef.current && !propertyDropdownRef.current.contains(e.target as Node)) {
                setShowPropertyDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Restore tab from URL
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['overview', 'requests', 'reports', 'users', 'visitors', 'diesel', 'diesel_analytics', 'electricity', 'electricity_analytics', 'cafeteria', 'settings', 'profile', 'units', 'vendor_revenue', 'stock', 'checklist'].includes(tab)) {
            setActiveTab(tab as Tab);
        }
        const filter = searchParams.get('filter');
        if (filter) {
            setPendingStatusFilter(filter);
        } else {
            setPendingStatusFilter('all');
        }
    }, [searchParams]);

    // Helper to change tab with URL persistence
    const handleTabChange = (tab: Tab, filter: string = 'all') => {
        setActiveTab(tab);
        setPendingStatusFilter(filter);
        setSidebarOpen(false);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        if (filter !== 'all') {
            url.searchParams.set('filter', filter);
        } else {
            url.searchParams.delete('filter');
        }
        window.history.pushState({}, '', url.toString());
    };

    const fetchPropertyDetails = async (isInitial = false) => {
        const cached = getCachedData(cacheKey);

        // If we have cached data, use it and only fetch if explicitly needed
        if (cached) {
            setProperty(cached);
            if (isInitial) {
                setIsLoading(false);
                return;
            }
        }

        if (!property) setIsLoading(true);
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
                setCachedData(cacheKey, data);
            }
        } catch (err) {
            setErrorMsg('Network error. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    // Loading timeout logic
    useEffect(() => {
        let timeout: NodeJS.Timeout;
        if (isLoading && !property) {
            timeout = setTimeout(() => {
                setErrorMsg('Loading is taking longer than usual... Please check your connection or try again.');
            }, 10000);
        }
        return () => clearTimeout(timeout);
    }, [isLoading, property]);


    if (isLoading && !property) return (
        <div className="min-h-screen bg-white flex">
            <aside className="w-72 border-r border-border p-6 space-y-6 hidden lg:block">
                <Skeleton className="w-full h-12" />
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="w-full h-10" />)}
                </div>
            </aside>
            <main className="flex-1 p-8 space-y-8">
                <header className="flex justify-between">
                    <Skeleton className="w-64 h-12" />
                    <Skeleton className="w-32 h-12" />
                </header>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Skeleton className="w-full h-32" />
                    <Skeleton className="w-full h-32" />
                    <Skeleton className="w-full h-32" />
                </div>
                <Skeleton className="w-full h-96" />
            </main>
        </div>
    );

    if (!property && !isLoading) return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-10 text-center">
            <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center mb-4">
                <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-black text-slate-900">Unable to Load Dashboard</h2>
            <p className="text-slate-500 mt-2 max-w-sm">{errorMsg || 'We couldn\'t find the property details you\'re looking for.'}</p>
            <div className="flex gap-4 mt-8">
                <button onClick={() => router.back()} className="px-6 py-2.5 bg-slate-100 text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition-all">Go Back</button>
                <button onClick={() => fetchPropertyDetails()} className="px-6 py-2.5 bg-primary text-white font-bold rounded-xl hover:opacity-90 transition-all">Try Again</button>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-white flex font-inter text-text-primary">
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
                w-72 bg-white border-r border-slate-300 flex flex-col inset-y-0 z-50 transition-all duration-300
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
                <div className="p-4 lg:p-5 pb-2">
                    <div className="flex flex-col items-center gap-1 mb-3">
                        <img src="/autopilot-logo-new.png" alt="Autopilot Logo" className="h-10 w-auto object-contain" />
                        <p className="text-[10px] text-text-tertiary font-black uppercase tracking-[0.2em]">Property Manager</p>
                    </div>

                </div>

                <nav className="flex-1 px-4 overflow-y-auto min-h-0 custom-scrollbar">
                    {/* Quick Actions - Compact Version */}
                    <div className="mb-6">
                        {/* Quick Actions - Simplified Dark Version */}
                        <div className="mb-8">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-6 mb-4 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
                                Quick Actions
                            </p>
                            <div className="px-4 grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setShowCreateTicketModal(true)}
                                    className="flex flex-col items-center justify-center gap-1.5 p-2.5 bg-white text-text-primary rounded-xl hover:bg-muted transition-all border-2 border-primary/20 group shadow-sm"
                                >
                                    <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                        <Plus className="w-5 h-5 font-black" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-center mt-1">New Request</span>
                                </button>
                                <button
                                    onClick={() => setShowUniversalScanner(true)}
                                    className="flex flex-col items-center justify-center gap-1.5 p-2.5 bg-white text-text-primary rounded-xl hover:bg-muted transition-all border-2 border-primary/20 group shadow-sm"
                                >
                                    <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                        <Scan className="w-5 h-5 font-black" />
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-center mt-1">Scanner</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Core Operations */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                            <span className="w-0.5 h-3 bg-primary rounded-full"></span>
                            Core Operations
                        </p>
                        <div className="space-y-1">
                            <button
                                onClick={() => handleTabChange('overview')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'overview'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <LayoutDashboard className="w-4 h-4" />
                                Dashboard
                            </button>
                            <button
                                onClick={() => handleTabChange('requests')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'requests'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Ticket className="w-4 h-4" />
                                Requests
                            </button>
                            <button
                                onClick={() => handleTabChange('reports')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'reports'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <FileBarChart className="w-4 h-4" />
                                Reports
                            </button>
                        </div>
                    </div>

                    {/* Management Hub */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                            <span className="w-0.5 h-3 bg-primary rounded-full"></span>
                            Management Hub
                        </p>
                        <div className="space-y-1">

                            <button
                                onClick={() => handleTabChange('users')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'users'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Users className="w-4 h-4" />
                                User Management
                            </button>
                            <button
                                onClick={() => handleTabChange('visitors')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'visitors'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <UsersRound className="w-4 h-4" />
                                Visitor Management
                            </button>
                            <button
                                onClick={() => handleTabChange('rooms')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'rooms'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Calendar className="w-4 h-4" />
                                Meeting Rooms
                            </button>
                            <button
                                onClick={() => handleTabChange('diesel')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'diesel'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Fuel className="w-4 h-4" />
                                Diesel Logger
                            </button>
                            <button
                                onClick={() => handleTabChange('diesel_analytics')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'diesel_analytics'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Fuel className="w-4 h-4" />
                                Diesel Analytics
                            </button>
                            <button
                                onClick={() => handleTabChange('electricity')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'electricity'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Zap className="w-4 h-4" />
                                Electricity Logger
                            </button>
                            <button
                                onClick={() => handleTabChange('electricity_analytics')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'electricity_analytics'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Zap className="w-4 h-4" />
                                Electricity Analytics
                            </button>
                            <button
                                onClick={() => handleTabChange('stock')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'stock'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Package className="w-4 h-4" />
                                Stock Management
                            </button>
                            <button
                                onClick={() => handleTabChange('checklist')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'checklist'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <ClipboardCheck className="w-4 h-4" />
                                Checklists
                            </button>
                            <button
                                onClick={() => handleTabChange('ppm')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'ppm'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <CalendarDays className="w-4 h-4" />
                                PPM Calendar
                            </button>
                            <button
                                onClick={() => handleTabChange('escalation')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'escalation'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <GitBranch className="w-4 h-4" />
                                Escalation
                            </button>
                            <button
                                onClick={() => handleTabChange('vendor_revenue')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'vendor_revenue'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Coffee className="w-4 h-4" />
                                Cafeteria Revenue
                            </button>
                        </div>
                    </div>

                    {/* System & Personal */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                            <span className="w-0.5 h-3 bg-primary rounded-full"></span>
                            System & Personal
                        </p>
                        <div className="space-y-1">
                            <button
                                onClick={() => handleTabChange('settings')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'settings'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Settings className="w-4 h-4" />
                                Settings
                            </button>
                            <button
                                onClick={() => handleTabChange('profile')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'profile'
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

                <div className="px-4 pt-3 pb-12 border-t border-border mt-auto flex-shrink-0 bg-white">
                    <button
                        onClick={() => setShowSignOutModal(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-text-secondary hover:bg-red-50 hover:text-red-600 transition-all font-bold text-xs"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            <SignOutModal
                isOpen={showSignOutModal}
                onClose={() => setShowSignOutModal(false)}
                onConfirm={signOut}
            />

            {
                property && (
                    <TicketCreateModal
                        isOpen={showCreateTicketModal}
                        onClose={() => setShowCreateTicketModal(false)}
                        propertyId={property.id}
                        organizationId={property.organization_id}
                        showInternalToggle={true}
                        onSuccess={() => {
                            setStatsVersion(v => v + 1);
                        }}
                    />
                )
            }

            {/* Main Content */}
            <main className="flex-1 min-w-0 overflow-x-hidden lg:ml-72 flex flex-col bg-white border-l border-slate-300 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.05)] relative z-10">
                {activeTab !== 'overview' && (
                    <header className="h-14 flex justify-between items-center px-3 md:px-8 lg:px-12 mb-2 md:mb-4 border-b border-border/10">
                        <div className="flex items-center gap-3">
                            {/* Mobile Menu Toggle */}
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="w-9 h-9 flex items-center justify-center lg:hidden text-text-tertiary hover:text-text-primary transition-colors rounded-lg hover:bg-slate-100"
                            >
                                <Menu className="w-5 h-5" />
                            </button>
                            {activeTab !== 'checklist' && (
                                <div className="hidden md:block">
                                    <h1 className="text-2xl md:text-3xl font-black text-text-primary tracking-tight capitalize">{activeTab.replace(/_/g, ' ')}</h1>
                                    <p className="text-text-tertiary text-xs md:text-sm font-medium mt-0.5">{property?.address || 'Property Management Hub'}</p>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2 md:gap-3">
                            {/* Property Indicator / Switcher — always visible, dropdown when 2+ properties */}
                            <div className="relative" ref={propertyDropdownRef}>
                                <button
                                    onClick={() => assignedProperties.length > 1 && setShowPropertyDropdown(v => !v)}
                                    className={`flex items-center gap-1.5 px-2.5 py-2 bg-slate-100 border border-slate-200 rounded-xl transition-colors text-xs font-bold text-slate-800 h-9 ${assignedProperties.length > 1 ? 'hover:bg-slate-200 cursor-pointer active:bg-slate-300' : 'cursor-default'}`}
                                >
                                    <Building2 className="w-4 h-4 text-primary flex-shrink-0" />
                                    <span className="max-w-[80px] sm:max-w-[120px] md:max-w-[160px] truncate">{property?.name || 'Property'}</span>
                                    {assignedProperties.length > 1 && (
                                        <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${showPropertyDropdown ? 'rotate-180' : ''}`} />
                                    )}
                                </button>
                                <AnimatePresence>
                                    {showPropertyDropdown && assignedProperties.length > 1 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-[300] overflow-hidden w-[220px] max-w-[calc(100vw-1rem)]"
                                        >
                                            {assignedProperties.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => {
                                                        setShowPropertyDropdown(false);
                                                        if (p.id !== propertyId) {
                                                            router.push(window.location.pathname.replace(propertyId, p.id));
                                                        }
                                                    }}
                                                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                                                            <Building2 className="w-4 h-4 text-slate-400" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-bold text-slate-800 truncate">{p.name}</div>
                                                            <div className="text-[11px] text-slate-400 font-medium">{p.code}</div>
                                                        </div>
                                                    </div>
                                                    {p.id === propertyId && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Notification Bell */}
                            <NotificationBell />

                            {/* User Account Info */}
                            <button
                                onClick={() => handleTabChange('profile')}
                                className="flex items-center gap-2 group transition-all"
                            >
                                <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-text-inverse font-bold text-sm group-hover:scale-105 transition-transform shadow-sm shadow-primary/20 flex-shrink-0">
                                    {user?.email?.[0].toUpperCase() || 'P'}
                                </div>
                                <div className="text-left hidden md:block">
                                    <h4 className="text-[13px] font-black text-text-primary leading-none mb-0.5 group-hover:text-primary transition-colors">
                                        {user?.user_metadata?.full_name || 'Property Admin'}
                                    </h4>
                                    <p className="text-[10px] text-text-tertiary font-black uppercase tracking-[0.15em]">
                                        View Profile
                                    </p>
                                </div>
                            </button>

                            <div className="hidden lg:flex flex-col items-end border-l border-border pl-4 h-8 justify-center">
                                <span className="text-[11px] font-black text-text-tertiary uppercase tracking-widest leading-none mb-1">Access Level</span>
                                <span className="text-xs text-primary font-black uppercase tracking-widest leading-none">Property admin</span>
                            </div>
                        </div>
                    </header>
                )}

                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        className={['overview', 'checklist'].includes(activeTab) ? '' : 'px-0 md:px-8 lg:px-12 pt-0 md:pt-4 pb-8'}

                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {activeTab === 'overview' && <OverviewTab
                            propertyId={propertyId}
                            statsVersion={statsVersion}
                            property={property}
                            onMenuToggle={() => setSidebarOpen(true)}
                            onRefresh={() => setStatsVersion(v => v + 1)}
                            onTabChange={handleTabChange}
                            assignedProperties={assignedProperties}
                            onPropertySwitch={(id) => router.push(window.location.pathname.replace(propertyId, id))}
                        />}
                        {activeTab === 'users' && <UserDirectory
                            propertyId={propertyId}
                            orgId={property?.organization_id}
                            orgName={orgSlug}
                            properties={property ? [property] : []}
                            onUserUpdated={Object.assign(() => setStatsVersion((v: number) => v + 1), {
                                __triggerModal: () => setShowAddMemberModal(true)
                            })}
                        />}
                        {activeTab === 'vendor_revenue' && <VendorRevenueTab propertyId={propertyId} />}
                        {activeTab === 'requests' && property && (
                            <TicketsView
                                key={`tickets-${statsVersion}`}
                                propertyId={property.id}
                                initialStatusFilter={pendingStatusFilter}
                                canDelete={true}
                                onNewRequest={() => setShowCreateTicketModal(true)}
                            />
                        )}
                        {activeTab === 'reports' && property && (
                            <ImportReportsView
                                propertyId={property.id}
                                organizationId={property.organization_id}
                            />
                        )}
                        {activeTab === 'visitors' && property && (
                            <VMSAdminDashboard propertyId={property.id} />
                        )}
                        {activeTab === 'rooms' && property && (
                            <AdminRoomManager propertyId={property.id} user={user} />
                        )}
                        {activeTab === 'units' && (
                            <div className="p-12 text-center text-slate-400 font-bold italic bg-white rounded-3xl border border-slate-100 shadow-sm">
                                <Building2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-slate-900 mb-2 font-inter not-italic">Unit Management</h3>
                                <p className="text-slate-500 font-inter not-italic font-medium">Unit inventory management loading...</p>
                            </div>
                        )}
                        {activeTab === 'diesel' && property && <DieselStaffDashboard propertyId={property.id} />}
                        {activeTab === 'diesel_analytics' && <DieselAnalyticsDashboard />}
                        {activeTab === 'electricity' && property && <ElectricityStaffDashboard propertyId={property.id} />}
                        {activeTab === 'electricity_analytics' && property && <ElectricityAnalyticsDashboard propertyId={property.id} />}
                        {activeTab === 'stock' && property && <StockDashboard propertyId={property.id} initialItemId={searchParams.get('scanItem') ?? undefined} />}
                        {activeTab === 'checklist' && property && <SOPDashboard propertyId={property.id} />}
                        {activeTab === 'ppm' && property && (
                            <PPMModule
                                organizationId={property.organization_id}
                                propertyId={property.id}
                            />
                        )}
                        {activeTab === 'escalation' && property && (
                            <EscalationHierarchyBuilder
                                organizationId={property.organization_id}
                                propertyId={property.id}
                            />
                        )}
                        {activeTab === 'settings' && <SettingsView />}
                        {activeTab === 'profile' && (
                            <div className="flex justify-center items-start py-8">
                                <div className="bg-white border border-slate-100 rounded-3xl shadow-lg w-full max-w-md overflow-hidden">
                                    {/* Card Header with Autopilot Logo */}
                                    <div className="bg-primary/5 p-8 flex flex-col items-center border-b border-border">
                                        {/* Autopilot Logo */}
                                        <div className="flex items-center justify-center mb-6">
                                            <img
                                                src="/autopilot-logo-new.png"
                                                alt="Autopilot Logo"
                                                className="h-10 w-auto object-contain"
                                            />
                                        </div>

                                        {/* User Avatar */}
                                        <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center border-4 border-white mb-4 overflow-hidden">
                                            {user?.user_metadata?.user_photo_url || user?.user_metadata?.avatar_url ? (
                                                <Image
                                                    src={user.user_metadata.user_photo_url || user.user_metadata.avatar_url}
                                                    alt="Profile"
                                                    width={96}
                                                    height={96}
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <span className="text-4xl font-black text-primary">
                                                    {user?.user_metadata?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                                                </span>
                                            )}
                                        </div>

                                        {/* Role Badge */}
                                        <span className="px-4 py-1.5 bg-blue-500 text-white rounded-full text-xs font-black uppercase tracking-wider">
                                            Property Admin
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
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</span>
                                                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold capitalize">
                                                    Property Admin
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

            <AddMemberModal
                isOpen={showAddMemberModal}
                onClose={() => setShowAddMemberModal(false)}
                orgId={property?.organization_id || ''}
                orgName={orgSlug || 'Organization'}
                properties={property ? [property] : []}
                fixedPropertyId={propertyId}
                onSuccess={() => setStatsVersion(v => v + 1)}
            />

            <StockMovementModal
                isOpen={showScannerModal}
                onClose={() => { setShowScannerModal(false); setPreSelectedStockItemId(undefined); }}
                propertyId={propertyId}
                preSelectedItemId={preSelectedStockItemId}
                autoOpenScanner={!preSelectedStockItemId}
                onSuccess={() => setStatsVersion(v => v + 1)}
            />

            {showUniversalScanner && (
                <UniversalQRScannerModal
                    title="Scanner"
                    onClose={() => setShowUniversalScanner(false)}
                    onResult={(result: QRScanResult) => {
                        setShowUniversalScanner(false);
                        if (result.type === 'checklist') {
                            router.push(`/checklist/${result.templateId}`);
                        } else if (result.type === 'stock') {
                            router.push(`/property/${propertyId}/dashboard?tab=stock&scanItem=${result.itemId}`);
                        } else if (result.type === 'barcode') {
                            router.push(`/property/${propertyId}/dashboard?tab=stock&scanItem=${result.value}`);
                        }
                    }}
                />
            )}
        </div>
    );
};

// Diesel Sphere Visualization (copied from OrgAdminDashboard for consistency)
const DieselSphere = ({ percentage }: { percentage: number }) => {
    return (
        <div className="relative w-full aspect-square max-w-[200px] mx-auto group">
            <div className="absolute inset-0 rounded-full border-4 border-white/20 bg-slate-900/10 backdrop-blur-[2px] shadow-2xl overflow-hidden group-hover:scale-105 transition-transform duration-700">
                <div className="absolute inset-0 rounded-full shadow-[inset_0_10px_40px_rgba(0,0,0,0.5)] z-20" />
                <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${percentage}%` }}
                    transition={{ duration: 2, ease: "circOut" }}
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-amber-600 via-amber-500 to-amber-400"
                >
                    <motion.div
                        animate={{ x: [0, -100] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                        className="absolute top-0 left-0 w-[400%] h-8 bg-amber-400/50 -translate-y-1/2 opacity-60"
                        style={{ borderRadius: '38% 42% 35% 45%' }}
                    />
                    <motion.div
                        animate={{ x: [-100, 0] }}
                        transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                        className="absolute top-1 left-0 w-[400%] h-8 bg-amber-400/30 -translate-y-1/2 opacity-40"
                        style={{ borderRadius: '45% 35% 42% 38%' }}
                    />
                    {[...Array(5)].map((_, i) => (
                        <motion.div
                            key={i}
                            animate={{ y: [0, -40], opacity: [0, 0.6, 0], x: [0, (i % 2 === 0 ? 10 : -10)] }}
                            transition={{ duration: 2 + i, repeat: Infinity, delay: i * 0.5 }}
                            className="absolute bottom-0 rounded-full bg-white/30 backdrop-blur-sm"
                            style={{ width: 4 + (i * 2), height: 4 + (i * 2), left: `${20 + (i * 15)}%` }}
                        />
                    ))}
                </motion.div>
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/5 to-white/20 z-30 pointer-events-none" />
                <div className="absolute top-[10%] left-[15%] w-[25%] h-[15%] bg-white/20 rounded-full blur-[4px] rotate-[-25deg] z-30 pointer-events-none" />
                <div className="absolute bottom-[15%] right-[15%] w-[10%] h-[10%] bg-amber-500/20 rounded-full blur-[2px] z-30 pointer-events-none" />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center z-40 pointer-events-none">
                <motion.span initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} className="text-4xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
                    {Math.round(percentage)}<span className="text-sm ml-0.5 opacity-80">%</span>
                </motion.span>
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest drop-shadow-md">Consumption</span>
            </div>
            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 w-[60%] h-4 bg-amber-500/20 blur-xl rounded-full transition-opacity duration-300 ${percentage > 0 ? 'opacity-100' : 'opacity-0'}`} />
        </div>
    );
};

const OverviewTab = memo(function OverviewTab({
    propertyId,
    statsVersion,
    property,
    onMenuToggle,
    onRefresh,
    onTabChange,
    assignedProperties = [],
    onPropertySwitch,
}: {
    propertyId: string,
    statsVersion: number,
    property: { name: string; code: string; address?: string; image_url?: string } | null,
    onMenuToggle?: () => void,
    onRefresh: () => void,
    onTabChange: (tab: Tab, filter?: string) => void,
    assignedProperties?: { id: string; name: string; code: string }[],
    onPropertySwitch?: (id: string) => void,
}) {
    const { getCachedData, setCachedData } = useDataCache();
    const [timePeriod, setTimePeriod] = useState<'today' | 'month' | 'all'>('all');
    // v2 prefix busts any pre-API-migration cached data that had 0/0 for visitors
    const fetchKey = `v2-${propertyId}-${statsVersion}-${timePeriod}`;
    const initialCached = useMemo(() => getCachedData(fetchKey), [fetchKey, getCachedData]);
    const supabase = useMemo(() => createClient(), []);
    const hasFetched = useRef(false);
    const lastFetchKey = useRef('');
    const [showOverviewPropDropdown, setShowOverviewPropDropdown] = useState(false);
    const overviewPropDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (overviewPropDropdownRef.current && !overviewPropDropdownRef.current.contains(e.target as Node)) {
                setShowOverviewPropDropdown(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Stats State initialized from cache if available
    const [ticketStats, setTicketStats] = useState(initialCached?.ticketStats || { total: 0, open: 0, waitlist: 0, in_progress: 0, resolved: 0, sla_breached: 0, avg_resolution_hours: 0, pending_validation: 0, urgent_open: 0 });
    const [validationEnabled, setValidationEnabled] = useState<boolean>(initialCached?.validationEnabled ?? false);
    const [electricityStats, setElectricityStats] = useState(initialCached?.electricityStats || { total_units_month: 0, total_units_today: 0 });
    const [vmsStats, setVmsStats] = useState(initialCached?.vmsStats || { total_visitors_today: 0, checked_in: 0, checked_out: 0 });
    const [vendorStats, setVendorStats] = useState(initialCached?.vendorStats || { total_revenue: 0, total_commission: 0, total_vendors: 0 });
    const [recentTickets, setRecentTickets] = useState<any[]>(initialCached?.recentTickets || []);
    const [isLoading, setIsLoading] = useState(!initialCached);

    useEffect(() => {
        // v2 prefix busts any pre-API-migration cached data that had 0/0 for visitors
        const fetchKey = `v2-${propertyId}-${statsVersion}-${timePeriod}`;

        // Prevent duplicate fetches for the same key
        if (lastFetchKey.current === fetchKey && hasFetched.current) {
            return;
        }

        const fetchPropertyData = async (isInitial = false) => {
            // Check if we already have fresh cached data
            const cached = getCachedData(fetchKey);
            if (isInitial && cached) {
                // If the data is less than 2 minutes old, skip re-fetching
                if (Date.now() - (cached.timestamp || 0) < 2 * 60 * 1000) {
                    setTicketStats(cached.ticketStats);
                    setRecentTickets(cached.recentTickets);
                    setElectricityStats(cached.electricityStats);
                    setVmsStats(cached.vmsStats);
                    setVendorStats(cached.vendorStats);
                    setIsLoading(false);
                    hasFetched.current = true;
                    lastFetchKey.current = fetchKey;
                    return;
                }
            }

            setIsLoading(true);
            lastFetchKey.current = fetchKey;
            hasFetched.current = true;

            try {
                // --- Tickets (all in parallel) ---
                const todayForTickets = new Date().toISOString().split('T')[0];
                const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

                let openQuery = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).in('status', ['open', 'waitlist', 'blocked', 'client_raised']);
                let waitlistQuery = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).in('status', ['waitlist']);
                let inProgressQuery = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).in('status', ['assigned', 'in_progress', 'paused', 'work_started']);
                let resolvedQuery = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).in('status', ['resolved', 'closed', 'satisfied', 'pending_validation']);
                let totalQuery = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', propertyId);
                let pendingValQuery = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).eq('status', 'pending_validation');
                let urgentOpenQuery = supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', propertyId).in('priority', ['urgent', 'high', 'critical']).not('status', 'in', '("resolved","closed","satisfied")');

                if (timePeriod === 'today') {
                    openQuery = openQuery.gte('created_at', todayForTickets);
                    waitlistQuery = waitlistQuery.gte('created_at', todayForTickets);
                    inProgressQuery = inProgressQuery.gte('created_at', todayForTickets);
                    resolvedQuery = resolvedQuery.gte('created_at', todayForTickets);
                    totalQuery = totalQuery.gte('created_at', todayForTickets);
                    pendingValQuery = pendingValQuery.gte('created_at', todayForTickets);
                    urgentOpenQuery = urgentOpenQuery.gte('created_at', todayForTickets);
                } else if (timePeriod === 'month') {
                    openQuery = openQuery.gte('created_at', monthStart);
                    waitlistQuery = waitlistQuery.gte('created_at', monthStart);
                    inProgressQuery = inProgressQuery.gte('created_at', monthStart);
                    resolvedQuery = resolvedQuery.gte('created_at', monthStart);
                    totalQuery = totalQuery.gte('created_at', monthStart);
                    pendingValQuery = pendingValQuery.gte('created_at', monthStart);
                    urgentOpenQuery = urgentOpenQuery.gte('created_at', monthStart);
                }

                const [openRes, waitlistRes, inProgressRes, resolvedRes, totalRes, recentsRes, pendingValRes, urgentOpenRes, validationFeatureRes] = await Promise.all([
                    openQuery,
                    waitlistQuery,
                    inProgressQuery,
                    resolvedQuery,
                    totalQuery,
                    supabase.from('tickets').select('id, title, status, created_at').eq('property_id', propertyId).order('created_at', { ascending: false }).limit(5),
                    pendingValQuery,
                    urgentOpenQuery,
                    supabase.from('property_features').select('is_enabled').eq('property_id', propertyId).eq('feature_key', 'ticket_validation').maybeSingle(),
                ]);

                // --- Electricity, VMS, Vendors (all in parallel via APIs) ---
                const today = new Date().toISOString().split('T')[0];

                const apiPeriod = timePeriod; // 'today' | 'month' | 'all'

                const { data: { session } } = await supabase.auth.getSession();
                const headers: HeadersInit = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};

                const [electricityRes, vmsApiRes, vendorApiRes] = await Promise.all([
                    supabase.from('electricity_readings').select('computed_units, reading_date').eq('property_id', propertyId).gte('reading_date', monthStart),
                    fetch(`/api/properties/${propertyId}/vms-summary?period=${apiPeriod}`, { headers }),
                    fetch(`/api/properties/${propertyId}/vendor-summary?period=${apiPeriod}`, { headers }),
                ]);

                // Process electricity
                const monthUnits = electricityRes.data?.reduce((acc: number, r: any) => acc + (r.computed_units || 0), 0) || 0;
                const todayUnits = electricityRes.data?.filter((r: any) => r.reading_date === today).reduce((acc: number, r: any) => acc + (r.computed_units || 0), 0) || 0;

                // Process VMS from API
                let vmsData: any = null;
                if (vmsApiRes.ok) {
                    vmsData = await vmsApiRes.json();
                } else {
                    console.error('[Dashboard] VMS API failed:', vmsApiRes.status, await vmsApiRes.text());
                }
                const checkedInCount = vmsData?.checked_in ?? 0;
                const checkedOutCount = vmsData?.checked_out ?? 0;
                const totalVisitors = vmsData?.total_visitors ?? 0;

                // Process Vendors from API
                let vendorData: any = null;
                if (vendorApiRes.ok) {
                    vendorData = await vendorApiRes.json();
                } else {
                    console.error('[Dashboard] Vendor API failed:', vendorApiRes.status, await vendorApiRes.text());
                }
                const totalRev = vendorData?.total_revenue ?? 0;
                const totalComm = vendorData?.total_commission ?? 0;

                const isValidationEnabled = validationFeatureRes.data?.is_enabled ?? false;
                setValidationEnabled(isValidationEnabled);

                const result = {
                    ticketStats: {
                        total: totalRes.count || 0,
                        open: openRes.count || 0,
                        waitlist: waitlistRes.count || 0,
                        in_progress: inProgressRes.count || 0,
                        resolved: resolvedRes.count || 0,
                        sla_breached: 0,
                        avg_resolution_hours: 0,
                        pending_validation: pendingValRes.count || 0,
                        urgent_open: urgentOpenRes.count || 0,
                    },
                    validationEnabled: isValidationEnabled,
                    timePeriod: timePeriod,
                    recentTickets: recentsRes.data || [],
                    electricityStats: { total_units_month: Math.round(monthUnits), total_units_today: Math.round(todayUnits) },
                    vmsStats: { total_visitors_today: totalVisitors, checked_in: checkedInCount, checked_out: checkedOutCount },
                    vendorStats: { total_revenue: totalRev, total_commission: totalComm, total_vendors: vendorData?.total_vendors || 0 },
                    timestamp: Date.now()
                };

                setTicketStats(result.ticketStats);
                setRecentTickets(result.recentTickets);
                setElectricityStats(result.electricityStats);
                setVmsStats(result.vmsStats);
                setVendorStats(result.vendorStats);
                setCachedData(fetchKey, result);

            } catch (err) {
                console.error('Error fetching property overview data:', err);
            } finally {
                setIsLoading(false);
            }
        };

        if (propertyId) fetchPropertyData(true);
    }, [propertyId, statsVersion, timePeriod, supabase, getCachedData, setCachedData]);

    // resolved includes pending_validation (staff already closed their side)
    const completionRate = ticketStats.total > 0 ? Math.round((ticketStats.resolved / ticketStats.total) * 100 * 10) / 10 : 0;
    const trulyClosedCount = ticketStats.resolved - ticketStats.pending_validation;

    if (isLoading && ticketStats.total === 0) return (
        <div className="p-8 space-y-6">
            <div className="h-48 bg-slate-100 rounded-3xl animate-pulse p-8">
                <Skeleton className="w-1/3 h-8 mb-4" />
                <div className="grid grid-cols-3 gap-4">
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-3 space-y-4">
                    <Skeleton className="h-64" />
                    <Skeleton className="h-48" />
                </div>
                <div className="md:col-span-4">
                    <Skeleton className="h-[430px]" />
                </div>
                <div className="md:col-span-5 space-y-4">
                    <Skeleton className="h-64" />
                    <Skeleton className="h-48" />
                </div>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-background">
            {/* Header Section */}
            <div className="bg-[#708F96] px-2 lg:px-12 py-8 border-b border-white/10 shadow-lg">
                <div className="flex flex-wrap items-center justify-between gap-y-3 mb-5">
                    <div className="flex items-center gap-3">
                        {/* Mobile Menu Toggle */}
                        <button
                            onClick={onMenuToggle}
                            className="p-2 -ml-2 lg:hidden text-white/70 hover:text-white transition-colors"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <h1 className="text-xl md:text-3xl font-black text-white">Unified Dashboard</h1>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                        {/* Global Time Period Filter — always visible, smaller on mobile */}
                        <div className="flex items-center bg-white/15 backdrop-blur-sm rounded-full p-0.5 md:p-1 border border-white/20 shadow-inner">
                            {([
                                { value: 'today', label: 'TODAY' },
                                { value: 'month', label: 'THIS MONTH' },
                                { value: 'all', label: 'ALL TIME' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setTimePeriod(opt.value)}
                                    className={`px-2.5 md:px-4 py-1.5 text-[9px] md:text-[10px] font-black tracking-wider md:tracking-widest rounded-full transition-all whitespace-nowrap ${timePeriod === opt.value
                                        ? 'bg-yellow-400 text-slate-900 shadow-md'
                                        : 'text-white/80 hover:text-white'}`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>

                        {/* Property Indicator / Switcher — icon + name + chevron pill */}
                        {property && (
                            <div className="relative" ref={overviewPropDropdownRef}>
                                <button
                                    onClick={() => assignedProperties.length > 1 && setShowOverviewPropDropdown(v => !v)}
                                    className={`flex items-center gap-1.5 md:gap-2 pl-1 pr-2.5 md:pr-3 py-1 bg-white/20 border border-white/25 backdrop-blur-sm rounded-full transition-colors min-h-[40px] ${assignedProperties.length > 1 ? 'hover:bg-white/30 cursor-pointer active:bg-white/35' : 'cursor-default'}`}
                                >
                                    {/* Property icon circle */}
                                    <div className="w-8 h-8 rounded-full bg-white/30 border border-white/30 overflow-hidden flex items-center justify-center flex-shrink-0">
                                        {property.image_url ? (
                                            <img src={property.image_url} alt={property.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <Building2 className="w-4 h-4 text-white" />
                                        )}
                                    </div>
                                    <span className="text-white font-bold text-xs md:text-sm max-w-[70px] sm:max-w-[110px] md:max-w-[140px] truncate">{property.name}</span>
                                    {assignedProperties.length > 1 && (
                                        <ChevronDown className={`w-3.5 h-3.5 md:w-4 md:h-4 text-white/80 flex-shrink-0 transition-transform ${showOverviewPropDropdown ? 'rotate-180' : ''}`} />
                                    )}
                                </button>
                                <AnimatePresence>
                                    {showOverviewPropDropdown && assignedProperties.length > 1 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -4 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -4 }}
                                            transition={{ duration: 0.15 }}
                                            className="absolute top-full right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-[300] overflow-hidden w-[220px] max-w-[calc(100vw-1rem)]"
                                        >
                                            {assignedProperties.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => {
                                                        setShowOverviewPropDropdown(false);
                                                        if (p.id !== propertyId) onPropertySwitch?.(p.id);
                                                    }}
                                                    className="w-full flex items-center justify-between gap-3 px-4 py-3.5 hover:bg-slate-50 active:bg-slate-100 transition-colors text-left"
                                                >
                                                    <div className="flex items-center gap-2.5 min-w-0">
                                                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
                                                            <Building2 className="w-4 h-4 text-slate-400" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="text-sm font-bold text-slate-800 truncate">{p.name}</div>
                                                            <div className="text-[11px] text-slate-400 font-medium">{p.code}</div>
                                                        </div>
                                                    </div>
                                                    {p.id === propertyId && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                                                </button>
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 mb-5">
                    <span className="text-white text-sm font-bold">Dashboard / {property?.name || 'Property'}</span>
                </div>

                {/* KPI Cards Row */}
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5 ${validationEnabled ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>

                    {/* Card 1 — Total Tickets */}
                    <motion.div
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        onClick={() => onTabChange('requests', 'all')}
                        className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md cursor-pointer hover:border-slate-300 transition-all group relative overflow-hidden"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">
                                Total Tickets {timePeriod === 'today' ? '(Today)' : timePeriod === 'month' ? '(This Month)' : '(All Time)'}
                            </span>
                            <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center">
                                <Ticket className="w-3.5 h-3.5 text-slate-500" />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-4xl font-black text-slate-900">{ticketStats.total}</span>
                            <span className="text-xs text-slate-400 font-bold">{completionRate}% resolved</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(completionRate, 100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                            <span>{ticketStats.open + ticketStats.in_progress} active</span>
                            <span>{ticketStats.avg_resolution_hours > 0 ? `Avg ${ticketStats.avg_resolution_hours}h` : 'No data'}</span>
                        </div>
                    </motion.div>

                    {/* Card 2 — Open & Active */}
                    <motion.div
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        onClick={() => onTabChange('requests', 'open,assigned,in_progress,blocked')}
                        className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md cursor-pointer hover:border-blue-200 transition-all group relative overflow-hidden"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-blue-500 transition-colors">Open & Active</span>
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${ticketStats.sla_breached > 0 ? 'bg-rose-50' : 'bg-blue-50'}`}>
                                <AlertCircle className={`w-3.5 h-3.5 ${ticketStats.sla_breached > 0 ? 'text-rose-500' : 'text-blue-500'}`} />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-4xl font-black text-slate-900">{ticketStats.open + ticketStats.in_progress}</span>
                            {ticketStats.sla_breached > 0 && (
                                <span className="text-[10px] text-rose-500 font-black uppercase bg-rose-50 px-1.5 py-0.5 rounded-md">{ticketStats.sla_breached} SLA</span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                                {ticketStats.open - ticketStats.waitlist} Open
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                {ticketStats.waitlist} Waitlist
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                                {ticketStats.in_progress} In Progress
                            </span>
                            {ticketStats.urgent_open > 0 && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                                    {ticketStats.urgent_open} High/Urgent
                                </span>
                            )}
                        </div>
                    </motion.div>

                    {/* Card 3 — Resolved & Closed */}
                    <motion.div
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                        onClick={() => onTabChange('requests', 'resolved,closed')}
                        className="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm hover:shadow-md cursor-pointer hover:border-emerald-200 transition-all group relative overflow-hidden"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-emerald-500 transition-colors">Resolved & Closed</span>
                            <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-4xl font-black text-slate-900">{ticketStats.resolved}</span>
                            <span className="text-xs text-emerald-500 font-bold">{completionRate}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${Math.min(completionRate, 100)}%` }} />
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                            <span>
                                <span className="text-emerald-600">{trulyClosedCount} confirmed</span>
                                {ticketStats.pending_validation > 0 && <span className="text-amber-500"> · {ticketStats.pending_validation} awaiting</span>}
                            </span>
                            <span>{ticketStats.avg_resolution_hours > 0 ? `Avg ${ticketStats.avg_resolution_hours}h` : ''}</span>
                        </div>
                    </motion.div>

                    {/* Card 4 — Pending Validation (only if validation is enabled) */}
                    {validationEnabled && (
                        <motion.div
                            whileHover={{ y: -4, transition: { duration: 0.2 } }}
                            onClick={() => onTabChange('requests', 'pending_validation')}
                            className={`bg-white rounded-2xl p-4 border shadow-sm hover:shadow-md cursor-pointer transition-all group relative overflow-hidden ${ticketStats.pending_validation > 0 ? 'border-amber-200 hover:border-amber-300' : 'border-slate-100 hover:border-slate-200'}`}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-amber-500 transition-colors">Pending Validation</span>
                                <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${ticketStats.pending_validation > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                                    <Clock className={`w-3.5 h-3.5 ${ticketStats.pending_validation > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className={`text-4xl font-black ${ticketStats.pending_validation > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                                    {ticketStats.pending_validation}
                                </span>
                                {ticketStats.pending_validation === 0 ? (
                                    <span className="text-[10px] text-emerald-500 font-black">All clear ✓</span>
                                ) : (
                                    <span className="text-[10px] text-amber-500 font-black bg-amber-50 px-1.5 py-0.5 rounded-md">Needs action</span>
                                )}
                            </div>
                            <div className="text-[10px] font-bold text-slate-400 leading-relaxed">
                                {ticketStats.pending_validation > 0
                                    ? <span className="text-amber-600">Awaiting tenant sign-off</span>
                                    : <span className="text-emerald-600">All resolved tickets confirmed</span>
                                }
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>


            {/* Main Content Grid */}
            <div className="px-2 lg:px-12 py-5 space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left Column */}
                    <div className="lg:col-span-3 space-y-5">
                        <div
                            className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm hover:shadow-md hover:border-yellow-300/50 transition-all group relative overflow-hidden"
                        >
                            <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-sm font-black text-slate-900">Electricity</h3>
                            </div>
                            <div className="text-yellow-600 text-xs font-bold mb-4 flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full animate-pulse ${timePeriod === 'all' ? 'bg-slate-400' : timePeriod === 'today' ? 'bg-blue-400' : 'bg-yellow-500'}`} />
                                {timePeriod === 'today' ? 'Today' : timePeriod === 'month' ? 'This Month' : 'All Time'}
                            </div>
                            <div className="flex justify-center my-4" onClick={() => onTabChange('electricity_analytics' as any)}>
                                <div className="relative w-[140px] h-[140px] cursor-pointer">
                                    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                                        <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                                        <circle
                                            cx="60" cy="60" r="52" fill="none"
                                            stroke="url(#propElecGrad)" strokeWidth="10" strokeLinecap="round"
                                            strokeDasharray={`${Math.min(326, ((timePeriod === 'today' ? electricityStats.total_units_today : electricityStats.total_units_month) / (timePeriod === 'today' ? 100 : 1000)) * 326)} 326`}
                                        />
                                        <defs>
                                            <linearGradient id="propElecGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor="#facc15" />
                                                <stop offset="100%" stopColor="#f59e0b" />
                                            </linearGradient>
                                        </defs>
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <Zap className="w-5 h-5 text-yellow-500 mb-1" />
                                        <span className="text-xl font-black text-slate-900">
                                            {(timePeriod === 'today' ? electricityStats.total_units_today : electricityStats.total_units_month).toLocaleString()}
                                        </span>
                                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">kVAh</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-1" onClick={() => onTabChange('electricity_analytics' as any)}>
                                <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Units Consumed</div>
                                <div className="text-3xl font-black text-slate-900 flex items-baseline gap-1">
                                    {(timePeriod === 'today' ? electricityStats.total_units_today : electricityStats.total_units_month).toLocaleString()}
                                    <span className="text-sm text-slate-400 font-bold">kVAh</span>
                                </div>
                                <div className="pt-2 border-t border-slate-50 mt-2">
                                    <span className="text-[10px] font-bold text-yellow-600 uppercase group-hover:underline cursor-pointer">View Analytics →</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 mb-2">Vendor Revenue</h3>
                            <div className="text-slate-400 text-xs font-bold mb-2">{timePeriod === 'today' ? 'Today' : timePeriod === 'month' ? 'This Month' : 'All Time'}</div>
                            <div className="text-3xl font-black text-slate-900">₹ {vendorStats.total_revenue.toLocaleString()}</div>
                            <div className="text-xs text-slate-500 mt-2">Commission: ₹ {vendorStats.total_commission.toLocaleString()} from {vendorStats.total_vendors} vendors</div>
                        </div>
                    </div>

                    {/* Center Column - Property Card */}
                    <div className="lg:col-span-4">
                        <div className="bg-yellow-400 rounded-3xl p-5 h-full relative overflow-hidden">
                            <h3 className="text-2xl font-black text-slate-900 mb-2 truncate">{property?.name || 'Property'}</h3>
                            <div className="text-red-600 text-sm font-bold mb-5 truncate">Property: {property?.code || 'N/A'}</div>
                            <div className="bg-yellow-500/50 rounded-[2rem] h-56 mb-5 flex items-center justify-center overflow-hidden border-4 border-white/30 shadow-2xl group relative">
                                {property?.image_url ? (
                                    <>
                                        <Image
                                            src={property.image_url}
                                            alt={property.name}
                                            fill
                                            className="object-cover transition-transform duration-700 group-hover:scale-110"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-yellow-400/20 to-transparent" />
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-2"><Building2 className="w-20 h-20 text-yellow-600/30" /><span className="text-[10px] font-black text-yellow-700/40 uppercase tracking-widest">Awaiting Visuals</span></div>
                                )}
                            </div>
                            <div className="space-y-4">
                                <div><div className="text-slate-700 text-xs font-bold">Visitors {timePeriod === 'today' ? 'Today' : timePeriod === 'month' ? 'This Month' : 'All Time'}</div><div className="text-2xl font-black text-slate-900">{vmsStats.total_visitors_today}</div></div>
                                <div><div className="text-slate-700 text-xs font-bold">Checked In / Out</div><div className="text-2xl font-black text-slate-900">{vmsStats.checked_in} / {vmsStats.checked_out}</div></div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="lg:col-span-5 space-y-5">
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 mb-4">Recent Tickets</h3>
                            <div className="space-y-3 max-h-48 overflow-y-auto">
                                {recentTickets.map((t, idx) => (
                                    <div key={t.id || idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                        <div>
                                            <div className="font-bold text-slate-900 text-sm truncate max-w-[200px]">{t.title}</div>
                                            <div className="flex items-center gap-2">
                                                <div className="text-xs text-slate-500 capitalize">{t.status?.replace('_', ' ')}</div>
                                            </div>
                                        </div>
                                        <div className="text-right"><div className="text-xs text-slate-400">{new Date(t.created_at).toLocaleDateString()}</div></div>
                                    </div>
                                ))}
                                {recentTickets.length === 0 && <div className="text-center text-slate-400 py-4">No recent tickets.</div>}
                            </div>
                        </div>
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 mb-4">Module Summary</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-blue-50 rounded-xl"><div className="text-xs font-bold text-blue-600 mb-1">Tickets</div><div className="text-2xl font-black text-blue-900">{ticketStats.total}</div></div>
                                <div className="p-4 bg-emerald-50 rounded-xl"><div className="text-xs font-bold text-emerald-600 mb-1">Visitors</div><div className="text-2xl font-black text-emerald-900">{vmsStats.total_visitors_today}</div></div>
                                <div className="p-4 bg-yellow-50 rounded-xl"><div className="text-xs font-bold text-yellow-600 mb-1">Electricity ({timePeriod === 'today' ? 'Today' : timePeriod === 'month' ? 'Month' : 'All'})</div><div className="text-2xl font-black text-slate-900">{(timePeriod === 'today' ? electricityStats.total_units_today : electricityStats.total_units_month).toLocaleString()}</div></div>
                                <div className="p-4 bg-purple-50 rounded-xl"><div className="text-xs font-bold text-purple-600 mb-1">Vendors</div><div className="text-2xl font-black text-purple-900">{vendorStats.total_vendors}</div></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

        </div>
    );
});

// Helper to format time ago
const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'Just now';
};

const StatCard = ({ title, value, icon: Icon, color, bg }: any) => (
    <div className="bg-white p-6 rounded-3xl border border-border shadow-sm">
        {Icon && (
            <div className={`w-12 h-12 ${bg} ${color} rounded-2xl flex items-center justify-center mb-4`}>
                <Icon className="w-6 h-6" />
            </div>
        )}
        <h3 className="text-text-tertiary font-bold text-xs uppercase tracking-widest mb-1">{title}</h3>
        <p className="text-3xl font-black text-text-primary">{value}</p>
    </div>
);

const ActivityItem = ({ icon: Icon, color, title, desc, time, onClick }: any) => (
    <div
        className={`flex gap-4 p-2 rounded-xl transition-all ${onClick ? 'cursor-pointer hover:bg-muted' : ''}`}
        onClick={onClick}
    >
        <div className={`w-10 h-10 ${color} rounded-xl flex items-center justify-center shrink-0`}>
            <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
            <h4 className="text-sm font-bold text-text-primary">{title}</h4>
            <p className="text-xs text-text-secondary">{desc}</p>
        </div>
        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-tighter">{time}</span>
    </div>
);

const InspectionItem = ({ date, unit, status }: any) => (
    <div className="flex items-center justify-between p-4 bg-surface-elevated rounded-2xl border border-border">
        <div className="flex items-center gap-4">
            <div className="bg-white w-12 py-2 rounded-xl text-center border border-border">
                <span className="block text-[8px] font-black text-text-tertiary uppercase tracking-tighter">Jan</span>
                <span className="block font-black text-sm text-text-primary leading-none">{date.split(' ')[1]}</span>
            </div>
            <div>
                <p className="font-bold text-text-primary text-sm">{unit}</p>
                <p className="text-[10px] text-text-tertiary font-bold uppercase tracking-widest">{status}</p>
            </div>
        </div>
        <ChevronRight className="w-4 h-4 text-text-tertiary" />
    </div>
);

const VendorRevenueTab = memo(function VendorRevenueTab({ propertyId }: { propertyId: string }) {
    const [vendors, setVendors] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showExportModal, setShowExportModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const supabase = useMemo(() => createClient(), []);
    const hasFetched = useRef(false);

    useEffect(() => {
        if (!hasFetched.current) {
            hasFetched.current = true;
            fetchVendors();
        }
    }, [propertyId]);

    const fetchVendors = async () => {
        setIsLoading(true);
        try {
            // Fetch food vendors and their latest revenue entries
            const { data, error } = await supabase
                .from('vendors')
                .select(`
            *,
            vendor_daily_revenue (
            revenue_amount,
            revenue_date
            )
            `)
                .eq('property_id', propertyId);

            if (error) throw error;
            setVendors(data || []);
        } catch (err) {
            console.error('Error fetching vendors:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = async (options: any) => {
        setIsExporting(true);
        try {
            const params = new URLSearchParams({ format: options.format });

            if (options.period === 'today') {
                const today = new Date().toISOString().split('T')[0];
                params.append('startDate', today);
                params.append('endDate', today);
            } else if (options.period === 'month') {
                const monthStart = new Date();
                monthStart.setDate(1);
                params.append('startDate', monthStart.toISOString().split('T')[0]);
                params.append('endDate', new Date().toISOString().split('T')[0]);
            } else if (options.period === 'year') {
                const yearStart = new Date();
                yearStart.setMonth(0, 1);
                params.append('startDate', yearStart.toISOString().split('T')[0]);
                params.append('endDate', new Date().toISOString().split('T')[0]);
            } else if (options.startDate && options.endDate) {
                params.append('startDate', options.startDate);
                params.append('endDate', options.endDate);
            }

            const response = await fetch(`/api/properties/${propertyId}/vendor-export?${params}`);

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vendor_revenue_export.${options.format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setShowExportModal(false);
        } catch (err) {
            console.error('Export error:', err);
            alert('Export failed. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    // Calculate pending payments (vendors who haven't submitted today)
    const today = new Date().toISOString().split('T')[0];
    const pendingCount = vendors.filter(v =>
        !v.vendor_daily_revenue?.some((r: any) => r.revenue_date === today)
    ).length;

    const totalRevenue = vendors.reduce((acc, v) => {
        const entry = v.vendor_daily_revenue?.find((r: any) => r.revenue_date === today);
        return acc + (entry?.revenue_amount || 0);
    }, 0);

    const totalCommission = vendors.reduce((acc, v) => {
        const entry = v.vendor_daily_revenue?.find((r: any) => r.revenue_date === today);
        const rev = entry?.revenue_amount || 0;
        return acc + (rev * ((v.commission_rate || 0) / 100));
    }, 0);

    if (isLoading) return <div className="p-12 text-center text-slate-400 font-bold">Loading Revenue Data...</div>;

    return (
        <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                    title="Total Revenue (Today)"
                    value={`₹${totalRevenue.toLocaleString('en-IN')}`}
                    icon={IndianRupee}
                    color="text-blue-600"
                    bg="bg-blue-50"
                />
                <StatCard
                    title="Total Commission"
                    value={`₹${totalCommission.toLocaleString('en-IN')}`}
                    icon={Calendar}
                    color="text-emerald-600"
                    bg="bg-emerald-50"
                />
                <StatCard
                    title="Pending Entries"
                    value={pendingCount.toString()}
                    icon={Clock}
                    color="text-amber-600"
                    bg="bg-amber-50"
                />
                <StatCard
                    title="Active Vendors"
                    value={vendors.length.toString()}
                    icon={Store}
                    color="text-indigo-600"
                    bg="bg-indigo-50"
                />
            </div>

            <div className="bg-white border border-border rounded-3xl overflow-hidden shadow-sm">
                <div className="p-8 border-b border-border flex justify-between items-center bg-white">
                    <div>
                        <h3 className="text-xl font-bold text-text-primary">Cafeteria Performance</h3>
                        <p className="text-text-secondary text-xs font-medium mt-1">Real-time revenue tracking per vendor.</p>
                    </div>
                    <button
                        onClick={() => setShowExportModal(true)}
                        className="flex items-center gap-2 px-6 py-2.5 bg-primary text-text-inverse rounded-xl text-sm font-black hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                    >
                        <FileDown className="w-4 h-4" /> Export
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-surface-elevated border-b border-border">
                            <tr>
                                <th className="px-8 py-4 text-[10px] font-black text-text-tertiary uppercase tracking-widest">Vendor / Shop</th>
                                <th className="px-8 py-4 text-[10px] font-black text-text-tertiary uppercase tracking-widest text-center">Commission %</th>
                                <th className="px-8 py-4 text-[10px] font-black text-text-tertiary uppercase tracking-widest text-right">Today's Revenue</th>
                                <th className="px-8 py-4 text-[10px] font-black text-text-tertiary uppercase tracking-widest text-right">Commission Due</th>
                                <th className="px-8 py-4 text-[10px] font-black text-text-tertiary uppercase tracking-widest text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {vendors.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-12 text-center text-slate-400 italic">No vendors found for this property.</td>
                                </tr>
                            ) : (
                                vendors.map((vendor) => {
                                    const entry = vendor.vendor_daily_revenue?.find((r: any) => r.revenue_date === today);
                                    const todayRevenue = entry?.revenue_amount || 0;
                                    const commission = (todayRevenue * ((vendor.commission_rate || 0) / 100)).toFixed(2);

                                    return (
                                        <tr key={vendor.id} className="hover:bg-slate-50/50 transition-all">
                                            <td className="px-8 py-5">
                                                <div>
                                                    <p className="font-black text-slate-900 text-sm">{vendor.shop_name}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{vendor.owner_name}</p>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border border-blue-100">
                                                    {vendor.commission_rate}%
                                                </span>
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <p className={`font-black text-sm ${todayRevenue > 0 ? 'text-slate-900' : 'text-slate-300'}`}>
                                                    ₹{todayRevenue.toLocaleString('en-IN')}
                                                </p>
                                            </td>
                                            <td className="px-8 py-5 text-right text-emerald-600 font-black text-sm">
                                                ₹{Number(commission).toLocaleString('en-IN')}
                                            </td>
                                            <td className="px-8 py-5 text-center">
                                                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${todayRevenue > 0
                                                    ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                                    : 'bg-amber-50 text-amber-600 border-amber-100'
                                                    }`}>
                                                    {todayRevenue > 0 ? 'Paid' : 'Pending'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <VendorExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                onExport={handleExport}
                isExporting={isExporting}
            />
        </div>
    );
});

export default PropertyAdminDashboard;
