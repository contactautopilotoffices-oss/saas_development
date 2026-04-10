/**
 * AnalyticsTab
 * Tab view for property-level analytics with charts and KPI tiles.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
    Users, Clock, Zap, Activity,
    TrendingUp, ArrowUpRight, Search,
    Loader2, Filter, Download
} from 'lucide-react';
import { motion } from 'framer-motion';

interface AnalyticsData {
    global: {
        active_users_7d: number;
        avg_session_duration_minutes: number;
        total_sessions_logged: number;
        total_user_base: number;
    };
    users: Array<{
        user_id: string;
        full_name: string;
        email: string;
        sessions_this_week: number;
        avg_duration_minutes: number;
        total_sessions: number;
        last_active: string | null;
    }>;
}

const AnalyticsTab = () => {
    const [data, setData] = useState<AnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            try {
                const response = await fetch('/api/admin/usage-metrics');
                if (!response.ok) throw new Error('Failed to fetch metrics');
                const result = await response.json();
                setData(result);
            } catch (error) {
                console.error('Error fetching analytics:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const formatDuration = (mins: number) => {
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        const remainingMins = mins % 60;
        return `${hours}h ${remainingMins}m`;
    };

    const filteredUsers = data?.users.filter(u =>
        u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    if (isLoading) {
        return (
            <div className="h-96 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <p className="text-slate-400 font-bold animate-pulse">Analyzing Engagement Data...</p>
            </div>
        );
    }

    const kpis = [
        {
            label: 'Active Users (7 Days)',
            value: data?.global.active_users_7d || 0,
            icon: Users,
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            status: 'LIVE',
            statusColor: 'text-emerald-500'
        },
        {
            label: 'Session Duration',
            value: formatDuration(data?.global.avg_session_duration_minutes || 0),
            icon: Clock,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            status: 'AVG',
            statusColor: 'text-blue-500'
        },
        {
            label: 'Total Sessions Logged',
            value: data?.global.total_sessions_logged || 0,
            icon: Zap,
            color: 'text-amber-600',
            bg: 'bg-amber-50',
            status: null
        },
        {
            label: 'Total User Base',
            value: data?.global.total_user_base || 0,
            icon: Activity,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            status: 'TOTAL',
            statusColor: 'text-emerald-500'
        }
    ];

    return (
        <div className="space-y-12">
            {/* Header Area */}
            <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">User Engagement Analytics</h2>
                <p className="text-slate-400 text-sm font-medium">Real-time insights on user adoption and session performance.</p>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {kpis.map((kpi, idx) => (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-white border border-slate-100 rounded-[2rem] p-8 shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all group"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className={`w-12 h-12 ${kpi.bg} rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110`}>
                                <kpi.icon className={`w-6 h-6 ${kpi.color}`} />
                            </div>
                            {kpi.status && (
                                <span className={`text-[10px] font-black ${kpi.statusColor} uppercase tracking-widest`}>
                                    {kpi.status}
                                </span>
                            )}
                        </div>
                        <p className="text-4xl font-black text-slate-900 tracking-tighter mb-1">
                            {kpi.value}
                        </p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            {kpi.label}
                        </p>
                    </motion.div>
                ))}
            </div>

            {/* Power Users Table */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="bg-white border border-slate-100 rounded-[2.5rem] overflow-hidden shadow-sm"
            >
                <div className="p-8 border-b border-slate-50 flex justify-between items-center bg-slate-50/30">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-indigo-600" />
                        </div>
                        <h3 className="text-lg font-black text-slate-800">Top Power Users</h3>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search users..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 w-64"
                            />
                        </div>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Based on Frequency</span>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">Rank</th>
                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User</th>
                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Sessions (Week)</th>
                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Avg Time</th>
                                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Last Active</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-8 py-12 text-center text-slate-400 font-medium italic">
                                        No usage data available for this selection.
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((user, idx) => (
                                    <tr key={user.user_id} className="group hover:bg-slate-50/50 transition-colors">
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <span className={`text-sm font-black ${idx === 0 ? 'text-amber-500' :
                                                        idx === 1 ? 'text-blue-500' :
                                                            idx === 2 ? 'text-orange-500' : 'text-slate-300'
                                                    }`}>
                                                    #{idx + 1}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-slate-900 leading-tight">
                                                    {user.full_name || 'System User'}
                                                </span>
                                                <span className="text-xs text-slate-500 font-medium">
                                                    {user.email}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6 text-center">
                                            <span className="text-sm font-black text-slate-700">
                                                {user.sessions_this_week}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-center">
                                            <span className="text-sm font-bold text-slate-600">
                                                {formatDuration(user.avg_duration_minutes)}
                                            </span>
                                        </td>
                                        <td className="px-8 py-6 text-right">
                                            <span className="text-xs font-bold text-slate-400">
                                                {user.last_active ? new Date(user.last_active).toLocaleDateString() : 'Never'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </div>
    );
};

export default AnalyticsTab;
