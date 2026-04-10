/**
 * DieselHistoryModal
 * Modal showing historical diesel readings and consumption trends.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
    X, History, Calendar, Fuel, Clock,
    ArrowRight, IndianRupee, Zap, Droplets,
    Filter, Download, Search, ChevronLeft, ChevronRight, Edit2, Save, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';

interface Reading {
    id: string;
    reading_date: string;
    generator_id: string;
    opening_hours: number;
    closing_hours: number;
    opening_kwh?: number;
    closing_kwh?: number;
    opening_diesel_level?: number;
    closing_diesel_level?: number;
    diesel_added_litres: number;
    computed_run_hours?: number;
    computed_consumed_litres?: number;
    computed_cost?: number;
    tariff_rate_used?: number;
    notes?: string;
    created_at?: string;
    generator?: {
        name: string;
        make?: string;
        tank_capacity_litres?: number;
    };
    creator?: {
        full_name: string;
    };
}

interface Generator {
    id: string;
    name: string;
    make?: string;
    tank_capacity_litres?: number;
}

interface DieselHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    isDark?: boolean;
}

const DieselHistoryModal: React.FC<DieselHistoryModalProps> = ({
    isOpen,
    onClose,
    propertyId,
    isDark = false
}) => {
    const supabase = createClient();
    const [readings, setReadings] = useState<Reading[]>([]);
    const [generators, setGenerators] = useState<Generator[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Month Navigation State
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());

    // Filters
    const [selectedGeneratorId, setSelectedGeneratorId] = useState<string>('all');

    // Inline Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Partial<Reading>>({});
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen, propertyId, currentMonth, selectedGeneratorId]);

    const fetchData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            console.log('Fetching diesel history for:', propertyId, 'Month:', currentMonth.toISOString());

            // 1. Fetch Generators for filter (and tank capacity validation)
            let currentGenerators = generators;
            if (currentGenerators.length === 0) {
                const { data: gens, error: genError } = await supabase
                    .from('generators')
                    .select('id, name, make, tank_capacity_litres')
                    .eq('property_id', propertyId)
                    .eq('status', 'active');

                if (genError) throw genError;
                currentGenerators = gens || [];
                setGenerators(currentGenerators);
            }

            const genIds = currentGenerators.map(g => g.id);
            if (genIds.length === 0) {
                setReadings([]);
                setIsLoading(false);
                return;
            }

            // 2. Compute start and end of selected month
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0];

            // 3. Fetch Readings
            let query = supabase
                .from('diesel_readings')
                .select(`
                    *,
                    generator:generators(name, make, tank_capacity_litres),
                    creator:users!created_by(full_name)
                `)
                .in('generator_id', genIds)
                .gte('reading_date', startOfMonth)
                .lte('reading_date', endOfMonth)
                .order('reading_date', { ascending: false });

            if (selectedGeneratorId !== 'all') {
                query = query.eq('generator_id', selectedGeneratorId);
            }

            const { data: readingsData, error: readingsError } = await query;
            if (readingsError) throw readingsError;

            console.log('[DieselHistory] Query range:', startOfMonth, 'to', endOfMonth);
            console.log('[DieselHistory] Generator IDs used:', genIds);
            console.log('[DieselHistory] Readings returned:', readingsData?.length, readingsData);

            setReadings(readingsData as any || []);

        } catch (err: any) {
            console.error('Error fetching diesel history (raw):', err);
            console.error('Error fetching diesel history (stringified):', JSON.stringify(err, null, 2));
            console.error('Error message:', err?.message);
            console.error('Error code:', err?.code);
            console.error('Error details:', err?.details);
            console.error('Error hint:', err?.hint);
            setError(err.message || err.code || 'Unknown error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    // Month Navigation Helpers
    const prevMonth = () => {
        setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    };

    const nextMonth = () => {
        const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        if (next <= new Date()) { // Don't allow future months
            setCurrentMonth(next);
        }
    };

    const isCurrentMonth = () => {
        const now = new Date();
        return currentMonth.getMonth() === now.getMonth() && currentMonth.getFullYear() === now.getFullYear();
    };

    const formatMonth = (date: Date) => {
        return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    // Editing Logic
    const isToday = (dateStr: string) => {
        const today = new Date().toISOString().split('T')[0];
        return dateStr === today;
    };

    const startEdit = (reading: Reading) => {
        setEditingId(reading.id);
        setEditValues({
            closing_hours: reading.closing_hours,
            closing_kwh: reading.closing_kwh || 0,
            closing_diesel_level: reading.closing_diesel_level || 0,
            diesel_added_litres: reading.diesel_added_litres,
            notes: reading.notes || ''
        });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditValues({});
    };

    const saveEdit = async (originalReading: Reading) => {
        if (!editValues) return;
        setIsSaving(true);
        try {
            // Validation
            if (editValues.closing_hours !== undefined && editValues.closing_hours < originalReading.opening_hours) {
                throw new Error("Closing hours cannot be less than opening hours");
            }
            if (editValues.closing_kwh !== undefined && originalReading.opening_kwh !== undefined && editValues.closing_kwh < originalReading.opening_kwh) {
                throw new Error("Closing kWh cannot be less than opening kWh");
            }
            if (editValues.closing_diesel_level !== undefined && originalReading.generator?.tank_capacity_litres && editValues.closing_diesel_level > originalReading.generator.tank_capacity_litres) {
                throw new Error(`Closing diesel level exceeds tank capacity (${originalReading.generator.tank_capacity_litres} L)`);
            }

            // Prepare payload for API (re-using the create/update logic)
            // We need to send the full object expected by the POST handler to trigger recalculations
            const payload = {
                generator_id: originalReading.generator_id,
                reading_date: originalReading.reading_date,
                opening_hours: originalReading.opening_hours,
                closing_hours: editValues.closing_hours ?? originalReading.closing_hours,
                opening_kwh: originalReading.opening_kwh || 0,
                closing_kwh: editValues.closing_kwh ?? originalReading.closing_kwh ?? 0,
                opening_diesel_level: originalReading.opening_diesel_level || 0,
                closing_diesel_level: editValues.closing_diesel_level ?? originalReading.closing_diesel_level ?? 0,
                diesel_added_litres: editValues.diesel_added_litres ?? originalReading.diesel_added_litres,
                notes: editValues.notes ?? originalReading.notes
            };

            const res = await fetch(`/api/properties/${propertyId}/diesel-readings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to update reading');
            }

            // Refresh data
            await fetchData();
            setEditingId(null);

        } catch (err: any) {
            console.error('Update failed:', err);
            alert(err.message); // Simple alert for now, could be better UI
        } finally {
            setIsSaving(false);
        }
    };

    // Helper to group readings by day
    const groupedReadings = readings.reduce((acc, reading) => {
        const date = reading.reading_date;
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(reading);
        return acc;
    }, {} as Record<string, Reading[]>);

    // Sort dates desc
    const sortedDates = Object.keys(groupedReadings).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());


    const formatDisplayDateForGroup = (dateStr: string) => {
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className={`relative w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden rounded-3xl shadow-2xl ${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200'
                        } border`}
                >
                    {/* Header - Month Navigation */}
                    <div className={`flex flex-col md:flex-row items-center justify-between gap-4 p-6 border-b ${isDark ? 'border-[#30363d] bg-[#0d1117]/50' : 'border-slate-50/50 border-slate-100'
                        }`}>
                        <div className="flex items-center gap-3 w-full md:w-auto">
                            <div className="p-2 bg-primary/10 rounded-xl">
                                <History className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <h3 className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                    Logbook
                                </h3>
                                <p className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                    Daily Diesel Entries
                                </p>
                            </div>
                        </div>

                        {/* Month Navigator */}
                        <div className={`flex items-center gap-4 px-4 py-2 rounded-2xl border ${isDark ? 'bg-[#0d1117] border-[#30363d]' : 'bg-slate-50 border-slate-200'}`}>
                            <button
                                onClick={prevMonth}
                                className={`p-1 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-500'}`}
                            >
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                            <span className={`text-sm font-black uppercase tracking-widest w-32 text-center ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                {formatMonth(currentMonth)}
                            </span>
                            <button
                                onClick={nextMonth}
                                disabled={isCurrentMonth()}
                                className={`p-1 rounded-lg transition-colors ${isCurrentMonth()
                                    ? 'opacity-30 cursor-not-allowed'
                                    : isDark ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-200 text-slate-500'
                                    }`}
                            >
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Generator Filter & Close */}
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <select
                                    value={selectedGeneratorId}
                                    onChange={(e) => setSelectedGeneratorId(e.target.value)}
                                    className={`appearance-none pl-3 pr-8 py-2 text-xs font-bold rounded-lg border ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-white border-slate-200 text-slate-700'
                                        } focus:ring-2 focus:ring-primary/20 outline-none`}
                                >
                                    <option value="all">All Generators</option>
                                    {generators.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                                <Filter className="w-3 h-3 absolute right-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                            </div>
                            <button
                                onClick={onClose}
                                className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-[#21262d] text-slate-400' : 'hover:bg-slate-100 text-slate-500'
                                    }`}
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Content - Logbook List */}
                    <div className={`flex-1 overflow-auto ${isDark ? 'bg-[#161b22]' : 'bg-white'}`}>
                        {isLoading ? (
                            <div className="py-20 text-center">
                                <div className="inline-block w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                                <p className={`text-sm font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                    Loading {formatMonth(currentMonth)}...
                                </p>
                            </div>
                        ) : readings.length === 0 ? (
                            <div className="py-20 text-center px-6">
                                <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Calendar className="w-8 h-8 text-slate-400" />
                                </div>
                                <h3 className={`text-lg font-bold ${isDark ? 'text-slate-500' : 'text-slate-900'}`}>
                                    No logs for {formatMonth(currentMonth)}
                                </h3>
                                <p className="text-sm text-slate-400 max-w-xs mx-auto mt-2">
                                    {isCurrentMonth()
                                        ? "Start by logging your first DG entry for this month in the Dashboard."
                                        : "No generator usage was recorded during this month."}
                                </p>
                                {isCurrentMonth() && (
                                    <button onClick={onClose} className="mt-6 px-6 py-2 bg-primary text-white text-sm font-bold rounded-xl shadow-lg shadow-primary/20 hover:scale-105 transition-transform">
                                        Go to Logger
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="p-4 md:p-6 space-y-8">
                                {sortedDates.map(date => (
                                    <div key={date}>
                                        {/* Date Divider */}
                                        <div className="flex items-center gap-4 mb-4">
                                            <div className={`h-px flex-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                                            <span className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                                {formatDisplayDateForGroup(date)}
                                            </span>
                                            <div className={`h-px flex-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />
                                        </div>

                                        {/* Entries for this date */}
                                        <div className="space-y-3">
                                            {groupedReadings[date].map(r => {
                                                const isEditing = editingId === r.id;
                                                const canEdit = isToday(r.reading_date);

                                                return isEditing ? (
                                                    // EDIT MODE
                                                    <div key={r.id} className={`p-4 rounded-2xl border-2 border-primary/20 ${isDark ? 'bg-[#0d1117]' : 'bg-slate-50'}`}>
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{r.generator?.name}</span>
                                                                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-wide">Editing</span>
                                                            </div>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                                            {/* Closing Run Hours */}
                                                            <div>
                                                                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Closing Run Hours</label>
                                                                <input
                                                                    type="number" step="0.1"
                                                                    value={editValues.closing_hours || ''}
                                                                    onChange={e => setEditValues({ ...editValues, closing_hours: parseFloat(e.target.value) || 0 })}
                                                                    className={`w-full p-2 rounded-lg border text-sm font-bold ${isDark ? 'bg-[#161b22] border-slate-700 text-white' : 'bg-white border-slate-300'}`}
                                                                />
                                                            </div>
                                                            {/* Closing kWh */}
                                                            <div>
                                                                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Closing kWh</label>
                                                                <input
                                                                    type="number"
                                                                    value={editValues.closing_kwh || ''}
                                                                    onChange={e => setEditValues({ ...editValues, closing_kwh: parseFloat(e.target.value) || 0 })}
                                                                    className={`w-full p-2 rounded-lg border text-sm font-bold ${isDark ? 'bg-[#161b22] border-slate-700 text-white' : 'bg-white border-slate-300'}`}
                                                                />
                                                            </div>
                                                            {/* Closing Diesel */}
                                                            <div>
                                                                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Closing Diesel (L)</label>
                                                                <input
                                                                    type="number"
                                                                    value={editValues.closing_diesel_level || ''}
                                                                    onChange={e => setEditValues({ ...editValues, closing_diesel_level: parseFloat(e.target.value) || 0 })}
                                                                    className={`w-full p-2 rounded-lg border text-sm font-bold ${isDark ? 'bg-[#161b22] border-slate-700 text-white' : 'bg-white border-slate-300'}`}
                                                                />
                                                            </div>
                                                            {/* Added Diesel */}
                                                            <div>
                                                                <label className="text-[10px] font-bold uppercase text-slate-500 mb-1 block">Added (L)</label>
                                                                <input
                                                                    type="number"
                                                                    value={editValues.diesel_added_litres || ''}
                                                                    onChange={e => setEditValues({ ...editValues, diesel_added_litres: parseFloat(e.target.value) || 0 })}
                                                                    className={`w-full p-2 rounded-lg border text-sm font-bold ${isDark ? 'bg-[#161b22] border-slate-700 text-white' : 'bg-white border-slate-300'}`}
                                                                />
                                                            </div>
                                                        </div>

                                                        <div className="flex justify-end gap-3">
                                                            <button
                                                                onClick={cancelEdit}
                                                                disabled={isSaving}
                                                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider ${isDark ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-200'}`}
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={() => saveEdit(r)}
                                                                disabled={isSaving}
                                                                className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50"
                                                            >
                                                                {isSaving ? 'Saving...' : 'Save Changes'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    // VIEW MODE (Collapsed Row)
                                                    <div key={r.id} className={`group relative flex items-center p-3 rounded-2xl border transition-all ${isDark
                                                        ? 'bg-[#0d1117] border-[#30363d] hover:border-slate-600'
                                                        : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-sm'
                                                        }`}>
                                                        {/* Time/Generator Identity */}
                                                        <div className="w-1/3 flex flex-col pl-2">
                                                            <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                                                {r.generator?.name || 'DG'}
                                                            </span>
                                                            <span className="text-[10px] font-medium text-slate-500">
                                                                {new Date(r.created_at || r.reading_date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                            {r.creator && (
                                                                <span className="text-[9px] font-medium text-slate-400 mt-0.5 max-w-[120px] truncate" title={r.creator.full_name}>
                                                                    By: {r.creator.full_name}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Metrics Summary - Inline */}
                                                        <div className="flex-1 flex items-center justify-between pr-4 gap-4">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[9px] font-bold uppercase text-slate-400">Run Hrs</span>
                                                                <span className={`text-xs font-bold font-mono ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                                    +{r.computed_run_hours?.toFixed(1) || (r.closing_hours - r.opening_hours).toFixed(1)}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[9px] font-bold uppercase text-slate-400">Energy</span>
                                                                <span className={`text-xs font-bold font-mono ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
                                                                    +{(r.closing_kwh || 0) - (r.opening_kwh || 0)}
                                                                </span>
                                                            </div>
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[9px] font-bold uppercase text-slate-400">Consume</span>
                                                                <span className={`text-xs font-bold font-mono text-primary`}>
                                                                    -{r.computed_consumed_litres?.toFixed(0)} L
                                                                </span>
                                                            </div>
                                                            {r.diesel_added_litres > 0 && (
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-[9px] font-bold uppercase text-slate-400">Added</span>
                                                                    <span className="text-xs font-bold font-mono text-emerald-500">
                                                                        +{r.diesel_added_litres} L
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Edit Action (Only for Today) */}
                                                        {canEdit && (
                                                            <button
                                                                onClick={() => startEdit(r)}
                                                                className={`absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-500 hover:text-slate-900'
                                                                    }`}
                                                            >
                                                                <Edit2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default DieselHistoryModal;
