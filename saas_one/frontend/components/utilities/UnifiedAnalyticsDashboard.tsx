/**
 * UnifiedAnalyticsDashboard
 * Combined utilities analytics across diesel, electricity, and water.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    BarChart3, TrendingUp, Zap, Fuel, Download,
    Calendar, ChevronDown, IndianRupee, ArrowLeft,
    Layers, Grid3x3
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import UtilitiesSummaryTile from './UtilitiesSummaryTile';

interface TrendData {
    date: string;
    units: number;
    cost: number;
}

interface BreakdownItem {
    id: string;
    name: string;
    units: number;
    cost: number;
    meter_type?: string;
    make?: string;
    capacity_kva?: number;
}

interface SummaryData {
    totalUnits: number;
    totalCost: number;
    todayUnits: number;
    todayCost: number;
    unitLabel: string;
    loggingDate?: string;
}

interface AnalyticsData {
    electricity?: {
        summary: SummaryData;
        trends: TrendData[];
        breakdown: BreakdownItem[];
        readingCount: number;
    };
    diesel?: {
        summary: SummaryData;
        trends: TrendData[];
        breakdown: BreakdownItem[];
        readingCount: number;
    };
    combined?: {
        totalCost: number;
        todayCost: number;
        gridCost: number;
        dgCost: number;
    };
    period: { start: string; end: string; type: string };
}

interface UnifiedAnalyticsDashboardProps {
    propertyId?: string;
    isDark?: boolean;
}

/**
 * Unified Utilities Analytics Dashboard
 * PRD: Single analytics page, scope-driven
 * PRD: Combined + Meter-wise views
 * PRD: Today / 30-day toggle
 * PRD: Cost before units throughout
 */
