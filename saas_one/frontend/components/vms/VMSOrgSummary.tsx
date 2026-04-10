/**
 * VMSOrgSummary
 * Aggregated visitor management statistics for an organization.
 * Displays property-level check-in/out counts, total visitors, and trends.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Users, Building2, Clock, LogIn, LogOut, FileDown, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

interface VMSOrgSummaryProps {
    orgId: string;
}

interface PropertyStats {
    property_id: string;
    property_name: string;
    property_code: string;
    today: number;
    this_week: number;
    checked_in: number;
    checked_out: number;
    total: number;
}

const VMSOrgSummary: React.FC<VMSOrgSummaryProps> = ({ orgId }) => {
    const [isLoading, setIsLoading] = useState(true);
    const [summary, setSummary] = useState<any>(null);
    const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');

    useEffect(() => {
        fetchSummary();
    }, [orgId, period]);

    const fetchSummary = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/organizations/${orgId}/vms-summary?period=${period}`);
            const data = await response.json();
            setSummary(data);
        } catch (err) {
            console.error('Error fetching VMS summary:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExport = () => {
        if (!summary?.properties) return;

        const headers = ['Property', 'Today', 'This Week', 'Checked In', 'Checked Out'];
        const rows = summary.properties.map((p: PropertyStats) => [
            p.property_name,
            p.today,
            p.this_week,
            p.checked_in,
            p.checked_out,
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map((e: any) => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `vms_summary_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-zinc-800 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-4xl font-black text-white tracking-widest italic uppercase mb-2">Visitors</h2>
                    <p className="text-zinc-500 text-sm font-medium uppercase tracking-[0.2em]">Cross-Property Visitor Analytics</p>
                </div>
                <div className="flex gap-2">
                    {(['today', 'week', 'month'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${p === period ? 'bg-white text-black border-white' : 'text-zinc-500 border-zinc-800 hover:border-zinc-600'
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: 'Total Visitors', value: summary?.total_visitors || 0, icon: Users, color: 'text-blue-500' },
                    { label: 'Currently In', value: summary?.total_checked_in || 0, icon: LogIn, color: 'text-emerald-500' },
                    { label: 'Checked Out', value: summary?.total_checked_out || 0, icon: LogOut, color: 'text-rose-500' },
                    { label: 'Properties', value: summary?.properties?.length || 0, icon: Building2, color: 'text-indigo-500' },
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-zinc-900/30 border border-zinc-800/50 p-6 rounded-3xl backdrop-blur-sm group"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-12 h-12 bg-zinc-950 border border-zinc-800 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                        </div>
                        <h3 className="text-3xl font-black text-white tracking-widest mb-1 italic">{stat.value}</h3>
                        <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">{stat.label}</p>
                    </motion.div>
                ))}
            </div>

            {/* Property Breakdown Table */}
            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-[40px] overflow-hidden">
                <div className="p-8 border-b border-zinc-800/50 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black text-white italic">All Properties</h3>
                        <p className="text-zinc-500 text-xs font-medium mt-1 uppercase tracking-widest">Visitor distribution</p>
                    </div>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-950 text-zinc-400 border border-zinc-800 rounded-xl text-sm font-bold hover:text-white hover:border-zinc-600 transition-all"
                    >
                        <FileDown className="w-4 h-4" /> Export
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-zinc-950/50 border-b border-zinc-800/50">
                            <tr>
                                <th className="px-8 py-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest">Property</th>
                                <th className="px-8 py-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest text-center">Today</th>
                                <th className="px-8 py-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest text-center">This Week</th>
                                <th className="px-8 py-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest text-center">Currently In</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {(!summary?.properties || summary.properties.length === 0) ? (
                                <tr>
                                    <td colSpan={4} className="px-8 py-12 text-center text-zinc-500 italic">No visitor data found.</td>
                                </tr>
                            ) : (
                                summary.properties.map((prop: PropertyStats) => (
                                    <tr key={prop.property_id} className="hover:bg-zinc-800/20 transition-colors">
                                        <td className="px-8 py-5">
                                            <p className="font-black text-white text-sm">{prop.property_name}</p>
                                            <p className="text-[10px] text-zinc-500 font-mono">{prop.property_code}</p>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className={`font-black text-lg ${prop.today > 0 ? 'text-blue-400' : 'text-zinc-600'}`}>
                                                {prop.today}
                                            </span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            <span className="font-black text-lg text-zinc-400">{prop.this_week}</span>
                                        </td>
                                        <td className="px-8 py-5 text-center">
                                            {prop.checked_in > 0 ? (
                                                <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-lg text-sm font-black border border-emerald-500/20">
                                                    <Clock className="w-3 h-3" /> {prop.checked_in}
                                                </span>
                                            ) : (
                                                <span className="text-zinc-600 font-bold">0</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default VMSOrgSummary;
