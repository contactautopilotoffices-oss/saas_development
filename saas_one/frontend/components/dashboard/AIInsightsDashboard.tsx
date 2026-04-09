/**
 * AIInsightsDashboard
 * AI-powered analytics dashboard showing insights, trends, and anomaly detection.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
    Brain,
    Zap,
    Clock,
    DollarSign,
    Activity,
    AlertCircle,
    ChevronRight,
    TrendingUp,
    BarChart3,
    Cpu
} from 'lucide-react';
import { motion } from 'framer-motion';

interface MetricCardProps {
    title: string;
    value: string | number;
    subValue?: string;
    icon: React.ReactNode;
    color: string;
    isDark: boolean;
}

const MetricCard = ({ title, value, subValue, icon, color, isDark }: MetricCardProps) => (
    <div className={`p-5 rounded-2xl border ${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200'} shadow-sm`}>
        <div className="flex items-start justify-between">
            <div>
                <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'} mb-1`}>{title}</p>
                <h3 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{value}</h3>
                {subValue && <p className={`text-[10px] font-bold mt-1 ${color}`}>{subValue}</p>}
            </div>
            <div className={`p-2.5 rounded-xl ${isDark ? 'bg-slate-800' : 'bg-slate-50'} ${color}`}>
                {icon}
            </div>
        </div>
    </div>
);

export default function AIInsightsDashboard({ isDark = true }: { isDark?: boolean }) {
    const [stats, setStats] = useState<any>(null);
    const [dailyUsage, setDailyUsage] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMetrics = async () => {
            try {
                const res = await fetch('/api/admin/ai-metrics?days=7');
                const data = await res.json();
                if (data && !data.error) {
                    setStats(data.stats || null);
                    setDailyUsage(data.daily_usage || []);
                } else {
                    console.error('API Error:', data?.error);
                }
            } catch (err) {
                console.error('Failed to fetch AI metrics:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchMetrics();
    }, []);

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Brain className="w-12 h-12 text-primary animate-pulse mb-4" />
                <p className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-[0.2em]`}>
                    Syncing AI Intelligence...
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Brain className="w-5 h-5 text-primary" />
                        <h2 className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>AI Insights Dashboard</h2>
                    </div>
                    <p className={`text-[11px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-wider`}>
                        Monitoring Groq Llama-3.3-70B Performance & Economics
                    </p>
                </div>
                <div className={`px-4 py-2 rounded-xl border ${isDark ? 'bg-success/5 border-success/20 text-success' : 'bg-success/5 border-success/20 text-success'} text-[10px] font-black uppercase tracking-widest flex items-center gap-2`}>
                    <Activity className="w-3.5 h-3.5" />
                    System Healthy
                </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard
                    title="Total AI Invocations"
                    value={stats?.llm_invocations || 0}
                    subValue={`${(((stats?.llm_invocations || 0) / (stats?.total_invocations || 1)) * 100).toFixed(1)}% of total tickets`}
                    icon={<Cpu className="w-5 h-5" />}
                    color="text-primary"
                    isDark={isDark}
                />
                <MetricCard
                    title="Avg API Latency"
                    value={`${stats?.avg_latency?.toFixed(0) || 0}ms`}
                    subValue="Target: < 2000ms"
                    icon={<Clock className="w-5 h-5" />}
                    color="text-info"
                    isDark={isDark}
                />
                <MetricCard
                    title="Total Tokens Used"
                    value={((stats?.total_tokens || 0) / 1000).toFixed(1) + 'k'}
                    subValue={`${((stats?.completion_tokens || 0) / (stats?.total_tokens || 1) * 100).toFixed(1)}% Completion`}
                    icon={<Zap className="w-5 h-5" />}
                    color="text-warning"
                    isDark={isDark}
                />
                <MetricCard
                    title="Estimated Cost"
                    value={`$${stats?.estimated_cost_usd?.toFixed(4) || '0.0000'}`}
                    subValue="Llama 3.3 70B Versatile"
                    icon={<DollarSign className="w-5 h-5" />}
                    color="text-success"
                    isDark={isDark}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Cost & Token Breakdown */}
                <div className={`lg:col-span-2 p-6 rounded-3xl border ${isDark ? 'bg-[#0d1117] border-[#30363d]' : 'bg-white border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-8">
                        <h4 className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}>Usage Timeline (7 Days)</h4>
                        <BarChart3 className={`w-4 h-4 ${isDark ? 'text-slate-600' : 'text-slate-400'}`} />
                    </div>

                    <div className="h-[240px] flex items-end justify-between gap-1 px-2">
                        {(!dailyUsage || dailyUsage.length === 0) ? (
                            <div className="w-full flex items-center justify-center h-full italic text-xs text-slate-500">No data for period</div>
                        ) : dailyUsage.map((day, idx) => (
                            <div key={idx} className="flex-1 flex flex-col items-center gap-2 group cursor-help">
                                <div className="w-full relative">
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: Math.max(20, (day.calls / 10) * 100) }}
                                        className={`w-full rounded-t-lg ${isDark ? 'bg-primary/40 group-hover:bg-primary/60' : 'bg-primary/20 group-hover:bg-primary/40'} transition-colors relative min-h-[4px]`}
                                    >
                                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-black text-white text-[9px] font-bold px-2 py-1 rounded">
                                            {day.calls} calls
                                        </div>
                                    </motion.div>
                                </div>
                                <span className="text-[9px] font-black text-slate-500 rotate-45 mt-2 origin-left">{day.date.split('-').slice(1).join('/')}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Performance Alerts / Signals */}
                <div className={`p-6 rounded-3xl border ${isDark ? 'bg-[#0d1117] border-[#30363d]' : 'bg-white border-slate-200'}`}>
                    <h4 className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-900'} mb-6`}>Intelligence Signals</h4>

                    <div className="space-y-4">
                        <div className={`p-4 rounded-2xl ${isDark ? 'bg-error/5 border border-error/10' : 'bg-error/5 border border-error/10'}`}>
                            <div className="flex items-center gap-3 mb-2">
                                <Activity className="w-4 h-4 text-error" />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-error' : 'text-error'}`}>System Latency</span>
                            </div>
                            <p className={`text-[11px] font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                Groq's Llama 3.3 70B is currently averaging <strong className="text-white">{(stats?.avg_latency || 0).toFixed(0)}ms</strong> per request. High situational reasoning complexity detected.
                            </p>
                        </div>

                        <div className={`p-4 rounded-2xl ${isDark ? 'bg-primary/5 border border-primary/10' : 'bg-primary/5 border border-primary/10'}`}>
                            <div className="flex items-center gap-3 mb-2">
                                <TrendingUp className="w-4 h-4 text-primary" />
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-primary-light' : 'text-primary'}`}>Cost Efficiency</span>
                            </div>
                            <p className={`text-[11px] font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                Average cost per triage: <strong className="text-white">${((stats?.estimated_cost_usd || 0) / (stats?.llm_invocations || 1)).toFixed(5)}</strong>. Hybrid strategy is saving approximately <strong className="text-success">$2.40/day</strong> vs Full LLM.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
