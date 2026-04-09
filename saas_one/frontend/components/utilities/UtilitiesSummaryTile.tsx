/**
 * UtilitiesSummaryTile
 * Summary tile showing utility consumption and costs.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { Zap, Fuel, TrendingUp, TrendingDown, IndianRupee, Calendar, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

interface SummaryData {
    totalUnits: number;
    totalCost: number;
    todayUnits: number;
    todayCost: number;
    unitLabel: string;
}

interface UtilitiesSummaryTileProps {
    electricityData?: SummaryData | null;
    dieselData?: SummaryData | null;
    period: 'today' | 'month'; // PRD: Today / 30-day toggle
    onPeriodChange?: (period: 'today' | 'month') => void;
    onTypeClick?: (type: 'electricity' | 'diesel' | 'combined') => void;
    isDark?: boolean;
    isLoading?: boolean;
}

/**
 * Unified Utilities Summary Tile
 * PRD: Single analytics page, scope-driven
 * PRD: Grid (₹) + DG (₹) = Total (₹)
 * PRD: Cost shown before units
 */
const UtilitiesSummaryTile: React.FC<UtilitiesSummaryTileProps> = ({
    electricityData,
    dieselData,
    period,
    onPeriodChange,
    onTypeClick,
    isDark = false,
    isLoading = false
}) => {
    // Calculate combined totals
    const gridCost = electricityData?.totalCost || 0;
    const dgCost = dieselData?.totalCost || 0;
    const totalCost = gridCost + dgCost;

    const gridTodayCost = electricityData?.todayCost || 0;
    const dgTodayCost = dieselData?.todayCost || 0;
    const todayTotalCost = gridTodayCost + dgTodayCost;

    // Percentage breakdown
    const gridPercent = totalCost > 0 ? Math.round((gridCost / totalCost) * 100) : 0;
    const dgPercent = totalCost > 0 ? Math.round((dgCost / totalCost) * 100) : 0;

    const formatCurrency = (amount: number) => {
        if (amount >= 100000) {
            return `${(amount / 100000).toFixed(1)}L`;
        } else if (amount >= 1000) {
            return `${(amount / 1000).toFixed(1)}K`;
        }
        return amount.toFixed(0);
    };

    if (isLoading) {
        return (
            <div className={`${isDark ? 'bg-[#161b22] border-[#21262d]' : 'bg-white border-slate-200'} rounded-2xl p-6 border animate-pulse`}>
                <div className={`h-8 ${isDark ? 'bg-[#21262d]' : 'bg-slate-100'} rounded w-1/3 mb-4`} />
                <div className={`h-16 ${isDark ? 'bg-[#21262d]' : 'bg-slate-100'} rounded w-full mb-4`} />
                <div className={`h-4 ${isDark ? 'bg-[#21262d]' : 'bg-slate-100'} rounded w-2/3`} />
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${isDark ? 'bg-gradient-to-br from-[#161b22] to-[#0d1117] border-[#21262d]' : 'bg-gradient-to-br from-white to-slate-50 border-slate-200'} rounded-2xl shadow-lg border overflow-hidden`}
        >
            {/* Header */}
            <div className="p-6 pb-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <div className={`p-2 rounded-xl ${isDark ? 'bg-primary/10' : 'bg-primary/10'}`}>
                            <BarChart3 className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Utilities Overview</h2>
                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                {period === 'today' ? "Today's Consumption" : 'Last 30 Days'}
                            </p>
                        </div>
                    </div>

                    {/* Period Toggle */}
                    {onPeriodChange && (
                        <div className={`flex rounded-lg p-1 ${isDark ? 'bg-[#0d1117] border-[#21262d]' : 'bg-slate-100 border-slate-200'} border`}>
                            <button
                                onClick={() => onPeriodChange('today')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${period === 'today'
                                        ? 'bg-primary text-white shadow-sm'
                                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                    }`}
                            >
                                Today
                            </button>
                            <button
                                onClick={() => onPeriodChange('month')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${period === 'month'
                                        ? 'bg-primary text-white shadow-sm'
                                        : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                                    }`}
                            >
                                30 Days
                            </button>
                        </div>
                    )}
                </div>

                {/* Hero: Total Cost */}
                <div className="text-center py-4">
                    <p className={`text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-wide mb-1`}>
                        Total Cost ({period === 'today' ? 'Today' : '30 Days'})
                    </p>
                    <div className="flex items-center justify-center gap-2">
                        <IndianRupee className={`w-8 h-8 ${isDark ? 'text-primary' : 'text-primary'}`} />
                        <span className={`text-5xl font-black ${isDark ? 'text-white' : 'text-slate-900'} tracking-tight`}>
                            {formatCurrency(period === 'today' ? todayTotalCost : totalCost)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Cost Breakdown Bar */}
            <div className="px-6 pb-4">
                <div className={`h-3 rounded-full overflow-hidden flex ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`}>
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${gridPercent}%` }}
                        transition={{ duration: 0.5, delay: 0.2 }}
                        className="bg-amber-400 h-full"
                        title={`Grid: ${gridPercent}%`}
                    />
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${dgPercent}%` }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                        className="bg-emerald-500 h-full"
                        title={`DG: ${dgPercent}%`}
                    />
                </div>
                <div className="flex justify-between mt-2 text-xs">
                    <span className={`flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <span className="w-2 h-2 rounded-full bg-amber-400" />
                        Grid: {gridPercent}%
                    </span>
                    <span className={`flex items-center gap-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        DG: {dgPercent}%
                    </span>
                </div>
            </div>

            {/* Grid & DG Breakdown Cards */}
            <div className="grid grid-cols-2 gap-0 border-t border-border">
                {/* Electricity (Grid) */}
                <button
                    onClick={() => onTypeClick?.('electricity')}
                    className={`p-5 text-left transition-all hover:bg-primary/5 ${isDark ? 'border-r border-[#21262d]' : 'border-r border-slate-100'}`}
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div className={`p-1.5 rounded-lg ${isDark ? 'bg-amber-500/10' : 'bg-amber-50'}`}>
                            <Zap className="w-4 h-4 text-amber-500" />
                        </div>
                        <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Grid Power</span>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-1">
                            <IndianRupee className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                            <span className={`text-2xl font-black ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                                {formatCurrency(period === 'today' ? gridTodayCost : gridCost)}
                            </span>
                        </div>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {electricityData?.totalUnits?.toFixed(0) || 0} {electricityData?.unitLabel || 'kVAh'}
                        </p>
                    </div>
                </button>

                {/* Diesel (DG) */}
                <button
                    onClick={() => onTypeClick?.('diesel')}
                    className="p-5 text-left transition-all hover:bg-primary/5"
                >
                    <div className="flex items-center gap-2 mb-3">
                        <div className={`p-1.5 rounded-lg ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
                            <Fuel className="w-4 h-4 text-emerald-500" />
                        </div>
                        <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>DG Power</span>
                    </div>
                    <div className="space-y-1">
                        <div className="flex items-center gap-1">
                            <IndianRupee className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
                            <span className={`text-2xl font-black ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                                {formatCurrency(period === 'today' ? dgTodayCost : dgCost)}
                            </span>
                        </div>
                        <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                            {dieselData?.totalUnits?.toFixed(0) || 0} {dieselData?.unitLabel || 'Litres'}
                        </p>
                    </div>
                </button>
            </div>
        </motion.div>
    );
};

export default UtilitiesSummaryTile;
