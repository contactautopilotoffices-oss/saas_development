/**
 * VMSAdminDashboard
 *
 * Visitor Management System (VMS) admin dashboard for property-level
 * visitor tracking. Displays visitor logs, check-in/check-out status,
 * search, filtering, and CSV export.
 *
 * Features:
 * - KPI stats cards: total visitors today, currently checked in, checked out
 * - Visitor log table with desktop (table) and mobile (card) layouts
 * - Search by visitor ID or name
 * - Date filtering: today, yesterday, this week, this month, custom date
 * - Status filtering: all, checked in, checked out
 * - Visitor categories: visitor, vendor, other (with color-coded badges)
 * - Visitor detail modal with full profile, check-in/out times, and duration
 * - Force checkout action for currently on-premise visitors
 * - CSV export of filtered visitor data
 * - Auto-refresh every 30 seconds via polling interval
 *
 * @example
 * <VMSAdminDashboard
 *   propertyId="prop_123"
 * />
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
    Users, Clock, LogIn, LogOut, Search, FileDown,
    CheckCircle2, User, Truck, Building2, X, Calendar, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface VMSAdminDashboardProps {
    propertyId: string;
}

interface VisitorLog {
    id: string;
    visitor_id: string;
    category: string;
    name: string;
    mobile: string;
    coming_from: string;
    whom_to_meet: string;
    photo_url: string;
    checkin_time: string;
    checkout_time: string | null;
    status: string;
}

type DateFilter = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

const VMSAdminDashboard: React.FC<VMSAdminDashboardProps> = ({ propertyId }) => {
    const [visitors, setVisitors] = useState<VisitorLog[]>([]);
    const [stats, setStats] = useState({ total_today: 0, checked_in: 0, checked_out: 0 });
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'checked_in' | 'checked_out'>('all');
    const [dateFilter, setDateFilter] = useState<DateFilter>('today');
    const [customDate, setCustomDate] = useState('');
    const [selectedVisitor, setSelectedVisitor] = useState<VisitorLog | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        fetchVisitors();
        const interval = setInterval(fetchVisitors, 30000);
        return () => clearInterval(interval);
    }, [propertyId, statusFilter, dateFilter, customDate]);

    const fetchVisitors = async () => {
        try {
            const params = new URLSearchParams({ status: statusFilter });

            // Apply date filter
            if (dateFilter === 'today') {
                params.append('date', 'today');
            } else if (dateFilter === 'yesterday') {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                params.append('date', yesterday.toISOString().split('T')[0]);
            } else if (dateFilter === 'week') {
                params.append('date', 'week');
            } else if (dateFilter === 'custom' && customDate) {
                params.append('date', customDate);
            }

            if (searchQuery) params.append('search', searchQuery);

            const response = await fetch(`/api/vms/${propertyId}?${params}`);
            const data = await response.json();

            if (response.ok) {
                setVisitors(data.visitors || []);
                setStats(data.stats || { total_today: 0, checked_in: 0, checked_out: 0 });
            }
        } catch (err) {
            console.error('Error fetching visitors:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchVisitors();
    };

    const handleForceCheckout = async (visitor: VisitorLog) => {
        if (!confirm(`Force checkout ${visitor.name}?`)) return;

        setActionLoading(true);
        try {
            const response = await fetch(`/api/vms/${propertyId}/force-checkout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visitor_log_id: visitor.id }),
            });

            if (response.ok) {
                fetchVisitors();
                setSelectedVisitor(null);
            }
        } catch (err) {
            console.error('Force checkout error:', err);
        } finally {
            setActionLoading(false);
        }
    };

    const handleExport = () => {
        const headers = ['Visitor ID', 'Name', 'Category', 'Mobile', 'Coming From', 'Whom to Meet', 'Check-in', 'Check-out', 'Status'];
        const rows = visitors.map(v => [
            v.visitor_id,
            v.name,
            v.category,
            v.mobile || '-',
            v.coming_from || '-',
            v.whom_to_meet,
            new Date(v.checkin_time).toLocaleString(),
            v.checkout_time ? new Date(v.checkout_time).toLocaleString() : '-',
            v.status,
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", `visitors_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getDuration = (checkin: string, checkout: string | null) => {
        const start = new Date(checkin);
        const end = checkout ? new Date(checkout) : new Date();
        const diffMs = end.getTime() - start.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case 'visitor': return <User className="w-4 h-4" />;
            case 'vendor': return <Truck className="w-4 h-4" />;
            default: return <Building2 className="w-4 h-4" />;
        }
    };

    const getCategoryColor = (category: string) => {
        switch (category) {
            case 'visitor': return 'bg-primary/10 text-primary';
            case 'vendor': return 'bg-secondary/10 text-secondary';
            default: return 'bg-slate-100 text-slate-600';
        }
    };

    if (isLoading) {
        return (
            <div className="space-y-8 animate-pulse">
                {/* Stat cards skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {[
                        'bg-primary/10',
                        'bg-emerald-50',
                        'bg-rose-50',
                    ].map((iconBg, i) => (
                        <div key={i} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                            <div className="flex items-center gap-4 mb-4">
                                <div className={`w-12 h-12 ${iconBg} rounded-2xl`} />
                                <div className="space-y-2">
                                    <div className="h-2.5 w-24 bg-slate-100 rounded-full" />
                                    <div className="h-8 w-12 bg-slate-200 rounded-lg" />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Visitor log panel skeleton */}
                <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                    {/* Panel header */}
                    <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="space-y-2">
                            <div className="h-6 w-28 bg-slate-200 rounded-lg" />
                            <div className="h-3 w-40 bg-slate-100 rounded-full" />
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <div className="h-9 w-48 bg-slate-100 rounded-xl" />
                            <div className="h-9 w-28 bg-slate-100 rounded-xl" />
                            <div className="h-9 w-24 bg-slate-100 rounded-xl" />
                            <div className="h-9 w-9 bg-slate-100 rounded-xl" />
                        </div>
                    </div>

                    {/* Table skeleton – desktop */}
                    <div className="hidden md:block overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    {['Visitor', 'Category', 'Host / Purpose', 'Timing', 'Status', 'Action'].map(col => (
                                        <th key={col} className="px-6 py-4">
                                            <div className="h-2.5 w-16 bg-slate-200 rounded-full" />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {[1, 2, 3, 4, 5].map(row => (
                                    <tr key={row}>
                                        {/* Visitor info */}
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
                                                <div className="space-y-1.5">
                                                    <div className="h-3.5 w-28 bg-slate-200 rounded-full" />
                                                    <div className="h-2.5 w-20 bg-slate-100 rounded-full" />
                                                </div>
                                            </div>
                                        </td>
                                        {/* Category */}
                                        <td className="px-6 py-4">
                                            <div className="h-6 w-20 bg-slate-100 rounded-full" />
                                        </td>
                                        {/* Host */}
                                        <td className="px-6 py-4">
                                            <div className="space-y-1.5">
                                                <div className="h-3 w-24 bg-slate-200 rounded-full" />
                                                <div className="h-2.5 w-20 bg-slate-100 rounded-full" />
                                            </div>
                                        </td>
                                        {/* Timing */}
                                        <td className="px-6 py-4">
                                            <div className="space-y-1.5">
                                                <div className="h-3 w-20 bg-slate-200 rounded-full" />
                                                <div className="h-2.5 w-16 bg-slate-100 rounded-full" />
                                            </div>
                                        </td>
                                        {/* Status */}
                                        <td className="px-6 py-4">
                                            <div className="h-6 w-24 bg-slate-100 rounded-full" />
                                        </td>
                                        {/* Action */}
                                        <td className="px-6 py-4">
                                            <div className="h-8 w-20 bg-slate-200 rounded-xl" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile cards skeleton */}
                    <div className="md:hidden divide-y divide-slate-50">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="p-4 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-slate-200 flex-shrink-0" />
                                    <div className="space-y-1.5 flex-1">
                                        <div className="h-3.5 w-32 bg-slate-200 rounded-full" />
                                        <div className="h-2.5 w-24 bg-slate-100 rounded-full" />
                                    </div>
                                    <div className="h-6 w-20 bg-slate-100 rounded-full" />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="h-3 w-full bg-slate-100 rounded-full" />
                                    <div className="h-3 w-full bg-slate-100 rounded-full" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center">
                            <Users className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Visitors</p>
                            <p className="text-3xl font-black text-slate-900">{stats.total_today}</p>
                        </div>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center">
                            <LogIn className="w-6 h-6 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Currently In</p>
                            <p className="text-3xl font-black text-emerald-600">{stats.checked_in}</p>
                        </div>
                    </div>
                </motion.div>

                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center">
                            <LogOut className="w-6 h-6 text-rose-600" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Checked Out</p>
                            <p className="text-3xl font-black text-rose-600">{stats.checked_out}</p>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Visitors Table */}
            <div className="bg-white border border-slate-100 rounded-3xl overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Visitor Log</h3>
                        <p className="text-slate-500 text-xs font-medium mt-1">Real-time visitor tracking</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {/* Search */}
                        <form onSubmit={handleSearch} className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search by ID or Name"
                                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-slate-400 focus:ring-0 w-48"
                            />
                        </form>

                        {/* Date Filter */}
                        <div className="relative">
                            <select
                                value={dateFilter}
                                onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                                className="appearance-none pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                            >
                                <option value="today">Today</option>
                                <option value="yesterday">Yesterday</option>
                                <option value="week">This Week</option>
                                <option value="month">This Month</option>
                                <option value="custom">Custom Date</option>
                            </select>
                            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>

                        {dateFilter === 'custom' && (
                            <input
                                type="date"
                                value={customDate}
                                onChange={(e) => setCustomDate(e.target.value)}
                                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                            />
                        )}

                        {/* Status Filter */}
                        <div className="flex border border-slate-200 rounded-xl overflow-hidden">
                            {(['all', 'checked_in', 'checked_out'] as const).map((status) => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${statusFilter === status
                                        ? 'bg-primary text-text-inverse'
                                        : 'bg-white text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    {status === 'all' ? 'All' : status === 'checked_in' ? 'In' : 'Out'}
                                </button>
                            ))}
                        </div>

                        {/* Export */}
                        <button
                            onClick={handleExport}
                            className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200 transition-all"
                        >
                            <FileDown className="w-4 h-4" /> Export
                        </button>
                    </div>
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Visitor Info</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Host / Purpose</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timing</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {visitors.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">
                                        No visitors found.
                                    </td>
                                </tr>
                            ) : (
                                visitors.map((visitor) => (
                                    <tr
                                        key={visitor.id}
                                        className="hover:bg-slate-50/50 transition-all cursor-pointer"
                                        onClick={() => setSelectedVisitor(visitor)}
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                {visitor.photo_url ? (
                                                    <img
                                                        src={visitor.photo_url}
                                                        alt={visitor.name}
                                                        className="w-10 h-10 rounded-full object-cover border-2 border-slate-100"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
                                                        <User className="w-5 h-5 text-slate-400" />
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-bold text-slate-900 text-sm hover:text-primary transition-colors">
                                                        {visitor.name}
                                                    </p>
                                                    <p className="text-xs text-slate-500 font-medium">{visitor.mobile || 'No mobile'}</p>
                                                    <p className="text-[10px] text-slate-400 font-mono">{visitor.visitor_id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${getCategoryColor(visitor.category)}`}>
                                                {getCategoryIcon(visitor.category)}
                                                {visitor.category}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm font-bold text-slate-900">{visitor.whom_to_meet}</div>
                                            <div className="text-xs text-slate-500">{visitor.coming_from || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-xs font-bold text-slate-900">
                                                In: {new Date(visitor.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            {visitor.checkout_time ? (
                                                <div className="text-xs text-slate-500 mt-1">
                                                    Out: {new Date(visitor.checkout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-emerald-600 mt-1 font-medium">
                                                    ({getDuration(visitor.checkin_time, visitor.checkout_time)})
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${visitor.status === 'checked_in'
                                                ? 'bg-primary/10 text-primary'
                                                : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {visitor.status === 'checked_in' ? 'On Premise' : 'Checked Out'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                            {visitor.status === 'checked_in' && (
                                                <button
                                                    onClick={() => handleForceCheckout(visitor)}
                                                    disabled={actionLoading}
                                                    className="px-3 py-1 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-all disabled:opacity-50"
                                                >
                                                    Force Out
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden space-y-4 p-4">
                    {visitors.length === 0 ? (
                        <div className="text-center text-slate-400 italic py-8">
                            No visitors found.
                        </div>
                    ) : (
                        visitors.map((visitor) => (
                            <div
                                key={visitor.id}
                                className="bg-slate-50 rounded-2xl p-4 border border-slate-100 shadow-sm"
                                onClick={() => setSelectedVisitor(visitor)}
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        {visitor.photo_url ? (
                                            <img
                                                src={visitor.photo_url}
                                                alt={visitor.name}
                                                className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-sm"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center border border-slate-100">
                                                <User className="w-6 h-6 text-slate-400" />
                                            </div>
                                        )}
                                        <div>
                                            <p className="font-bold text-slate-900 text-base">{visitor.name}</p>
                                            <p className="text-xs text-slate-500 font-medium">{visitor.mobile || 'No mobile'}</p>
                                        </div>
                                    </div>
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${getCategoryColor(visitor.category)}`}>
                                        {getCategoryIcon(visitor.category)}
                                        {visitor.category}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-y-3 gap-x-4 mb-4">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Host</p>
                                        <p className="text-sm font-medium text-slate-900 truncate">{visitor.whom_to_meet}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Time</p>
                                        <p className="text-sm font-medium text-slate-900">
                                            {new Date(visitor.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between pt-3 border-t border-slate-200/50">
                                    <div className="flex items-center gap-2">
                                        <span className={`w-2 h-2 rounded-full ${visitor.status === 'checked_in' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
                                        <span className="text-xs font-bold text-slate-600">
                                            {visitor.status === 'checked_in' ? 'Currently On Premise' : 'Checked Out'}
                                        </span>
                                    </div>
                                    {visitor.status === 'checked_in' && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleForceCheckout(visitor); }}
                                            disabled={actionLoading}
                                            className="px-4 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-bold hover:bg-rose-100 transition-all border border-rose-100"
                                        >
                                            Force Out
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Visitor Detail Modal */}
            <AnimatePresence>
                {selectedVisitor && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
                        onClick={() => setSelectedVisitor(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            className="bg-white rounded-3xl w-full max-w-md overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header with Photo */}
                            <div className="bg-gradient-to-br from-primary to-primary-dark p-6 text-white relative">
                                <button
                                    onClick={() => setSelectedVisitor(null)}
                                    className="absolute top-4 right-4 p-1 rounded-full bg-white/20 hover:bg-white/30"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                                <div className="flex items-center gap-4">
                                    {selectedVisitor.photo_url ? (
                                        <img
                                            src={selectedVisitor.photo_url}
                                            alt={selectedVisitor.name}
                                            className="w-20 h-20 rounded-2xl object-cover border-4 border-white/30"
                                        />
                                    ) : (
                                        <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center">
                                            <User className="w-10 h-10" />
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="text-2xl font-black">{selectedVisitor.name}</h3>
                                        <p className="text-white/70 font-mono text-sm">{selectedVisitor.visitor_id}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Details */}
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</p>
                                        <p className="text-slate-900 font-medium capitalize">{selectedVisitor.category}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mobile</p>
                                        <p className="text-slate-900 font-medium">{selectedVisitor.mobile || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coming From</p>
                                        <p className="text-slate-900 font-medium">{selectedVisitor.coming_from || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Whom to Meet</p>
                                        <p className="text-slate-900 font-medium">{selectedVisitor.whom_to_meet}</p>
                                    </div>
                                </div>

                                <div className="border-t border-slate-100 pt-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Check-in</p>
                                            <p className="text-slate-900 font-medium">
                                                {new Date(selectedVisitor.checkin_time).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duration</p>
                                            <p className="text-slate-900 font-bold">
                                                {getDuration(selectedVisitor.checkin_time, selectedVisitor.checkout_time)}
                                            </p>
                                        </div>
                                    </div>
                                    {selectedVisitor.checkout_time && (
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Check-out</p>
                                            <p className="text-slate-900 font-medium">
                                                {new Date(selectedVisitor.checkout_time).toLocaleString()}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Actions */}
                                {selectedVisitor.status === 'checked_in' && (
                                    <button
                                        onClick={() => handleForceCheckout(selectedVisitor)}
                                        disabled={actionLoading}
                                        className="w-full py-3 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-all disabled:opacity-50"
                                    >
                                        {actionLoading ? 'Processing...' : 'Force Checkout'}
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default VMSAdminDashboard;
