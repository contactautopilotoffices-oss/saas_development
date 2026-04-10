/**
 * ProcurementDashboard
 * Material request and procurement tracking dashboard.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    LayoutDashboard, Package, Ticket, LogOut, Menu, X, ChevronRight,
    Clock, CheckCircle2, AlertCircle, Truck, ShoppingCart, Building2,
    User, Filter, Search, ChevronDown, ExternalLink, RefreshCw,
    ArrowUpRight, Box, IndianRupee, FileText, UserCircle, Shield,
    Bell, Settings, Moon, Sun, Scan, Plus, TrendingUp
} from 'lucide-react';
import { AutopilotLogo } from '@/frontend/components/ui/AutopilotLogo';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import { useAuth } from '@/frontend/context/AuthContext';
import SignOutModal from '@/frontend/components/ui/SignOutModal';
import SettingsView from './SettingsView';
import NotificationBell from './NotificationBell';
import Skeleton from '@/frontend/components/ui/Skeleton';

// ─── Types ───────────────────────────────────────────────────────────
interface MaterialRequest {
    id: string;
    ticket_id: string;
    property_id: string;
    organization_id: string;
    requested_by: string;
    assignee_uid: string | null;
    items: { name: string; quantity: number; unit?: string; notes?: string; estimated_cost?: number }[];
    status: string;
    priority: string;
    total_estimated_cost: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
    // Joined
    ticket?: {
        id: string;
        ticket_number: string;
        title: string;
        status: string;
        priority: string;
        assigned_to: string | null;
        assignee?: { full_name: string } | null;
    };
    requester?: { full_name: string; email?: string };
    property?: { id: string; name: string };
}

type Tab = 'overview' | 'requests' | 'history' | 'vendors' | 'inventory' | 'analytics' | 'profile' | 'settings';

// ─── Status Helpers ──────────────────────────────────────────────────
const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
    pending: { label: 'Pending Approval', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    approved: { label: 'Approved', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    ordered: { label: 'Ordered', color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    delivered: { label: 'Delivered', color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    cancelled: { label: 'Cancelled', color: 'text-slate-400', bg: 'bg-slate-50', border: 'border-slate-200' },
    rejected: { label: 'Rejected', color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-200' },
};

// ─── Main Component ──────────────────────────────────────────────────
export default function ProcurementDashboard() {
    const { user, signOut } = useAuth();
    
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const [requests, setRequests] = useState<MaterialRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [activities, setActivities] = useState<any[]>([]);

    // Fetch material requests
    const fetchRequests = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/procurement/tickets');
            if (res.ok) {
                const data = await res.json();
                setRequests(data || []);
            }
        } catch (err) {
            console.error('Error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchActivities = useCallback(async () => {
        try {
            const res = await fetch('/api/procurement/activity');
            if (res.ok) {
                const data = await res.json();
                setActivities(data || []);
            }
        } catch (err) {
            console.error('Activities fetch error:', err);
        }
    }, []);

    useEffect(() => {
        fetchRequests();
        fetchActivities();
    }, [fetchRequests, fetchActivities]);

    // Status update logic
    const updateStatus = async (requestId: string, newStatus: string, ticketId: string) => {
        setUpdatingId(requestId);
        try {
            const res = await fetch(`/api/tickets/${ticketId}/materials`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ material_id: requestId, status: newStatus })
            });

            if (res.ok) {
                setRequests(prev => prev.map(r => r.id === requestId ? { ...r, status: newStatus } : r));
                fetchActivities(); // Refresh activity log
            }
        } catch (err) {
            console.error('Update error:', err);
        } finally {
            setUpdatingId(null);
        }
    };

    // Derived stats
    const stats = useMemo(() => ({
        total: requests.length,
        pending: requests.filter(r => r.status === 'pending').length,
        ordered: requests.filter(r => r.status === 'ordered').length,
        delivered: requests.filter(r => r.status === 'delivered').length,
        totalValue: requests.reduce((acc, r) => acc + (r.total_estimated_cost || 0), 0),
    }), [requests]);

    // Filter logic
    const filteredRequests = useMemo(() => {
        return requests.filter(r => {
            const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
            const q = searchQuery.toLowerCase();
            const matchesSearch = !searchQuery || 
                r.ticket?.ticket_number?.toLowerCase().includes(q) ||
                r.ticket?.title?.toLowerCase().includes(q) ||
                r.property?.name?.toLowerCase().includes(q) ||
                r.items.some(i => i.name.toLowerCase().includes(q));
            return matchesStatus && matchesSearch;
        });
    }, [requests, statusFilter, searchQuery]);

    return (
        <div className="min-h-screen bg-slate-50 flex font-inter text-slate-900 overflow-hidden">
            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-300 transition-transform duration-300 transform
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                <div className="h-full flex flex-col pt-4">
                    <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                    {/* Logo Section */}
                    <div className="px-10 mb-10 mt-6 flex flex-col items-start">
                        <img 
                            src="/autopilot-logo-new.png" 
                            alt="Autopilot" 
                            className="h-10 w-auto object-contain mb-1" 
                        />
                        <p className="text-[11px] text-slate-400 font-bold uppercase tracking-[0.4em] leading-relaxed mb-6">
                            Procurement
                        </p>
                        <div className="h-[2px] w-full bg-slate-100 mb-6 hidden lg:block" />
                    </div>

                    <nav className="flex-1 px-4 overflow-y-auto min-h-0 custom-scrollbar">
                        <div className="mb-8">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                                <span className="w-0.5 h-3 bg-primary rounded-full"></span>
                                Core Operations
                            </p>
                            <div className="space-y-1">
                                {[
                                    { id: 'overview', icon: LayoutDashboard, label: 'Dashboard' },
                                    { id: 'requests', icon: Package, label: 'Active Orders' },
                                    { id: 'history', icon: CheckCircle2, label: 'Order History' },
                                ].map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => { setActiveTab(item.id as Tab); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === item.id 
                                            ? 'bg-primary text-white shadow-md' 
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                                    >
                                        <item.icon className="w-4 h-4" />
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* System & Personal */}
                        <div className="mb-8">
                            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                                <span className="w-0.5 h-3 bg-slate-300 rounded-full"></span>
                                System & Personal
                            </p>
                            <div className="space-y-1">
                                {[
                                    { id: 'settings', icon: Settings, label: 'Settings' },
                                    { id: 'profile', icon: UserCircle, label: 'Profile' },
                                ].map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => { setActiveTab(item.id as Tab); setSidebarOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === item.id 
                                            ? 'bg-primary text-white shadow-md' 
                                            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                                    >
                                        <item.icon className="w-4 h-4" />
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </nav>

                    <div className="px-4 py-4 border-t border-slate-100 mt-auto flex-shrink-0">
                        <button onClick={() => setActiveTab('profile')} className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all ${activeTab === 'profile' ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold shadow-inner">
                                {user?.email?.[0].toUpperCase() || 'P'}
                            </div>
                            <div className="text-left overflow-hidden">
                                <p className="text-xs font-black text-slate-900 truncate">{user?.user_metadata?.full_name || 'ProcManager'}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Access: Procurement</p>
                            </div>
                        </button>
                        <button onClick={() => setShowSignOutModal(true)} className="w-full mt-2 flex items-center gap-3 px-4 py-2.5 rounded-xl text-rose-600 hover:bg-rose-50 transition-all font-bold text-xs">
                            <LogOut className="w-4 h-4" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Area */}
            <main className="flex-1 lg:ml-72 min-h-screen flex flex-col bg-slate-50 overflow-y-auto">
                {/* Header */}
                <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-40 px-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 text-slate-500 hover:bg-slate-100 rounded-xl">
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="hidden md:block">
                            <h1 className="text-xl font-black text-slate-900 leading-none mb-1 capitalize">
                                {activeTab === 'requests' ? 'Active Orders' : activeTab}
                            </h1>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Awaiting Fulfillment • {stats.pending} Items</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className="relative hidden lg:block group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                            <input
                                type="text"
                                placeholder="Global Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold w-64 outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-2 border-l border-slate-100 pl-4">
                            <NotificationBell />
                            <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-600 font-black text-xs">
                                {user?.email?.[0].toUpperCase()}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Content Area */}
                <div className="p-8">
                    <AnimatePresence mode="wait">
                        {activeTab === 'overview' && <OverviewTab stats={stats} activities={activities} />}
                        {activeTab === 'requests' && (
                            <RequestsTab 
                                requests={filteredRequests} 
                                isLoading={isLoading}
                                statusFilter={statusFilter}
                                onSetStatusFilter={setStatusFilter}
                                onUpdateStatus={updateStatus}
                                updatingId={updatingId}
                            />
                        )}
                        {activeTab === 'history' && <HistoryTab requests={requests} />}
                        {activeTab === 'vendors' && <PlaceholderTab title="Vendors Hub" icon={Shield} desc="Manage supplier data and ratings." />}
                        {activeTab === 'inventory' && <PlaceholderTab title="Inventory" icon={Box} desc="Real-time stock levels across properties." />}
                        {activeTab === 'analytics' && <PlaceholderTab title="Analytics" icon={TrendingUp} desc="Procurement spend and efficiency reports." />}
                        {activeTab === 'profile' && <ProfileTab user={user} />}
                        {activeTab === 'settings' && <SettingsView />}
                    </AnimatePresence>
                </div>

                <SignOutModal isOpen={showSignOutModal} onClose={() => setShowSignOutModal(false)} onConfirm={signOut} />
            </main>
        </div>
    );
}

