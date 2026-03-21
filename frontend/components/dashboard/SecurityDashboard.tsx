'use client';

import { useState, useEffect } from 'react';
import {
    LayoutDashboard, Ticket, Settings, LogOut, Plus,
    Clock, UsersRound, UserCircle, Shield, Fuel, LogIn, Menu, X, AlertCircle, ClipboardCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import { useAuth } from '@/frontend/context/AuthContext';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import SignOutModal from '@/frontend/components/ui/SignOutModal';
import Image from 'next/image';
import DieselStaffDashboard from '@/frontend/components/diesel/DieselStaffDashboard';
import VMSAdminDashboard from '@/frontend/components/vms/VMSAdminDashboard';
import VMSKiosk from '@/frontend/components/vms/VMSKiosk';
import TenantTicketingDashboard from '@/frontend/components/tickets/TenantTicketingDashboard';
import TicketsView from '@/frontend/components/dashboard/TicketsView';
import SettingsView from './SettingsView';
import SOPDashboard from '@/frontend/components/sop/SOPDashboard';

// Types
type Tab = 'overview' | 'requests' | 'checkinout' | 'visitors' | 'diesel' | 'checklist' | 'settings' | 'profile';

interface Property {
    id: string;
    name: string;
    code: string;
    address: string;
    organization_id: string;
}

const SecurityDashboard = () => {
    const { user, signOut } = useAuth();
    const params = useParams();
    const router = useRouter();
    const propertyId = params?.propertyId as string;

    // State
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [property, setProperty] = useState<Property | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const [userRole, setUserRole] = useState('Security Officer');
    const [kpiStats, setKpiStats] = useState({
        activeVisitors: 0,
        pendingClearances: 0, // Placeholder for now
        incidentsToday: 0,
        securityAlerts: 0
    });
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showCreateForm, setShowCreateForm] = useState(false);
    const searchParams = useSearchParams();

    const supabase = createClient();

    useEffect(() => {
        if (propertyId) {
            fetchPropertyDetails();
            fetchUserRole();
            fetchKPIStats();
        }
    }, [propertyId, user?.id]);

    // Restore tab from URL
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['overview', 'requests', 'checkinout', 'visitors', 'diesel', 'checklist', 'settings', 'profile'].includes(tab)) {
            setActiveTab(tab as Tab);
        }
    }, [searchParams]);

    // Helper to change tab with URL persistence
    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
        setSidebarOpen(false);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.pushState({}, '', url.toString());
    };

    const fetchKPIStats = async () => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // 1. Fetch Active Visitors (today + checked_in)
            const { count: activeCount } = await supabase
                .from('visitor_logs')
                .select('*', { count: 'exact', head: true })
                .eq('property_id', propertyId)
                .eq('status', 'checked_in')
                .gte('checkin_time', today.toISOString());

            // 2. Fetch Incidents Today (vms_tickets or tickets categorised as security)
            const { count: incidentCount } = await supabase
                .from('vms_tickets')
                .select('*', { count: 'exact', head: true })
                .eq('property_id', propertyId)
                .gte('created_at', today.toISOString());

            // 3. Fetch Security Alerts/Tickets from tickets table
            const { count: securityAlertsCount } = await supabase
                .from('tickets')
                .select('*', { count: 'exact', head: true })
                .eq('property_id', propertyId)
                .eq('category', 'security_incident') // Using specific category from issueDictionary
                .gte('created_at', today.toISOString());

            setKpiStats({
                activeVisitors: activeCount || 0,
                pendingClearances: 0, // Keep as 0 until clearance logic is implemented
                incidentsToday: incidentCount || 0,
                securityAlerts: securityAlertsCount || 0
            });
        } catch (err) {
            console.error('Error fetching KPI stats:', err);
        }
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
            setErrorMsg('Property not found.');
        } else {
            setProperty(data);
        }
        setIsLoading(false);
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

    if (isLoading) return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-muted border-t-foreground rounded-full animate-spin" />
                <p className="text-muted-foreground font-bold">Loading security dashboard...</p>
            </div>
        </div>
    );

    if (!property) return (
        <div className="p-10 text-center">
            <h2 className="text-xl font-bold text-red-600">Error Loading Dashboard</h2>
            <p className="text-muted-foreground mt-2">{errorMsg || 'Property not found.'}</p>
            <button onClick={() => router.back()} className="mt-4 text-foreground font-bold hover:underline">Go Back</button>
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
                <div className="p-5 lg:p-6 pb-1 flex-shrink-0">
                    <div className="flex flex-col items-center gap-1.5 mb-4">
                        <img src="/autopilot-logo-new.png" alt="Autopilot Logo" className="h-10 w-auto object-contain" />
                        <p className="text-[9px] text-text-tertiary font-black uppercase tracking-[0.2em]">Security Portal</p>
                    </div>
                </div>

                <nav className="flex-1 px-4 overflow-y-auto min-h-0 custom-scrollbar">
                    {/* Quick Actions */}
                    <div className="mb-4">
                        <p className="text-[9px] font-black text-text-tertiary uppercase tracking-widest px-4 mb-2 flex items-center gap-1.5">
                            <span className="w-0.5 h-2.5 bg-secondary rounded-full"></span>
                            Actions Guide
                        </p>
                        <div className="grid grid-cols-2 gap-2 px-3">
                            <button
                                onClick={() => handleTabChange('requests')}
                                className="flex items-center gap-2 p-2 bg-white text-text-primary rounded-lg hover:bg-muted transition-all border border-border group"
                                title="New Request"
                            >
                                <div className="w-6 h-6 bg-primary/20 rounded-md flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                                    <Plus className="w-3.5 h-3.5 font-black" />
                                </div>
                                <span className="text-[9px] font-bold uppercase tracking-tight">Report</span>
                            </button>
                            <button
                                onClick={() => handleTabChange('checkinout')}
                                className="flex items-center gap-2 p-2 bg-muted border border-border rounded-lg hover:bg-emerald-50 focus:bg-emerald-50 transition-all"
                                title="Check In/Out"
                            >
                                <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-[9px] font-bold text-text-secondary uppercase tracking-wider">Gate</span>
                            </button>
                            <button
                                onClick={() => alert('URGENT: Emergency SOS Signal Broadcasted to all Staff.')}
                                className="flex items-center gap-2 p-2 bg-rose-50 border border-border rounded-lg hover:bg-rose-100 transition-all font-black"
                                title="Emergency SOS"
                            >
                                <Shield className="w-3.5 h-3.5 text-rose-600" />
                                <span className="text-[9px] font-black text-rose-600 uppercase tracking-wider">SOS</span>
                            </button>
                            <button
                                onClick={() => handleTabChange('visitors')}
                                className="flex items-center gap-2 p-2 bg-muted border border-border rounded-lg hover:bg-indigo-50 transition-all"
                                title="View Visitors"
                            >
                                <UsersRound className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="text-[9px] font-black text-text-secondary uppercase tracking-wider">VMS</span>
                            </button>
                        </div>
                    </div>

                    {/* Core Operations */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-text-tertiary uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
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
                                onClick={() => handleTabChange('checkinout')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'checkinout'
                                    ? 'bg-secondary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <LogIn className="w-4 h-4" />
                                Check In / Out
                            </button>
                        </div>
                    </div>

                    {/* Management Hub */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                            <span className="w-0.5 h-3 bg-primary rounded-full"></span>
                            Management Hub
                        </p>
                        <div className="space-y-1">
                            <button
                                onClick={() => handleTabChange('visitors')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'visitors'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <UsersRound className="w-4 h-4" />
                                Visitor Registry
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
                                onClick={() => handleTabChange('checklist')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'checklist'
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
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-text-tertiary uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
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

                <div className="pt-3 border-t border-border px-4 pb-12 flex-shrink-0 bg-white">
                    {/* User Profile Section */}
                    <div className="flex items-center gap-2 px-1 mb-3">
                        <div className="w-8 h-8 bg-brand-orange/10 rounded-full flex items-center justify-center text-brand-orange font-bold text-xs shadow-lg shadow-orange-500/5">
                            {user?.email?.[0].toUpperCase() || 'S'}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="font-bold text-xs text-foreground truncate">
                                {user?.user_metadata?.full_name || 'Security Officer'}
                            </p>
                            <p className="text-[9px] text-muted-foreground truncate font-medium">
                                {user?.email}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <button
                            onClick={() => setShowSignOutModal(true)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-rose-500/10 hover:text-rose-600 transition-all font-bold text-[11px] uppercase tracking-wider"
                        >
                            <LogOut className="w-3.5 h-3.5" />
                            <span>Sign Out</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 lg:ml-72 flex flex-col bg-white border-l border-slate-300 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.05)] relative z-10">
                {/* Top Header */}
                <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-8 lg:px-12 sticky top-0 z-30">
                    <div className="flex items-center gap-4">
                        {/* Mobile Menu Toggle */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 -ml-2 lg:hidden text-text-tertiary hover:text-text-primary transition-colors"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="text-xl md:text-2xl font-black text-text-primary tracking-tight capitalize">{activeTab}</h1>
                            {activeTab === 'overview' && (
                                <p className="hidden sm:block text-text-tertiary text-[10px] font-black uppercase tracking-widest mt-0.5">
                                    Security Monitoring Hub
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-border rounded-lg">
                            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">System Live</span>
                        </div>
                    </div>
                </header>

                <div className="flex-1 p-2 sm:p-4 md:p-8 lg:p-12 pt-6">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                        >
                            {activeTab === 'overview' && <OverviewTab stats={kpiStats} />}
                            {activeTab === 'requests' && property && user && (
                                <>
                                    <TicketsView
                                        propertyId={property.id}
                                        onNewRequest={() => setShowCreateForm(true)}
                                    />
                                    {showCreateForm && (
                                        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                                            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative">
                                                <button
                                                    onClick={() => setShowCreateForm(false)}
                                                    className="absolute top-4 right-4 p-2 rounded-lg hover:bg-slate-100 transition-colors z-10"
                                                >
                                                    <X className="w-5 h-5 text-slate-500" />
                                                </button>
                                                <TenantTicketingDashboard
                                                    propertyId={property.id}
                                                    organizationId={property.organization_id || ''}
                                                    user={{ id: user.id, full_name: user.user_metadata?.full_name || 'Security' }}
                                                    propertyName={property.name}
                                                    isStaff={true}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                            {activeTab === 'checkinout' && property && (
                                <div className="flex-1 w-full flex flex-col items-center">
                                    <VMSKiosk propertyId={propertyId} propertyName={property.name} />
                                </div>
                            )}
                            {activeTab === 'visitors' && <VMSAdminDashboard propertyId={propertyId} />}
                            {activeTab === 'diesel' && <DieselStaffDashboard />}
                            {activeTab === 'checklist' && property && (
                                <SOPDashboard propertyId={property.id} />
                            )}
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
                                                    className="h-10 w-auto object-contain invert mix-blend-screen"
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
                </div>
            </main>

            <SignOutModal
                isOpen={showSignOutModal}
                onClose={() => setShowSignOutModal(false)}
                onConfirm={signOut}
            />
        </div>
    );
};

const OverviewTab = ({ stats }: { stats: any }) => (
    <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
                { label: 'Active Visitors', value: stats.activeVisitors.toString(), icon: UsersRound, color: 'text-primary', bg: 'bg-primary/10' },
                { label: 'Pending Clearances', value: stats.pendingClearances.toString(), icon: Clock, color: 'text-secondary', bg: 'bg-secondary/10' },
                { label: 'Incidents Today', value: stats.incidentsToday.toString(), icon: AlertCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Security Alerts', value: stats.securityAlerts.toString(), icon: AlertCircle, color: 'text-rose-600', bg: 'bg-rose-50' },
            ].map((stat, i) => (
                <div key={i} className="bg-card p-6 rounded-3xl border border-border shadow-sm">
                    <div className={`w-12 h-12 ${stat.bg} ${stat.color} rounded-2xl flex items-center justify-center mb-4 transition-transform hover:scale-110`}>
                        <stat.icon className="w-6 h-6" />
                    </div>
                    <p className="text-text-secondary text-sm font-bold uppercase tracking-widest text-[10px] opacity-60 mb-1">{stat.label}</p>
                    <h3 className="text-3xl font-black text-text-primary">{stat.value}</h3>
                </div>
            ))}
        </div>
    </div>
);

export default SecurityDashboard;
