'use client';

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, Filter, Search, Download, Trash2 } from 'lucide-react';
import { createClient } from '@/frontend/utils/supabase/client';

interface ElectricityReadingHistoryProps {
    propertyId: string;
    isDark?: boolean;
    onBack: () => void;
    onDeleteSuccess?: () => void;
}

interface ReadingLog {
    id: string;
    reading_date: string;
    opening_reading: number;
    closing_reading: number;
    computed_units: number;
    final_units?: number;
    meter: {
        id: string;
        name: string;
        meter_number: string;
    };
    notes?: string;
    computed_cost?: number;
    created_at: string;
    creator?: {
        full_name: string;
    };
}

interface Meter {
    id: string;
    name: string;
    meter_number?: string;
}

const ElectricityReadingHistory: React.FC<ElectricityReadingHistoryProps> = ({
    propertyId,
    isDark = false,
    onBack,
    onDeleteSuccess
}) => {
    const supabase = createClient();

    const [readings, setReadings] = useState<ReadingLog[]>([]);
    const [meters, setMeters] = useState<Meter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Filters
    const [selectedMeterId, setSelectedMeterId] = useState<string>('all');
    const [startDate, setStartDate] = useState(
        new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]
    );
    const [endDate, setEndDate] = useState(
        new Date().toISOString().split('T')[0]
    );

    // Unified Data Fetching
    useEffect(() => {
        const loadHistory = async () => {
            setIsLoading(true);
            try {
                // 1. Fetch Meters
                const { data: metersData, error: metersError } = await supabase
                    .from('electricity_meters')
                    .select('id, name, meter_number')
                    .eq('property_id', propertyId)
                    .is('deleted_at', null);

                if (metersError) throw metersError;

                const currentMeters = metersData || [];
                setMeters(currentMeters);

                // If no meters, no readings to show
                if (currentMeters.length === 0) {
                    setReadings([]);
                    setIsLoading(false);
                    return;
                }

                // 2. Fetch Readings (filtered by these meters)
                const meterIds = currentMeters.map(m => m.id);

                let query = supabase
                    .from('electricity_readings')
                    .select(`
                        id, reading_date, opening_reading, closing_reading, computed_units, final_units, notes, computed_cost, created_at,
                        meter:electricity_meters(id, name, meter_number),
                        creator:users!created_by(full_name)
                    `)
                    .in('meter_id', meterIds)
                    .gte('reading_date', startDate)
                    .lte('reading_date', endDate)
                    .order('reading_date', { ascending: false });

                if (selectedMeterId !== 'all') {
                    query = query.eq('meter_id', selectedMeterId);
                }

                const { data: readingsData, error: readingsError } = await query;
                if (readingsError) throw readingsError;

                setReadings(readingsData as any || []);

            } catch (err) {
                console.error('Failed to load history:', err);
            } finally {
                setIsLoading(false);
            }
        };

        loadHistory();
    }, [propertyId, startDate, endDate, selectedMeterId, supabase]);

    // Export Handler
    const handleExport = () => {
        let url = `/api/properties/${propertyId}/electricity-export?startDate=${startDate}&endDate=${endDate}`;
        if (selectedMeterId !== 'all') {
            url += `&meterId=${selectedMeterId}`;
        }
        window.open(url, '_blank');
    };

    // Delete reading
    const handleDeleteReading = async (id: string) => {
        if (!confirm('Are you sure you want to delete this reading entry?')) {
            return;
        }

        setDeletingId(id);
        try {
            const res = await fetch(`/api/properties/${propertyId}/electricity-readings?id=${id}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to delete reading');
            }

            // Refresh the list locally
            setReadings(prev => prev.filter(r => r.id !== id));
            if (onDeleteSuccess) onDeleteSuccess();

        } catch (err: any) {
            console.error('Delete error:', err);
            alert(err.message || 'Failed to delete reading');
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className={`min-h-screen flex flex-col ${isDark ? 'bg-[#0d1117] text-slate-300' : 'bg-slate-50 text-slate-600'}`}>
            {/* Header */}
            <div className={`sticky top-0 z-10 px-4 py-4 border-b ${isDark ? 'bg-[#161b22]/90 border-[#30363d]' : 'bg-white/90 border-slate-200'} backdrop-blur-md`}>
                <div className="max-w-[1600px] mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className={`p-2 rounded-full ${isDark ? 'hover:bg-[#30363d]' : 'hover:bg-slate-100'} transition-colors`}
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                        <div>
                            <h1 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Reading History</h1>
                            <p className="text-xs font-medium opacity-70">View past electricity logs</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-3">
                        {/* Meter Selector */}
                        <div className="relative">
                            <select
                                value={selectedMeterId}
                                onChange={(e) => setSelectedMeterId(e.target.value)}
                                className={`appearance-none pl-9 pr-8 py-2 text-sm font-bold rounded-lg border ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-white border-slate-200 text-slate-700'} focus:ring-2 focus:ring-primary/20 outline-none`}
                            >
                                <option value="all">All Meters</option>
                                {meters.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                            <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                        </div>

                        {/* Date Range */}
                        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isDark ? 'bg-[#0d1117] border-[#30363d]' : 'bg-white border-slate-200'}`}>
                            <Calendar className="w-4 h-4 opacity-50" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className={`text-sm font-bold bg-transparent outline-none w-28 ${isDark ? 'text-white' : 'text-slate-700'}`}
                            />
                            <span className="opacity-30">to</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className={`text-sm font-bold bg-transparent outline-none w-28 ${isDark ? 'text-white' : 'text-slate-700'}`}
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </div>

                        {/* Export Button */}
                        <button
                            onClick={handleExport}
                            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg border transition-colors ${isDark
                                ? 'bg-[#21262d] border-[#30363d] text-white hover:bg-[#30363d]'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                }`}
                        >
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export CSV</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-[1600px] mx-auto px-4 py-8 flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="text-center py-20 opacity-50">Loading history...</div>
                ) : readings.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Search className="w-8 h-8 text-slate-400" />
                        </div>
                        <h3 className="text-lg font-bold">No readings found</h3>
                        <p className="text-sm opacity-70">Try adjusting the filters</p>
                    </div>
                ) : (
                    <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200 shadow-sm'}`}>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className={`text-[10px] font-black uppercase tracking-[0.2em] border-b ${isDark ? 'bg-[#0d1117] text-slate-500 border-[#30363d]' : 'bg-slate-50/50 text-slate-500 border-slate-200'}`}>
                                    <tr>
                                        <th className="px-6 py-4">Date</th>
                                        <th className="px-6 py-4">Meter Name</th>
                                        <th className="px-6 py-4 text-right">Opening</th>
                                        <th className="px-6 py-4 text-right">Closing</th>
                                        <th className="px-6 py-4 text-right">Diff (Raw)</th>
                                        <th className="px-6 py-4 text-right">Factor</th>
                                        <th className="px-6 py-4 text-right">Total (Multiplied)</th>
                                        <th className="px-6 py-4 text-right">Cost</th>
                                        <th className="px-6 py-4">Notes</th>
                                        <th className="px-6 py-4 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className={`divide-y ${isDark ? 'divide-[#30363d]' : 'divide-slate-100'}`}>
                                    {readings.map((log) => (
                                        <tr key={log.id} className={`transition-colors ${isDark ? 'hover:bg-[#0d1117]' : 'hover:bg-slate-50'}`}>
                                            <td className="px-6 py-4 font-medium whitespace-nowrap">
                                                <div className="flex flex-col">
                                                    <span>
                                                        {new Date(log.reading_date).toLocaleDateString('en-US', {
                                                            day: '2-digit', month: 'short', year: 'numeric'
                                                        })}
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 font-normal">
                                                        {new Date(log.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                    {log.creator && (
                                                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-sm inline-block mt-1 w-max">
                                                            {log.creator.full_name}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 font-bold">
                                                {log.meter.name}
                                                <div className="text-xs font-normal opacity-50">{log.meter.meter_number}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono opacity-70">
                                                {log.opening_reading.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono font-bold">
                                                {log.closing_reading.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-xs opacity-50">
                                                {log.computed_units.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })}
                                            </td>
                                            <td className="px-6 py-4 text-right font-mono text-xs opacity-50">
                                                {log.final_units && log.computed_units > 0
                                                    ? (log.final_units / log.computed_units).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })
                                                    : '1.0'}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-black ${((log.final_units ?? log.computed_units ?? 0)) > 0
                                                    ? (isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                                                    : (isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')
                                                    }`}>
                                                    {(log.final_units ?? log.computed_units ?? 0).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 3 })} kVAh
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right whitespace-nowrap">
                                                <span className={`text-xs font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                                    {log.computed_cost ? `₹${log.computed_cost.toLocaleString()}` : '-'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="max-w-[150px] truncate text-xs opacity-60" title={log.notes}>
                                                    {log.notes || '-'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button
                                                    onClick={() => handleDeleteReading(log.id)}
                                                    disabled={deletingId === log.id}
                                                    className={`p-1.5 rounded-lg transition-all ${isDark ? 'hover:bg-rose-500/10 text-slate-500 hover:text-rose-400' : 'hover:bg-rose-50 text-slate-400 hover:text-rose-500'}`}
                                                    title="Delete Entry"
                                                >
                                                    {deletingId === log.id ? (
                                                        <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ElectricityReadingHistory;