// ─── Sub-Components (Tabs) ──────────────────────────────────────────

function OverviewTab({ stats, activities }: { stats: any; activities: any[] }) {
    // Relative time helper
    const getRelativeTime = (dateStr: string) => {
        const now = new Date();
        const past = new Date(dateStr);
        const diffInMs = now.getTime() - past.getTime();
        const diffInMin = Math.floor(diffInMs / (1000 * 60));
        const diffInHrs = Math.floor(diffInMin / 60);
        const diffInDays = Math.floor(diffInHrs / 24);

        if (diffInMin < 1) return 'just now';
        if (diffInMin < 60) return `${diffInMin}m ago`;
        if (diffInHrs < 24) return `${diffInHrs}h ago`;
        return `${diffInDays}d ago`;
    };

    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard label="Pipeline" value={stats.total} icon={Package} color="indigo" />
                <StatCard label="Pending" value={stats.pending} icon={Clock} color="amber" />
                <StatCard label="In Transit" value={stats.ordered} icon={Truck} color="purple" />
                <StatCard label="Value (Est)" value={`₹${(stats.totalValue / 1000).toFixed(1)}k`} icon={IndianRupee} color="emerald" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-[32px] border border-slate-200 p-8 shadow-sm">
                    <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight">Recent Activity</h3>
                    <div className="space-y-6">
                        {activities.length > 0 ? (
                            activities.map((log, i) => (
                                <div key={log.id} className="flex items-start gap-4 group">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-all flex-shrink-0">
                                        <Box className="w-6 h-6" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-900 truncate">
                                            {log.material_request?.ticket?.ticket_number || 'Req'} • {log.action.replace(/_/g, ' ')}
                                        </p>
                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest truncate">
                                            {log.material_request?.property?.name || 'Site'} • {log.user?.full_name || 'System'}
                                        </p>
                                        <div className="mt-1 flex items-center gap-2">
                                            {log.old_value && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 line-through">
                                                    {log.old_value}
                                                </span>
                                            )}
                                            {log.old_value && <ChevronRight className="w-3 h-3 text-slate-300" />}
                                            <span className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase ${
                                                STATUS_CONFIG[log.new_value]?.bg || 'bg-slate-100'
                                            } ${STATUS_CONFIG[log.new_value]?.color || 'text-slate-500'}`}>
                                                {log.new_value || log.metadata?.items?.length + ' items' || 'update'}
                                            </span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest italic whitespace-nowrap">
                                        {getRelativeTime(log.created_at)}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="py-12 text-center">
                                <p className="text-sm font-bold text-slate-400">No recent activity found.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

function RequestsTab({ requests, isLoading, statusFilter, onSetStatusFilter, onUpdateStatus, updatingId }: any) {
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-[32px] border border-slate-200">
                <div className="flex flex-wrap gap-2">
                    {['all', 'pending', 'ordered', 'delivered'].map((f) => (
                        <button
                            key={f}
                            onClick={() => onSetStatusFilter(f)}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === f ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                        >
                            {f}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-2 text-slate-400 px-4">
                    <Filter className="w-4 h-4" />
                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">Filtered Results</span>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {isLoading ? (
                    Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48 rounded-[32px]" />)
                ) : requests.length > 0 ? requests.map((req: any) => (
                    <div key={req.id} className="bg-white rounded-[32px] border border-slate-200 p-8 hover:border-primary/30 transition-all group shadow-sm hover:shadow-xl relative overflow-hidden">
                        <div className="flex flex-col lg:flex-row gap-8">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-primary shadow-sm border border-slate-100">
                                        <Package className="w-7 h-7" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h4 className="text-xl font-black text-slate-900 tracking-tight">#{req.ticket?.ticket_number}</h4>
                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${STATUS_CONFIG[req.status]?.bg} ${STATUS_CONFIG[req.status]?.color} border ${STATUS_CONFIG[req.status]?.border}`}>
                                                {req.status}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-slate-400 truncate max-w-sm">{req.ticket?.title}</p>
                                    </div>
                                </div>
                                <div className="space-y-3 p-5 bg-slate-50/50 rounded-2xl border border-slate-100">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                        <Box className="w-3 h-3" /> Materials Required
                                    </p>
                                    {req.items.map((item: any, i: number) => (
                                        <div key={i} className="flex justify-between items-center group/item">
                                            <span className="text-sm font-bold text-slate-700">{item.name}</span>
                                            <div className="flex items-center gap-4">
                                                <span className="text-xs font-black text-slate-400">Qty: {item.quantity}</span>
                                                {item.estimated_cost && <span className="text-xs font-black text-emerald-600">₹{item.estimated_cost}</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="w-full lg:w-72 flex flex-col gap-5 border-t lg:border-t-0 lg:border-l border-slate-100 pt-6 lg:pt-0 lg:pl-10">
                                <div className="space-y-4">
                                    <MetaItem label="Property" value={req.property?.name} icon={Building2} />
                                    <MetaItem label="Requester" value={req.requester?.full_name} icon={User} />
                                    <MetaItem label="Assignee" value={req.ticket?.assignee?.full_name || 'Unassigned'} icon={Shield} highlight />
                                </div>
                                <div className="mt-auto pt-4 flex gap-2">
                                    {req.status === 'pending' && (
                                        <ProcActionButton label="Buy" icon={ShoppingCart} onClick={() => onUpdateStatus(req.id, 'ordered', req.ticket_id)} loading={updatingId === req.id} />
                                    )}
                                    {req.status === 'ordered' && (
                                        <ProcActionButton label="Delivered" icon={Truck} color="emerald" onClick={() => onUpdateStatus(req.id, 'delivered', req.ticket_id)} loading={updatingId === req.id} />
                                    )}
                                    <button className="p-3 bg-slate-50 text-slate-300 hover:text-slate-500 rounded-2xl transition-all border border-slate-100"><Settings className="w-5 h-5" /></button>
                                </div>
                            </div>
                        </div>
                    </div>
                )) : (
                    <div className="py-32 flex flex-col items-center justify-center text-center">
                        <PackageSearch className="w-16 h-16 text-slate-200 mb-6" />
                        <h3 className="text-xl font-black text-slate-900 mb-2 font-display">No requests found</h3>
                        <p className="text-slate-400 font-medium max-w-xs mx-auto">Try changing your filters or searching for a different ticket ID.</p>
                    </div>
                )}
            </div>
        </motion.div>
    );
}

function HistoryTab({ requests }: { requests: any[] }) {
    const delivered = requests.filter(r => r.status === 'delivered');
    return (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Order Archive</h3>
            <div className="bg-white rounded-[32px] border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        <tr>
                            <th className="px-8 py-5">Order Reference</th>
                            <th className="px-8 py-5">Property</th>
                            <th className="px-8 py-5">Summary</th>
                            <th className="px-8 py-5 text-right">Fulfillment</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {delivered.length > 0 ? delivered.map(req => (
                            <tr key={req.id} className="hover:bg-slate-50/50 transition-all cursor-pointer">
                                <td className="px-8 py-5 font-black text-slate-900">#{req.ticket?.ticket_number}</td>
                                <td className="px-8 py-5 font-bold text-slate-600 text-sm">{req.property?.name}</td>
                                <td className="px-8 py-5 text-xs text-slate-400">{req.items.length} items • Completed Acquisition</td>
                                <td className="px-8 py-5 text-right">
                                    <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase border border-emerald-100">Delivered</span>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-300 italic">No historical data available.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </motion.div>
    );
}

function PlaceholderTab({ title, icon: Icon, desc }: any) {
    return (
        <div className="py-32 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-white rounded-[32px] border border-slate-200 flex items-center justify-center text-slate-200 mb-8 shadow-sm">
                <Icon className="w-10 h-10" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
            <p className="text-slate-400 font-medium max-w-sm mx-auto mt-2">{desc}</p>
            <div className="mt-8 px-6 py-2 bg-primary/5 text-primary rounded-full text-[10px] font-black uppercase tracking-widest border border-primary/10">Coming Soon</div>
        </div>
    );
}

function ProfileTab({ user }: any) {
    return (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center py-10">
            <div className="w-full max-w-xl bg-white rounded-[40px] border border-slate-200 shadow-2xl p-10 flex flex-col items-center">
                <div className="w-32 h-32 rounded-3xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center text-white text-5xl font-black shadow-xl mb-8">
                    {user?.email?.[0].toUpperCase()}
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-1">{user?.user_metadata?.full_name || 'Procurement Officer'}</h2>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.3em] mb-10">Security Tier: Authorized</p>
                <div className="w-full space-y-4">
                    <ProfileRow label="Official Email" value={user?.email} />
                    <ProfileRow label="Assigned Role" value="Procurement Manager" highlight />
                    <ProfileRow label="Office Hours" value="09:00 - 18:00 (IST)" />
                </div>
            </div>
        </motion.div>
    );
}

// ─── Helpers ────────────────────────────────────────────────────────

const StatCard = ({ label, value, icon: Icon, color }: any) => {
    const colors: any = {
        indigo: 'bg-indigo-50 text-indigo-600',
        amber: 'bg-amber-50 text-amber-600',
        purple: 'bg-purple-50 text-purple-600',
        emerald: 'bg-emerald-50 text-emerald-600',
    };
    return (
        <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm hover:shadow-xl transition-all group">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 ${colors[color]}`}>
                <Icon className="w-6 h-6" />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
            <p className="text-4xl font-black text-slate-900">{value}</p>
        </div>
    );
};

const MetaItem = ({ label, value, icon: Icon, highlight }: any) => (
    <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${highlight ? 'bg-primary/10 text-primary border border-primary/20' : 'bg-slate-50 text-slate-400'}`}>
            <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
            <p className={`text-xs font-black truncate max-w-[140px] ${highlight ? 'text-primary' : 'text-slate-700'}`}>{value || 'Unknown'}</p>
        </div>
    </div>
);

const ProcActionButton = ({ label, icon: Icon, onClick, loading, color = 'indigo' }: any) => {
    const styles: any = {
        indigo: 'bg-primary shadow-primary/20 hover:bg-primary-dark',
        emerald: 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700',
    };
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 shadow-xl ${styles[color]}`}
        >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
            {label}
        </button>
    );
};

const ProfileRow = ({ label, value, highlight }: any) => (
    <div className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border border-slate-100">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
        <span className={`text-sm font-black ${highlight ? 'text-primary' : 'text-slate-900'}`}>{value}</span>
    </div>
);

// SVGs
const PackageSearch = (p: any) => (<svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 21a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Z"/><path d="m21 21-1.9-1.9"/><path d="M21 7.82V12"/><path d="M20 18.83V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v.83"/><path d="M10 3v4"/><path d="M14 3v4"/><path d="M18 3v4"/><path d="M2 7h18"/><path d="M6 3v4"/></svg>);
