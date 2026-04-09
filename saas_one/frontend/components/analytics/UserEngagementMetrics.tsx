/**
 * UserEngagementMetrics - Admin dashboard component displaying per-user app usage analytics.
 *
 * Fetches engagement data from `/api/admin/usage-metrics` and renders a summary with three
 * stat cards (Total Users, Highly Engaged count, Sessions This Week) and a detailed table
 * showing each user's last active time (relative), weekly session count, average session
 * duration, and an engagement level badge (High/Medium/Low). Relative timestamps are
 * formatted as "Just now", "Xm ago", "Xh ago", "Xd ago", or a date string.
 *
 * @example
 * <UserEngagementMetrics orgId="org-123" />
 * <UserEngagementMetrics />  // fetches all orgs
 */
'use client';

import React, { useState, useEffect } from 'react';
import { Activity, Clock, TrendingUp, Users, RefreshCw, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

interface UserMetrics {
    user_id: string;
    full_name: string;
    email: string;
    last_active: string | null;
    sessions_this_week: number;
    avg_duration_seconds: number;
    total_sessions: number;
    engagement_level: 'high' | 'medium' | 'low';
}

interface UserEngagementMetricsProps {
    orgId?: string;
}

/**
 * UserEngagementMetrics - Admin dashboard component showing user engagement
 * 
 * Displays:
 * - Last active (relative time)
 * - Sessions this week
 * - Average session duration
 * - Engagement level badge
 */
export const UserEngagementMetrics: React.FC<UserEngagementMetricsProps> = ({ orgId }) => {
    const [metrics, setMetrics] = useState<UserMetrics[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchMetrics = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const url = orgId
                ? `/api/admin/usage-metrics?orgId=${orgId}`
                : '/api/admin/usage-metrics';

            const res = await fetch(url);
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to fetch metrics');
            }
            const data = await res.json();
            setMetrics(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchMetrics();
    }, [orgId]);

    // Format relative time
    const formatRelativeTime = (dateStr: string | null): string => {
        if (!dateStr) return 'Never';
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    // Format duration
    const formatDuration = (seconds: number): string => {
        if (!seconds) return '0m';
        const mins = Math.floor(seconds / 60);
        if (mins < 60) return `${mins}m`;
        const hours = Math.floor(mins / 60);
        const remMins = mins % 60;
        return `${hours}h ${remMins}m`;
    };

    // Engagement badge styles
    const getEngagementBadge = (level: string) => {
        switch (level) {
            case 'high':
                return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'medium':
                return 'bg-amber-100 text-amber-700 border-amber-200';
            default:
                return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12">
                <p className="text-red-500 mb-4">{error}</p>
                <button
                    onClick={fetchMetrics}
                    className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900">User Engagement</h2>
                    <p className="text-sm text-slate-500">App usage analytics for your team</p>
                </div>
                <button
                    onClick={fetchMetrics}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white border border-slate-200 rounded-xl p-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center">
                            <Users className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">{metrics.length}</p>
                            <p className="text-xs text-slate-500">Total Users</p>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-white border border-slate-200 rounded-xl p-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">
                                {metrics.filter(m => m.engagement_level === 'high').length}
                            </p>
                            <p className="text-xs text-slate-500">Highly Engaged</p>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white border border-slate-200 rounded-xl p-4"
                >
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-purple-50 rounded-lg flex items-center justify-center">
                            <Activity className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-slate-900">
                                {metrics.reduce((sum, m) => sum + m.sessions_this_week, 0)}
                            </p>
                            <p className="text-xs text-slate-500">Sessions This Week</p>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* User Table */}
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full">
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">User</th>
                            <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Last Active</th>
                            <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Sessions/Week</th>
                            <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Avg Duration</th>
                            <th className="text-center px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Engagement</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {metrics.map((user, index) => (
                            <motion.tr
                                key={user.user_id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: index * 0.05 }}
                                className="hover:bg-slate-50 transition-colors"
                            >
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center text-slate-600 font-bold text-xs">
                                            {user.full_name?.[0]?.toUpperCase() || 'U'}
                                        </div>
                                        <div>
                                            <p className="text-sm font-medium text-slate-900">{user.full_name || 'Unknown'}</p>
                                            <p className="text-xs text-slate-500">{user.email}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5 text-sm text-slate-600">
                                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                                        {formatRelativeTime(user.last_active)}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className="text-sm font-medium text-slate-900">{user.sessions_this_week}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className="text-sm text-slate-600">{formatDuration(user.avg_duration_seconds)}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                    <span className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-full border capitalize ${getEngagementBadge(user.engagement_level)}`}>
                                        {user.engagement_level}
                                    </span>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>

                {metrics.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        No user activity data available yet.
                    </div>
                )}
            </div>
        </div>
    );
};

export default UserEngagementMetrics;
