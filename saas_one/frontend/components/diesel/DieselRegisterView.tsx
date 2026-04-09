/**
 * DieselRegisterView
 *
 * Diesel and generator consumption register for DG (Diesel Generator) sets.
 * Provides a monthly browsable log of energy, run hours, and fuel consumption per generator.
 *
 * Features:
 * - Energy tab: kWh opening/closing readings and cost computation
 * - Run Hours tab: meter hours tracking and daily consumption
 * - Fuel tab: diesel level monitoring, litres added, and consumption calculation
 * - Month navigation (previous/current month browsing)
 * - Multi-generator support with a selector dropdown
 * - Inline editing of closing readings for the current day/month
 * - Row-level delete functionality
 * - Dark and light theme support via `isDark` prop
 * - SLA-aware data caching via Supabase backend
 *
 * @example
 * <DieselRegisterView
 *   propertyId="prop_123"
 *   isDark={true}
 *   onBack={() => router.back()}
 *   onDataChange={() => refreshDashboard()}
 * />
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    ChevronLeft, ChevronRight, Zap, Clock, Fuel, Edit2, Save, X, AlertTriangle, Trash2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';

// Types
type ViewTab = 'energy' | 'runhours' | 'fuel';

interface Generator {
    id: string;
    name: string;
    make?: string;
    tank_capacity_litres?: number;
}

interface Reading {
    id: string;
    reading_date: string;
    generator_id: string;
    opening_hours: number;
    closing_hours: number;
    opening_kwh: number;
    closing_kwh: number;
    opening_diesel_level: number;
    closing_diesel_level: number;
    diesel_added_litres: number;
    computed_run_hours?: number;
    computed_consumed_litres?: number;
    computed_cost?: number;
    notes?: string;
    generator?: Generator;
}

interface DieselRegisterViewProps {
    propertyId: string;
    isDark?: boolean;
    onBack?: () => void;
    onDataChange?: () => void;
}

const DieselRegisterView: React.FC<DieselRegisterViewProps> = ({
    propertyId,
    isDark = false,
    onBack,
    onDataChange
}) => {
    const supabase = createClient();

    // State
    const [activeTab, setActiveTab] = useState<ViewTab>('energy');
    const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
    const [generators, setGenerators] = useState<Generator[]>([]);
    const [selectedGeneratorId, setSelectedGeneratorId] = useState<string>('');
    const [readings, setReadings] = useState<Reading[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Inline Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValues, setEditValues] = useState<Partial<Reading>>({});
    const [isSaving, setIsSaving] = useState(false);

    // Fetch Generators on mount
    useEffect(() => {
        const fetchGenerators = async () => {
            const { data, error } = await supabase
                .from('generators')
                .select('id, name, make, tank_capacity_litres')
                .eq('property_id', propertyId)
                .eq('status', 'active');

            if (error) {
                console.error('Error fetching generators:', error);
                return;
            }
            setGenerators(data || []);
            if (data && data.length > 0) {
                setSelectedGeneratorId(data[0].id);
            }
        };
        fetchGenerators();
    }, [propertyId]);

    // Fetch Readings when month or generator changes
    useEffect(() => {
        if (!selectedGeneratorId) return;
        fetchReadings();
    }, [currentMonth, selectedGeneratorId]);

    const fetchReadings = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).toISOString().split('T')[0];
            const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).toISOString().split('T')[0];

            const { data, error: readError } = await supabase
                .from('diesel_readings')
                .select('*')
                .eq('generator_id', selectedGeneratorId)
                .gte('reading_date', startOfMonth)
                .lte('reading_date', endOfMonth)
                .order('reading_date', { ascending: false })
                .order('created_at', { ascending: false });

            if (readError) throw readError;
            setReadings(data || []);
        } catch (err: any) {
            console.error('Error fetching readings:', err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Month Navigation
    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    const nextMonth = () => {
        const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        if (next <= new Date()) setCurrentMonth(next);
    };
    const isCurrentMonth = () => {
        const now = new Date();
        return currentMonth.getMonth() === now.getMonth() && currentMonth.getFullYear() === now.getFullYear();
    };
    const formatMonth = (date: Date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Editing
    const isToday = (dateStr: string) => dateStr === new Date().toISOString().split('T')[0];
    const startEdit = (r: Reading) => {
        setEditingId(r.id);
        setEditValues({
            closing_hours: r.closing_hours,
            closing_kwh: r.closing_kwh,
            closing_diesel_level: r.closing_diesel_level,
            diesel_added_litres: r.diesel_added_litres
        });
    };
    const cancelEdit = () => { setEditingId(null); setEditValues({}); };

    const saveEdit = async (original: Reading) => {
        setIsSaving(true);
        try {
            const payload = {
                generator_id: original.generator_id,
                reading_date: original.reading_date,
                opening_hours: original.opening_hours,
                closing_hours: editValues.closing_hours ?? original.closing_hours,
                opening_kwh: original.opening_kwh,
                closing_kwh: editValues.closing_kwh ?? original.closing_kwh,
                opening_diesel_level: original.opening_diesel_level,
                closing_diesel_level: editValues.closing_diesel_level ?? original.closing_diesel_level,
                diesel_added_litres: editValues.diesel_added_litres ?? original.diesel_added_litres
            };

            const res = await fetch(`/api/properties/${propertyId}/diesel-readings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to update');
            }

            await fetchReadings();
            setEditingId(null);
            if (onDataChange) onDataChange();
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteReading = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this log entry?')) return;

        try {
            const res = await fetch(`/api/properties/${propertyId}/diesel-readings?id=${id}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete reading');
            }

            fetchReadings();
            if (onDataChange) onDataChange();
        } catch (err: any) {
            alert(err.message);
        }
    };

    // Get day name
    const getDayName = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });

    // Tab Config
    const tabs: { key: ViewTab; label: string; icon: React.ElementType }[] = [
        { key: 'energy', label: 'Energy', icon: Zap },
        { key: 'runhours', label: 'Run Hours', icon: Clock },
        { key: 'fuel', label: 'Fuel', icon: Fuel }
    ];

    // Render table based on active tab
    const renderTable = () => {
        if (isLoading) {
            return (
                <div className="py-20 text-center">
                    <div className="inline-block w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin mb-4" />
                    <p className={`text-sm font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Loading...</p>
                </div>
            );
        }

        if (readings.length === 0) {
            return (
                <div className="py-20 text-center">
                    <p className={`text-lg font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                        No entries for {formatMonth(currentMonth)}
                    </p>
                    <p className="text-sm text-slate-400 mt-2">Log readings from the dashboard to see them here.</p>
                </div>
            );
        }

        // Common header style
        const thClass = `px-3 md:px-6 py-4 text-left text-[10px] font-black uppercase tracking-[0.2em] border-b ${isDark ? 'text-slate-500 border-[#30363d]' : 'text-slate-500 border-slate-200'} bg-slate-50/50`;
        const tdClass = `px-3 md:px-6 py-4 text-sm font-bold font-inter ${isDark ? 'text-slate-200' : 'text-slate-700'}`;

        if (activeTab === 'energy') {
            return (
                <table className="w-full">
                    <thead className={`sticky top-0 z-10 ${isDark ? 'bg-[#0d1117]' : 'bg-slate-50'}`}>
                        <tr>
                            <th className={thClass}>Date</th>
                            <th className={`${thClass} hidden md:table-cell`}>Day</th>
                            <th className={thClass}>Opening (kWh)</th>
                            <th className={thClass}>Closing (kWh)</th>
                            <th className={thClass}>Consumption</th>
                            <th className={thClass}>Cost</th>
                            <th className={thClass}>Notes</th>
                            <th className={thClass}></th>
                        </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? 'divide-[#30363d]' : 'divide-slate-100'}`}>
                        {readings.map(r => {
                            const isEditing = editingId === r.id;
                            const canEdit = isToday(r.reading_date) && isCurrentMonth();
                            const consumption = (r.closing_kwh || 0) - (r.opening_kwh || 0);

                            return (
                                <tr key={r.id} className={`${isDark ? 'hover:bg-[#161b22]' : 'hover:bg-slate-50'}`}>
                                    <td className={tdClass}>{new Date(r.reading_date).getDate()}</td>
                                    <td className={`${tdClass} hidden md:table-cell`}>{getDayName(r.reading_date)}</td>
                                    <td className={`${tdClass} text-slate-400`}>{r.opening_kwh?.toLocaleString()}</td>
                                    <td className={tdClass}>
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                value={editValues.closing_kwh || ''}
                                                onChange={e => setEditValues({ ...editValues, closing_kwh: parseFloat(e.target.value) || 0 })}
                                                className={`w-24 px-2 py-1 rounded border text-sm font-mono ${isDark ? 'bg-[#0d1117] border-slate-700 text-white' : 'bg-white border-slate-300'}`}
                                            />
                                        ) : (
                                            <span className="font-bold">{r.closing_kwh?.toLocaleString()}</span>
                                        )}
                                    </td>
                                    <td className={tdClass}>
                                        <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-black ${consumption > 0
                                            ? (isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                                            : (isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')
                                            }`}>
                                            +{consumption.toLocaleString()}
                                        </span>
                                    </td>
                                    <td className={tdClass}>
                                        <span className={`text-xs font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                            {r.computed_cost ? `₹${r.computed_cost.toLocaleString()}` : '-'}
                                        </span>
                                    </td>
                                    <td className={tdClass}>
                                        <div className="max-w-[150px] truncate text-xs opacity-60" title={r.notes}>
                                            {r.notes || '-'}
                                        </div>
                                    </td>
                                    <td className={tdClass}>
                                        {isEditing ? (
                                            <div className="flex gap-2">
                                                <button onClick={() => saveEdit(r)} disabled={isSaving} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded"><Save className="w-4 h-4" /></button>
                                                <button onClick={cancelEdit} className="p-1 text-slate-400 hover:bg-slate-500/10 rounded"><X className="w-4 h-4" /></button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-1">
                                                {canEdit && (
                                                    <button onClick={() => startEdit(r)} className="p-1 text-slate-400 hover:text-primary rounded" title="Edit entry">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteReading(r.id)}
                                                    className="p-1 text-slate-400 hover:text-rose-500 rounded"
                                                    title="Delete entry"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            );
        }

        if (activeTab === 'runhours') {
            return (
                <table className="w-full">
                    <thead className={`sticky top-0 z-10 ${isDark ? 'bg-[#0d1117]' : 'bg-slate-50'}`}>
                        <tr>
                            <th className={thClass}>Date</th>
                            <th className={`${thClass} hidden md:table-cell`}>Day</th>
                            <th className={thClass}>Opening (Hrs)</th>
                            <th className={thClass}>Closing (Hrs)</th>
                            <th className={thClass}>Consumption</th>
                            <th className={thClass}>Notes</th>
                            <th className={thClass}></th>
                        </tr>
                    </thead>
                    <tbody className={`divide-y ${isDark ? 'divide-[#30363d]' : 'divide-slate-100'}`}>
                        {readings.map(r => {
                            const isEditing = editingId === r.id;
                            const canEdit = isToday(r.reading_date) && isCurrentMonth();
                            const consumption = (r.closing_hours || 0) - (r.opening_hours || 0);

                            return (
                                <tr key={r.id} className={`${isDark ? 'hover:bg-[#161b22]' : 'hover:bg-slate-50'}`}>
                                    <td className={tdClass}>{new Date(r.reading_date).getDate()}</td>
                                    <td className={`${tdClass} hidden md:table-cell`}>{getDayName(r.reading_date)}</td>
                                    <td className={`${tdClass} text-slate-400`}>{r.opening_hours?.toFixed(1)}</td>
                                    <td className={tdClass}>
                                        {isEditing ? (
                                            <input
                                                type="number"
                                                step="0.1"
                                                value={editValues.closing_hours || ''}
                                                onChange={e => setEditValues({ ...editValues, closing_hours: parseFloat(e.target.value) || 0 })}
                                                className={`w-24 px-2 py-1 rounded border text-sm font-mono ${isDark ? 'bg-[#0d1117] border-slate-700 text-white' : 'bg-white border-slate-300'}`}
                                            />
                                        ) : (
                                            <span className="font-bold">{r.closing_hours?.toFixed(1)}</span>
                                        )}
                                    </td>
                                    <td className={tdClass}>
                                        <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-black ${consumption > 0
                                            ? (isDark ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
                                            : (isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')
                                            }`}>
                                            +{consumption.toFixed(1)}
                                        </span>
                                    </td>
                                    <td className={tdClass}>
                                        <div className="max-w-[150px] truncate text-xs opacity-60" title={r.notes}>
                                            {r.notes || '-'}
                                        </div>
                                    </td>
                                    <td className={tdClass}>
                                        {isEditing ? (
                                            <div className="flex gap-2">
                                                <button onClick={() => saveEdit(r)} disabled={isSaving} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded"><Save className="w-4 h-4" /></button>
                                                <button onClick={cancelEdit} className="p-1 text-slate-400 hover:bg-slate-500/10 rounded"><X className="w-4 h-4" /></button>
                                            </div>
                                        ) : (
                                            <div className="flex gap-1">
                                                {canEdit && (
                                                    <button onClick={() => startEdit(r)} className="p-1 text-slate-400 hover:text-primary rounded" title="Edit entry">
                                                        <Edit2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => handleDeleteReading(r.id)}
                                                    className="p-1 text-slate-400 hover:text-rose-500 rounded"
                                                    title="Delete entry"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            );
        }

        // Fuel Tab
        return (
            <table className="w-full">
                <thead className={`sticky top-0 z-10 ${isDark ? 'bg-[#0d1117]' : 'bg-slate-50'}`}>
                    <tr>
                        <th className={thClass}>Date</th>
                        <th className={`${thClass} hidden md:table-cell`}>Day</th>
                        <th className={thClass}>Opening (L)</th>
                        <th className={thClass}>Added (L)</th>
                        <th className={thClass}>Closing (L)</th>
                        <th className={thClass}>Consumed (L)</th>
                        <th className={thClass}>Cost</th>
                        <th className={thClass}>Notes</th>
                        <th className={thClass}></th>
                    </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-[#30363d]' : 'divide-slate-100'}`}>
                    {readings.map(r => {
                        const isEditing = editingId === r.id;
                        const canEdit = isToday(r.reading_date) && isCurrentMonth();
                        const consumed = r.computed_consumed_litres ?? ((r.opening_diesel_level || 0) + (r.diesel_added_litres || 0) - (r.closing_diesel_level || 0));

                        return (
                            <tr key={r.id} className={`${isDark ? 'hover:bg-[#161b22]' : 'hover:bg-slate-50'}`}>
                                <td className={tdClass}>{new Date(r.reading_date).getDate()}</td>
                                <td className={`${tdClass} hidden md:table-cell`}>{getDayName(r.reading_date)}</td>
                                <td className={`${tdClass} text-slate-400`}>{r.opening_diesel_level}</td>
                                <td className={tdClass}>
                                    {isEditing ? (
                                        <input
                                            type="number"
                                            value={editValues.diesel_added_litres || ''}
                                            onChange={e => setEditValues({ ...editValues, diesel_added_litres: parseInt(e.target.value, 10) || 0 })}
                                            className={`w-20 px-2 py-1 rounded border text-sm font-mono ${isDark ? 'bg-[#0d1117] border-slate-700 text-white' : 'bg-white border-slate-300'}`}
                                        />
                                    ) : r.diesel_added_litres > 0 ? (
                                        <span className="text-emerald-500 font-bold">+{r.diesel_added_litres}</span>
                                    ) : (
                                        <span className="text-slate-400">-</span>
                                    )}
                                </td>
                                <td className={tdClass}>
                                    {isEditing ? (
                                        <input
                                            type="number"
                                            value={editValues.closing_diesel_level || ''}
                                            onChange={e => setEditValues({ ...editValues, closing_diesel_level: parseFloat(e.target.value) || 0 })}
                                            className={`w-20 px-2 py-1 rounded border text-sm font-mono ${isDark ? 'bg-[#0d1117] border-slate-700 text-white' : 'bg-white border-slate-300'}`}
                                        />
                                    ) : (
                                        <span className="font-bold">{r.closing_diesel_level}</span>
                                    )}
                                </td>
                                <td className={tdClass}>
                                    <span className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-black ${consumed > 0
                                        ? (isDark ? 'bg-primary/10 text-primary' : 'bg-blue-50 text-primary')
                                        : (isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400')
                                        }`}>
                                        {consumed.toFixed(0)} L
                                    </span>
                                </td>
                                <td className={tdClass}>
                                    <span className={`text-xs font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                                        {r.computed_cost ? `₹${r.computed_cost.toLocaleString()}` : '-'}
                                    </span>
                                </td>
                                <td className={tdClass}>
                                    <div className="max-w-[150px] truncate text-xs opacity-60" title={r.notes}>
                                        {r.notes || '-'}
                                    </div>
                                </td>
                                <td className={tdClass}>
                                    {isEditing ? (
                                        <div className="flex gap-2">
                                            <button onClick={() => saveEdit(r)} disabled={isSaving} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded"><Save className="w-4 h-4" /></button>
                                            <button onClick={cancelEdit} className="p-1 text-slate-400 hover:bg-slate-500/10 rounded"><X className="w-4 h-4" /></button>
                                        </div>
                                    ) : (
                                        <div className="flex gap-1">
                                            {canEdit && (
                                                <button onClick={() => startEdit(r)} className="p-1 text-slate-400 hover:text-primary rounded" title="Edit entry">
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleDeleteReading(r.id)}
                                                className="p-1 text-slate-400 hover:text-rose-500 rounded"
                                                title="Delete entry"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        );
    };

    return (
        <div className={`min-h-screen ${isDark ? 'bg-[#0d1117] text-white' : 'bg-slate-100 text-slate-900'}`}>
            {/* Header - Full Width */}
            <div className={`sticky top-0 z-20 ${isDark ? 'bg-[#161b22] border-b border-[#30363d]' : 'bg-white border-b border-slate-200 shadow-sm'}`}>
                <div className="px-4 md:px-6 py-4 flex flex-col gap-4">
                    {/* Row 1: Back + Title */}
                    <div className="flex items-center gap-4">
                        {onBack && (
                            <button onClick={onBack} className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}>
                                <ChevronLeft className="w-5 h-5" />
                            </button>
                        )}
                        <div>
                            <h1 className="text-lg md:text-xl font-black tracking-tight leading-none mb-1">DG Reading Register</h1>
                            <p className={`text-[10px] md:text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                {generators.find(g => g.id === selectedGeneratorId)?.name || 'Select Generator'}
                            </p>
                        </div>
                    </div>

                    {/* Row 2: Controls (Month + Gen) */}
                    <div className="flex flex-wrap items-center gap-3 md:gap-4">
                        {/* Month Navigator */}
                        <div className={`flex items-center gap-1 md:gap-2 px-3 py-1.5 rounded-xl border ${isDark ? 'bg-[#0d1117] border-[#30363d]' : 'bg-slate-50 border-slate-200 shadow-inner'}`}>
                            <button onClick={prevMonth} className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}>
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-[10px] md:text-sm font-black uppercase tracking-[0.1em] min-w-[120px] md:w-32 text-center">{formatMonth(currentMonth)}</span>
                            <button
                                onClick={nextMonth}
                                disabled={isCurrentMonth()}
                                className={`p-1 rounded transition-colors ${isCurrentMonth() ? 'opacity-20 cursor-not-allowed' : isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-200'}`}
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Generator Selector */}
                        <div className="flex-1 md:flex-none">
                            <select
                                value={selectedGeneratorId}
                                onChange={e => setSelectedGeneratorId(e.target.value)}
                                className={`w-full md:w-auto px-4 py-2 text-[10px] md:text-sm font-bold rounded-xl border appearance-none ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-white border-slate-200'} focus:ring-2 focus:ring-primary/20 outline-none`}
                            >
                                {generators.map(g => (
                                    <option key={g.id} value={g.id}>{g.name} {g.make && `(${g.make})`}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-3 md:px-6 flex gap-1 overflow-x-auto no-scrollbar scroll-smooth">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-2 px-4 md:px-6 py-4 text-[10px] md:text-xs font-black uppercase tracking-widest transition-all relative whitespace-nowrap ${isActive
                                    ? `${isDark ? 'text-white' : 'text-primary'}`
                                    : `${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700'}`
                                    }`}
                            >
                                <Icon className="w-3.5 h-3.5 md:w-4 h-4" />
                                {tab.label}
                                {isActive && (
                                    <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Table Content - Full Width */}
            <div className={`overflow-x-auto ${isDark ? 'bg-[#161b22]' : 'bg-white'}`}>
                <div className="min-w-[800px] md:min-w-full">
                    {renderTable()}
                </div>
            </div>
        </div>
    );
};

export default DieselRegisterView;