const UnifiedAnalyticsDashboard: React.FC<UnifiedAnalyticsDashboardProps> = ({
    propertyId: propIdFromProps,
    isDark = false
}) => {
    const params = useParams();
    const router = useRouter();
    const propertyId = propIdFromProps || (params?.propertyId as string);

    // State
    const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // View controls
    const [period, setPeriod] = useState<'today' | 'month'>('month');
    const [scope, setScope] = useState<'combined' | 'meter-wise'>('combined');
    const [activeUtility, setActiveUtility] = useState<'electricity' | 'diesel' | 'combined'>('combined');

    // Fetch analytics data
    const fetchAnalytics = useCallback(async () => {
        if (!propertyId) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(
                `/api/properties/${propertyId}/utilities-analytics?type=combined&period=${period}&scope=${scope}`
            );

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to fetch analytics');
            }

            const data = await res.json();
            setAnalyticsData(data);
        } catch (err: any) {
            console.error('[AnalyticsDashboard] Error:', err.message);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [propertyId, period, scope]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    // Export to CSV
    const handleExport = async () => {
        const today = new Date().toISOString().split('T')[0];
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const startDate = period === 'today' ? today : monthAgo;

        window.open(
            `/api/properties/${propertyId}/electricity-export?startDate=${startDate}&endDate=${today}`,
            '_blank'
        );
    };

    // Format currency
    const formatCurrency = (amount: number) => {
        if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
        if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
        return `₹${amount.toFixed(0)}`;
    };

    // No property selected
    if (!propertyId) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <BarChart3 className="w-16 h-16 text-primary/20 mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">Select a Property</h3>
                <p className="text-slate-500 text-center max-w-md">
                    Please select a property to view utilities analytics.
                </p>
            </div>
        );
    }

    // Get current utility data based on activeUtility
    const getCurrentData = () => {
        if (activeUtility === 'electricity') return analyticsData?.electricity;
        if (activeUtility === 'diesel') return analyticsData?.diesel;
        return null;
    };

    const currentData = getCurrentData();

    return (
        <div className={`min-h-screen ${isDark ? 'bg-[#0d1117]' : 'bg-slate-50'} pb-8`}>
            {/* Header */}
            <header className={`sticky top-0 z-30 w-full border-b ${isDark ? 'border-[#21262d] bg-[#161b22]/90' : 'border-slate-200 bg-white/90'} backdrop-blur-lg`}>
                <div className="px-4 sm:px-6 lg:px-8 py-4 mx-auto max-w-[1440px]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => router.back()}
                                className={`${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'} p-2 rounded-lg transition-colors`}
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <div>
                                <h1 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'} tracking-tight`}>
                                    Utilities Analytics
                                </h1>
                                <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {period === 'today' ? "Today's consumption" : 'Last 30 days overview'}
                                </p>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-3">
                            {/* Scope Toggle */}
                            <div className={`flex rounded-lg p-1 ${isDark ? 'bg-[#0d1117] border-[#21262d]' : 'bg-slate-100 border-slate-200'} border`}>
                                <button
                                    onClick={() => setScope('combined')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${scope === 'combined'
                                            ? 'bg-primary text-white shadow-sm'
                                            : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                >
                                    <Layers className="w-3.5 h-3.5" />
                                    Combined
                                </button>
                                <button
                                    onClick={() => setScope('meter-wise')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${scope === 'meter-wise'
                                            ? 'bg-primary text-white shadow-sm'
                                            : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                        }`}
                                >
                                    <Grid3x3 className="w-3.5 h-3.5" />
                                    Meter-wise
                                </button>
                            </div>

                            <button
                                onClick={handleExport}
                                className={`flex items-center gap-2 px-4 py-2 text-sm font-bold ${isDark ? 'text-slate-300 bg-[#161b22] border-[#30363d] hover:bg-[#21262d]' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'} rounded-lg transition-colors border`}
                            >
                                <Download className="w-4 h-4" />
                                Export
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Error State */}
                {error && (
                    <div className={`${isDark ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700'} mb-6 px-4 py-3 rounded-xl flex items-center gap-2 border`}>
                        {error}
                    </div>
                )}

                {/* Summary Hero Tile */}
                <div className="mb-8">
                    <UtilitiesSummaryTile
                        electricityData={analyticsData?.electricity?.summary}
                        dieselData={analyticsData?.diesel?.summary}
                        period={period}
                        onPeriodChange={setPeriod}
                        onTypeClick={setActiveUtility}
                        isDark={isDark}
                        isLoading={isLoading}
                    />
                </div>

                {/* Utility Type Tabs */}
                <div className="flex mb-6">
                    <div className={`flex rounded-xl p-1.5 ${isDark ? 'bg-[#161b22] border-[#21262d]' : 'bg-white border-slate-200'} border shadow-sm`}>
                        <button
                            onClick={() => setActiveUtility('combined')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeUtility === 'combined'
                                    ? 'bg-primary text-white shadow'
                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                }`}
                        >
                            <BarChart3 className="w-4 h-4" />
                            Combined
                        </button>
                        <button
                            onClick={() => setActiveUtility('electricity')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeUtility === 'electricity'
                                    ? 'bg-amber-500 text-white shadow'
                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                }`}
                        >
                            <Zap className="w-4 h-4" />
                            Electricity
                        </button>
                        <button
                            onClick={() => setActiveUtility('diesel')}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${activeUtility === 'diesel'
                                    ? 'bg-emerald-500 text-white shadow'
                                    : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                }`}
                        >
                            <Fuel className="w-4 h-4" />
                            Diesel
                        </button>
                    </div>
                </div>

                {/* Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Trends Chart */}
                    <div className={`lg:col-span-2 ${isDark ? 'bg-[#161b22] border-[#21262d]' : 'bg-white border-slate-200'} rounded-2xl p-6 border shadow-sm`}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {activeUtility === 'combined' ? 'Cost Trends' : 'Consumption Trends'}
                            </h3>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    {analyticsData?.period?.start} - {analyticsData?.period?.end}
                                </span>
                            </div>
                        </div>

                        {/* Simple Trend Bars */}
                        <div className="h-64 flex items-end justify-between gap-2 px-4">
                            {isLoading ? (
                                Array.from({ length: 10 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className={`flex-1 ${isDark ? 'bg-[#21262d]' : 'bg-slate-100'} rounded-t animate-pulse`}
                                        style={{ height: `${20 + Math.random() * 60}%` }}
                                    />
                                ))
                            ) : activeUtility === 'combined' ? (
                                // Combined trends (both stacked)
                                <>
                                    {(analyticsData?.electricity?.trends || []).slice(-15).map((e, i) => {
                                        const d = analyticsData?.diesel?.trends?.[i];
                                        const totalCost = e.cost + (d?.cost || 0);
                                        const maxCost = Math.max(
                                            ...(analyticsData?.electricity?.trends || []).map((x, j) =>
                                                x.cost + (analyticsData?.diesel?.trends?.[j]?.cost || 0)
                                            )
                                        );
                                        const height = maxCost > 0 ? (totalCost / maxCost) * 100 : 0;
                                        const gridHeight = maxCost > 0 ? (e.cost / maxCost) * 100 : 0;

                                        return (
                                            <motion.div
                                                key={e.date}
                                                initial={{ height: 0 }}
                                                animate={{ height: `${height}%` }}
                                                transition={{ duration: 0.3, delay: i * 0.02 }}
                                                className="flex-1 flex flex-col justify-end rounded-t overflow-hidden group cursor-pointer"
                                                title={`${e.date}: ₹${totalCost.toFixed(0)}`}
                                            >
                                                <div
                                                    className="bg-amber-400 group-hover:bg-amber-500 transition-colors"
                                                    style={{ height: `${(gridHeight / height) * 100}%` }}
                                                />
                                                <div
                                                    className="bg-emerald-500 group-hover:bg-emerald-600 transition-colors flex-1"
                                                />
                                            </motion.div>
                                        );
                                    })}
                                </>
                            ) : (
                                // Single utility trends
                                (currentData?.trends || []).slice(-15).map((t, i) => {
                                    const max = Math.max(...(currentData?.trends || []).map(x => x.cost));
                                    const height = max > 0 ? (t.cost / max) * 100 : 0;
                                    const color = activeUtility === 'electricity' ? 'bg-amber-400 hover:bg-amber-500' : 'bg-emerald-500 hover:bg-emerald-600';

                                    return (
                                        <motion.div
                                            key={t.date}
                                            initial={{ height: 0 }}
                                            animate={{ height: `${height}%` }}
                                            transition={{ duration: 0.3, delay: i * 0.02 }}
                                            className={`flex-1 ${color} rounded-t cursor-pointer transition-colors`}
                                            title={`${t.date}: ₹${t.cost.toFixed(0)} | ${t.units.toFixed(0)} units`}
                                        />
                                    );
                                })
                            )}
                        </div>

                        {/* X-axis labels */}
                        <div className="flex justify-between mt-2 px-4">
                            <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                {analyticsData?.period?.start}
                            </span>
                            <span className={`text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                {analyticsData?.period?.end}
                            </span>
                        </div>
                    </div>

                    {/* Breakdown List */}
                    <div className={`${isDark ? 'bg-[#161b22] border-[#21262d]' : 'bg-white border-slate-200'} rounded-2xl p-6 border shadow-sm`}>
                        <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'} mb-4`}>
                            {activeUtility === 'electricity' ? 'Meter Breakdown' :
                                activeUtility === 'diesel' ? 'Generator Breakdown' :
                                    'Utility Breakdown'}
                        </h3>

                        {isLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className={`h-16 ${isDark ? 'bg-[#21262d]' : 'bg-slate-100'} rounded-lg animate-pulse`} />
                                ))}
                            </div>
                        ) : activeUtility === 'combined' ? (
                            <div className="space-y-3">
                                {/* Grid Summary */}
                                <div className={`p-4 rounded-xl ${isDark ? 'bg-amber-500/10 border-amber-500/20' : 'bg-amber-50 border-amber-200'} border`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-amber-500/20">
                                                <Zap className="w-5 h-5 text-amber-500" />
                                            </div>
                                            <div>
                                                <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Grid Power</p>
                                                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                    {analyticsData?.electricity?.summary?.totalUnits?.toFixed(0) || 0} kVAh
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-xl font-black text-amber-500">
                                            {formatCurrency(analyticsData?.combined?.gridCost || 0)}
                                        </span>
                                    </div>
                                </div>

                                {/* DG Summary */}
                                <div className={`p-4 rounded-xl ${isDark ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'} border`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-emerald-500/20">
                                                <Fuel className="w-5 h-5 text-emerald-500" />
                                            </div>
                                            <div>
                                                <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>DG Power</p>
                                                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                    {analyticsData?.diesel?.summary?.totalUnits?.toFixed(0) || 0} Litres
                                                </p>
                                            </div>
                                        </div>
                                        <span className="text-xl font-black text-emerald-500">
                                            {formatCurrency(analyticsData?.combined?.dgCost || 0)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-80 overflow-y-auto">
                                {(currentData?.breakdown || []).map((item, i) => (
                                    <motion.div
                                        key={item.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.05 }}
                                        className={`p-4 rounded-xl ${isDark ? 'bg-[#0d1117] border-[#21262d]' : 'bg-slate-50 border-slate-100'} border`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.name}</p>
                                                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                    {item.units.toFixed(0)} {activeUtility === 'electricity' ? 'kVAh' : 'L'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <IndianRupee className={`w-4 h-4 ${activeUtility === 'electricity' ? 'text-amber-500' : 'text-emerald-500'}`} />
                                                <span className={`text-lg font-black ${activeUtility === 'electricity' ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                    {item.cost.toFixed(0)}
                                                </span>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}

                                {(currentData?.breakdown || []).length === 0 && (
                                    <p className={`text-center py-8 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                        No data available
                                    </p>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default UnifiedAnalyticsDashboard;
