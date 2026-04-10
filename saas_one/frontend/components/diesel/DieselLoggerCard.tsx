/**
 * DieselLoggerCard
 * Card component for logging diesel readings and viewing DG status.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Fuel, Plus, Minus, AlertTriangle, Save, Trash2, Zap, Hourglass } from 'lucide-react';
import { motion } from 'framer-motion';

interface Generator {
    id: string;
    name: string;
    make?: string;
    capacity_kva?: number;
    tank_capacity_litres?: number;
    status: string;
}

interface DGTariff {
    id: string;
    cost_per_litre: number;
    effective_from: string;
}

interface DieselReading {
    opening_hours: number;
    closing_hours: number;
    opening_kwh: number;
    closing_kwh: number;
    opening_diesel_level: number;
    closing_diesel_level: number;
    diesel_added_litres: number;
    computed_consumed_litres?: number;
    tariff_id?: string;
    tariff_rate?: number;
    notes?: string;
    reading_date?: string;
}

interface DieselLoggerCardProps {
    generator: Generator;
    previousClosing?: {
        hours: number;
        kwh: number;
        diesel: number;
    };
    averageConsumption?: number;
    activeTariff?: DGTariff | null;
    onReadingChange: (generatorId: string, reading: DieselReading) => void;
    onSave?: (generatorId: string) => Promise<void>;
    onDelete?: (generatorId: string) => void;
    isSubmitting?: boolean;
    isDark?: boolean;
}

const DieselLoggerCard: React.FC<DieselLoggerCardProps> = ({
    generator,
    previousClosing,
    averageConsumption,
    activeTariff,
    onReadingChange,
    onSave,
    onDelete,
    isSubmitting = false,
    isDark = false
}) => {
    // Openings (Auto-populated from previous closing or initial truth)
    const [openingHours, setOpeningHours] = useState<number>(previousClosing?.hours || 0);
    const [openingKwh, setOpeningKwh] = useState<number>(previousClosing?.kwh || 0);
    const [openingDiesel, setOpeningDiesel] = useState<number>(previousClosing?.diesel || 0);

    // Inputs
    const [closingHours, setClosingHours] = useState<number | ''>('');
    const [closingKwh, setClosingKwh] = useState<number | ''>('');
    const [closingDiesel, setClosingDiesel] = useState<number | ''>('');
    const [dieselAdded, setDieselAdded] = useState<number>(0);
    const [notes, setNotes] = useState<string>('');
    const [readingDate, setReadingDate] = useState<string>(new Date().toISOString().split('T')[0]);

    // Update openings when prop changes
    useEffect(() => {
        if (previousClosing) {
            setOpeningHours(previousClosing.hours);
            setOpeningKwh(previousClosing.kwh);
            setOpeningDiesel(previousClosing.diesel);
        }
    }, [previousClosing]);

    // Consumption Logic: (Opening + Added) - Closing
    const consumedLitres = (closingDiesel !== '')
        ? Math.max(0, (openingDiesel + dieselAdded) - Number(closingDiesel))
        : 0;

    const tariffRate = activeTariff?.cost_per_litre || 0;
    const hasValidReading = closingHours !== '' && closingHours >= openingHours &&
        closingKwh !== '' && closingKwh >= openingKwh &&
        closingDiesel !== '';

    // Notify parent of changes
    useEffect(() => {
        if (hasValidReading) {
            onReadingChange(generator.id, {
                opening_hours: openingHours,
                closing_hours: Number(closingHours),
                opening_kwh: openingKwh,
                closing_kwh: Number(closingKwh),
                opening_diesel_level: openingDiesel,
                closing_diesel_level: Number(closingDiesel),
                diesel_added_litres: dieselAdded,
                computed_consumed_litres: consumedLitres,
                tariff_id: activeTariff?.id,
                tariff_rate: tariffRate,
                notes: notes || undefined,
                reading_date: readingDate,
            });
        }
    }, [
        openingHours, closingHours,
        openingKwh, closingKwh,
        openingDiesel, closingDiesel,
        dieselAdded, notes, hasValidReading, activeTariff, tariffRate, consumedLitres, readingDate
    ]);

    const handleSaveEntry = async () => {
        if (onSave && hasValidReading) {
            await onSave(generator.id);
        }
    };

    const getStatusColor = () => {
        if (generator.status === 'inactive') return isDark ? 'bg-rose-500/10 text-rose-500' : 'bg-rose-50 text-rose-600';
        return 'bg-emerald-500/10 text-emerald-500';
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`flex flex-col ${isDark ? 'bg-[#161b22] border-[#21262d]' : 'bg-white border-slate-200'} rounded-[1.5rem] sm:rounded-[2.5rem] border shadow-sm overflow-hidden`}
        >
            {/* Header Area */}
            <div className={`p-5 sm:p-8 border-b ${isDark ? 'border-[#21262d] bg-[#0d1117]/50' : 'border-slate-100 bg-slate-50/50'}`}>
                <div className="flex justify-between items-start mb-4 sm:mb-6">
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                            <h2 className={`text-2xl font-black ${isDark ? 'text-white' : 'text-slate-900'} tracking-tight`}>{generator.name}</h2>
                            <span className={`text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${getStatusColor()}`}>
                                {generator.status}
                            </span>
                        </div>
                        <p className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-widest`}>
                            {generator.make || 'DG'} · {generator.capacity_kva} KVA
                        </p>
                    </div>
                    {onDelete && (
                        <button onClick={() => onDelete(generator.id)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Section Warning */}
                {!activeTariff && (
                    <div className="p-3 bg-amber-500/10 rounded-2xl flex items-center gap-3 border border-amber-500/20 mb-2">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">No active tariff found for this DG</span>
                    </div>
                )}
            </div>

            {/* Inputs Section */}
            <div className="p-5 sm:p-8 space-y-5 sm:space-y-6">
                {/* Date Selection - Compact */}
                <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase tracking-wide`}>
                        Reading Date
                    </span>
                    <input
                        type="date"
                        value={readingDate}
                        onChange={(e) => setReadingDate(e.target.value)}
                        className={`text-xs font-bold bg-transparent outline-none text-right ${isDark ? 'text-white' : 'text-slate-900'}`}
                        max={new Date().toISOString().split('T')[0]} // Prevent future dates
                    />
                </div>

                {/* 1. Run Hours Reading */}
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Opening - Inline Chip */}
                        <div className="flex flex-col justify-end">
                            <div className="flex items-center justify-between mb-1.5 px-1">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                    Run Hours
                                </span>
                                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                                    <span className="text-[9px] font-medium text-slate-500">Opening:</span>
                                    <span className={`text-[10px] font-bold font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                        {openingHours.toFixed(1)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {/* Closing - Empty for alignment */}
                        <div />
                    </div>

                    <div className="relative">
                        <input
                            type="number"
                            step="0.1"
                            placeholder="Current Run Hours"
                            value={closingHours}
                            onChange={(e) => setClosingHours(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className={`w-full p-3 sm:p-4 rounded-xl sm:rounded-2xl ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-white border-slate-200'} border-2 text-base sm:text-lg font-mono font-bold placeholder:text-slate-400 focus:outline-none focus:border-primary transition-all`}
                        />
                        {closingHours !== '' && closingHours < openingHours && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                <span className="text-[10px] font-black text-rose-500 uppercase tracking-wide">Must be ≥ Opening</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. kWh Energy Reading */}
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-4">
                        {/* Opening - Inline Chip */}
                        <div className="flex flex-col justify-end">
                            <div className="flex items-center justify-between mb-1.5 px-1">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                    Energy (kWh)
                                </span>
                                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                                    <span className="text-[9px] font-medium text-slate-500">Opening:</span>
                                    <span className={`text-[10px] font-bold font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                        {openingKwh.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {/* Closing - Empty for alignment */}
                        <div />
                    </div>

                    <div className="relative">
                        <input
                            type="number"
                            placeholder="Current Energy (kWh)"
                            value={closingKwh}
                            onChange={(e) => setClosingKwh(e.target.value === '' ? '' : parseFloat(e.target.value))}
                            className={`w-full p-3 sm:p-4 rounded-xl sm:rounded-2xl ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-white border-slate-200'} border-2 text-base sm:text-lg font-mono font-bold placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition-all`}
                        />
                        {closingKwh !== '' && closingKwh < openingKwh && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                                <span className="text-[10px] font-black text-rose-500 uppercase tracking-wide">Must be ≥ Opening</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* 3. Diesel Level & Additions */}
                <div className="space-y-4 pt-2 border-t border-dashed border-slate-200/50">
                    <div className="flex flex-col sm:flex-row items-start gap-4">
                        {/* Left: Closing Level */}
                        <div className="flex-1 space-y-2">
                            <div className="flex items-center justify-between mb-1.5 px-1">
                                <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                    Closing Level
                                </span>
                                <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md ${isDark ? 'bg-slate-800/50' : 'bg-slate-100'}`}>
                                    <span className="text-[9px] font-medium text-slate-500">Opening:</span>
                                    <span className={`text-[10px] font-bold font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                                        {openingDiesel} L
                                    </span>
                                </div>
                            </div>

                            <div className="relative">
                                <input
                                    type="number"
                                    placeholder="Level"
                                    value={closingDiesel}
                                    onChange={(e) => setClosingDiesel(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                    className={`w-full p-3 sm:p-4 rounded-xl sm:rounded-2xl ${isDark ? 'bg-[#0d1117] border-slate-600 text-white' : 'bg-white border-slate-300'} border-2 text-base sm:text-lg font-bold placeholder:text-slate-400 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all`}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">L</span>
                            </div>
                            {/* Inline validation for tank capacity */}
                            {closingDiesel !== '' && generator.tank_capacity_litres && closingDiesel > generator.tank_capacity_litres && (
                                <div className="mt-1 flex items-start gap-1.5 text-amber-600 px-1">
                                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                    <p className="text-[9px] font-bold leading-tight">
                                        Exceeds tank capacity ({generator.tank_capacity_litres} L)
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Right: Added Today */}
                        <div className="flex-1 space-y-2">
                            <label className={`block text-[10px] font-bold uppercase tracking-wider mb-1.5 px-1 ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                                Added Today
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={dieselAdded || ''}
                                    onChange={(e) => setDieselAdded(e.target.value === '' ? 0 : parseInt(e.target.value, 10))}
                                    className={`w-full p-3 sm:p-4 rounded-xl sm:rounded-2xl ${isDark ? 'bg-[#0d1117] border-slate-600 text-white' : 'bg-white border-slate-300'} border-2 text-base sm:text-lg font-bold placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all`}
                                />
                                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">L</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save Section */}
                <div className="pt-4">
                    <button
                        onClick={handleSaveEntry}
                        disabled={!hasValidReading || isSubmitting}
                        className={`w-full py-5 rounded-[2rem] font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-3 transition-all ${hasValidReading && !isSubmitting
                            ? 'bg-primary text-white shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40 hover:scale-[1.01] active:scale-[0.99]'
                            : `${isDark ? 'bg-slate-800/50 text-slate-600' : 'bg-slate-200 text-slate-400'} cursor-not-allowed opacity-60`
                            }`}
                    >
                        {isSubmitting ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Commit Daily Log
                            </>
                        )}
                    </button>
                    {hasValidReading && (
                        <motion.p
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`text-[10px] font-black text-center mt-4 ${isDark ? 'text-emerald-500/50' : 'text-emerald-600/60'} uppercase tracking-widest`}
                        >
                            Derived Consumed: {consumedLitres} L
                        </motion.p>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default DieselLoggerCard;
