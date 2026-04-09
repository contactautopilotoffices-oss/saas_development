/**
 * DieselStaffDashboard
 * Staff-facing diesel logging dashboard with quick entry forms.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Fuel, Zap, Settings, CheckCircle, Plus,
    AlertTriangle, History, BarChart3, Coins, ArrowLeft, Upload
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import DieselLoggerCard from './DieselLoggerCard';
import LiquidDieselGauge from './LiquidDieselGauge';
import GeneratorConfigModal from './GeneratorConfigModal';
import DieselRegisterView from './DieselRegisterView';
import DGTariffModal from './DGTariffModal';
import DieselImportModal from './DieselImportModal';
import { Toast } from '../ui/Toast';

interface Generator {
    id: string;
    name: string;
    make?: string;
    capacity_kva?: number;
    tank_capacity_litres?: number;
    status: string;
    // v2 Initial Setup
    initial_kwh_reading?: number;
    initial_run_hours?: number;
    initial_diesel_level?: number;
    effective_from_date?: string;
}

interface Property {
    id: string;
    name: string;
    code: string;
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

interface DieselStaffDashboardProps {
    propertyId?: string;
    isDark?: boolean;
}

const DieselStaffDashboard: React.FC<DieselStaffDashboardProps> = ({ propertyId: propIdFromProps, isDark = false }) => {
    const params = useParams();
    const router = useRouter();
    const propertyId = propIdFromProps || (params?.propertyId as string);
    const supabase = React.useMemo(() => createClient(), []);

    // State
    const [property, setProperty] = useState<Property | null>(null);
    const [generators, setGenerators] = useState<Generator[]>([]);
    const [readings, setReadings] = useState<Record<string, DieselReading>>({});
    const [previousClosings, setPreviousClosings] = useState<Record<string, any>>({});
    const [averages, setAverages] = useState<Record<string, number>>({});
    const [activeTariffs, setActiveTariffs] = useState<Record<string, any>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showTariffModal, setShowTariffModal] = useState(false);
    const [showRegisterView, setShowRegisterView] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error', visible: boolean }>({
        message: '',
        type: 'success',
        visible: false
    });



    // Fetch data
    const fetchData = useCallback(async () => {
        if (!propertyId) return;
        setIsLoading(true);
        setError(null);

        try {
            // Fetch property
            const { data: propData, error: propError } = await supabase
                .from('properties')
                .select('id, name, code')
                .eq('id', propertyId)
                .single();

            if (propError) throw propError;
            setProperty(propData);

            // Fetch generators
            const generatorsRes = await fetch(`/api/properties/${propertyId}/generators`);
            if (!generatorsRes.ok) throw new Error('Failed to fetch generators');
            const generatorsData = await generatorsRes.json();
            setGenerators(generatorsData);

            // Fetch yesterday's readings for opening
            if (generatorsData.length > 0) {
                const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                // v2 Carry-Forward: Get latest readings for all generators
                const readingsRes = await fetch(
                    `/api/properties/${propertyId}/diesel-readings?limit=100`
                );
                if (readingsRes.ok) {
                    const readingsData = await readingsRes.json();

                    // Sort readings by date and then by creation time to find the newest for each generator
                    const sortedReadings = [...readingsData].sort((a, b) => {
                        const dateDiff = new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime();
                        if (dateDiff !== 0) return dateDiff;
                        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
                    });

                    // 1. First, populate from Initial Readings (Starting Truth)
                    const initialTruth: Record<string, any> = {};
                    generatorsData.forEach((gen: any) => {
                        initialTruth[gen.id] = {
                            hours: gen.initial_run_hours || 0,
                            kwh: gen.initial_kwh_reading || 0,
                            diesel: gen.initial_diesel_level || 0,
                            hasActual: false
                        };
                    });

                    // 2. Override with latest actual reading if it exists
                    sortedReadings.forEach((r: any) => {
                        if (!initialTruth[r.generator_id]?.hasActual) {
                            initialTruth[r.generator_id] = {
                                hours: r.closing_hours,
                                kwh: r.closing_kwh,
                                diesel: r.closing_diesel_level,
                                hasActual: true
                            };
                        }
                    });
                    setPreviousClosings(initialTruth);
                }

                // Fetch averages
                const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const avgRes = await fetch(
                    `/api/properties/${propertyId}/diesel-readings?startDate=${monthAgo}`
                );
                if (avgRes.ok) {
                    const avgData = await avgRes.json();
                    const avgByGen: Record<string, number[]> = {};
                    avgData.forEach((r: any) => {
                        if (!avgByGen[r.generator_id]) avgByGen[r.generator_id] = [];
                        if (r.computed_consumed_litres) avgByGen[r.generator_id].push(r.computed_consumed_litres);
                    });
                    const avgs: Record<string, number> = {};
                    Object.entries(avgByGen).forEach(([genId, values]) => {
                        if (values.length > 0) {
                            avgs[genId] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
                        }
                    });
                    setAverages(avgs);
                }

                // Fetch tariffs for each generator (ignore errors - no tariff is valid state)
                const today = new Date().toISOString().split('T')[0];
                const tariffs: Record<string, any> = {};
                await Promise.all(generatorsData.map(async (gen: Generator) => {
                    try {
                        const tariffRes = await fetch(`/api/properties/${propertyId}/dg-tariffs?generatorId=${gen.id}&date=${today}`);
                        if (tariffRes.ok) {
                            const t = await tariffRes.json();
                            if (t && t.id) {
                                tariffs[gen.id] = t;
                            }
                            // If t is null or empty, that's fine - no tariff configured
                        }
                        // 500 errors are expected when RPC doesn't exist or no tariff - just skip
                    } catch (e) {
                        // Silent fail - no tariff is a valid state
                    }
                }));
                setActiveTariffs(tariffs);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load data');
        } finally {
            setIsLoading(false);
        }
    }, [propertyId, supabase]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handle reading changes
    const handleReadingChange = (generatorId: string, reading: DieselReading) => {
        setReadings(prev => ({ ...prev, [generatorId]: reading }));
    };

    // Save Single Reading
    const handleSaveSingleReading = async (generatorId: string) => {
        const r = readings[generatorId];

        // v2 Validation: Check if basic required fields are present
        if (!r) {
            setError('No reading data found. Please enter closing values.');
            return;
        }

        // Allow equal values for same-day re-entries, just not lower
        if (r.closing_hours < r.opening_hours) {
            setError('Closing hours cannot be less than opening hours.');
            return;
        }

        if (r.closing_kwh < r.opening_kwh) {
            setError('Closing kWh cannot be less than opening kWh.');
            return;
        }

        setIsSubmitting(true);
        setError(null);
        try {
            const readingToSubmit = {
                generator_id: generatorId,
                reading_date: r.reading_date || new Date().toISOString().split('T')[0],
                ...r,
                alert_status: averages[generatorId] && r.computed_consumed_litres &&
                    r.computed_consumed_litres > averages[generatorId] * 1.25 ? 'warning' : 'normal',
            };

            const res = await fetch(`/api/properties/${propertyId}/diesel-readings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ readings: [readingToSubmit] }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save reading');
            }

            setToast({ message: '✅ Daily log saved successfully!', type: 'success', visible: true });

            // Refresh data to update carry-forward values
            fetchData();
        } catch (err: any) {
            setToast({ message: err.message, type: 'error', visible: true });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle delete
    const handleDeleteGenerator = async (generatorId: string) => {
        if (!window.confirm('Delete this generator?')) return;
        try {
            const res = await fetch(`/api/properties/${propertyId}/generators?id=${generatorId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed delete');
            fetchData();
        } catch (err: any) {
            setToast({ message: err.message, type: 'error', visible: true });
        }
    };

    if (isLoading) return (
        <div className={`min-h-screen ${isDark ? 'bg-[#0d1117]' : 'bg-slate-50'}`}>
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-12">
                {/* Header skeleton */}
                <div className="mb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-2">
                        <div className={`h-7 w-7 rounded-md animate-pulse ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                        <div className={`h-10 w-72 rounded-xl animate-pulse ${isDark ? 'bg-[#21262d]' : 'bg-slate-200'}`} />
                        <div className={`h-4 w-96 rounded-full animate-pulse ${isDark ? 'bg-[#30363d]' : 'bg-slate-100'}`} />
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        {[100, 96, 112, 96].map((w, i) => (
                            <div key={i} className={`h-10 rounded-xl animate-pulse ${isDark ? 'bg-[#21262d]' : 'bg-slate-200'}`} style={{ width: w }} />
                        ))}
                    </div>
                </div>
                {/* Generator cards skeleton */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {[1, 2].map(i => (
                        <div key={i} className={`rounded-2xl border overflow-hidden animate-pulse ${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200 shadow-sm'}`}>
                            {/* Card header */}
                            <div className={`p-5 border-b ${isDark ? 'border-[#30363d]' : 'border-slate-100'}`}>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-2">
                                        <div className={`h-5 w-40 rounded-lg ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                                        <div className={`h-3 w-28 rounded-full ${isDark ? 'bg-[#21262d]' : 'bg-slate-100'}`} />
                                    </div>
                                    <div className={`h-6 w-16 rounded-full ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                                </div>
                            </div>
                            <div className="p-5 space-y-4">
                                {/* Date row */}
                                <div className={`h-8 w-40 rounded-lg ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`} />
                                {/* Run hours row */}
                                <div className="space-y-1.5">
                                    <div className={`h-3 w-24 rounded-full ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                                    <div className="flex gap-3">
                                        <div className={`h-10 w-28 rounded-xl ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`} />
                                        <div className={`h-10 flex-1 rounded-xl ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`} />
                                    </div>
                                </div>
                                {/* Energy row */}
                                <div className="space-y-1.5">
                                    <div className={`h-3 w-24 rounded-full ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                                    <div className="flex gap-3">
                                        <div className={`h-10 w-28 rounded-xl ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`} />
                                        <div className={`h-10 flex-1 rounded-xl ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`} />
                                    </div>
                                </div>
                                {/* Diesel level + added row */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <div className={`h-3 w-20 rounded-full ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                                        <div className={`h-10 w-full rounded-xl ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className={`h-3 w-20 rounded-full ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                                        <div className={`h-10 w-full rounded-xl ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`} />
                                    </div>
                                </div>
                                {/* Save button */}
                                <div className={`h-11 w-full rounded-xl ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );

    // Render full-page Register View
    if (showRegisterView) {
        return (
            <DieselRegisterView
                propertyId={propertyId}
                isDark={isDark}
                onBack={() => setShowRegisterView(false)}
                onDataChange={fetchData}
            />
        );
    }

    return (
        <div className={`min-h-screen ${isDark ? 'bg-[#0d1117]' : 'bg-slate-50'} transition-colors duration-300`}>


            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-2 py-3 pb-6">
                {/* Action Buttons */}
                <div className="mb-6 flex items-center gap-1.5">
                    <button
                        onClick={() => setShowImportModal(true)}
                        className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-bold ${isDark ? 'bg-emerald-900/20 text-emerald-400 border-emerald-800/50 hover:bg-emerald-900/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'} rounded-lg border transition-all hover:scale-105 active:scale-95`}
                    >
                        <Upload className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline whitespace-nowrap">Import CSV</span>
                    </button>
                    <button
                        onClick={() => setShowTariffModal(true)}
                        className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-bold ${isDark ? 'bg-[#21262d] text-white border-[#30363d] hover:bg-[#30363d]' : 'bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50'} rounded-lg border transition-all hover:scale-105 active:scale-95`}
                    >
                        <Coins className="w-4 h-4 text-emerald-500 shrink-0" />
                        <span className="hidden sm:inline whitespace-nowrap">Fuel Costs</span>
                    </button>
                    <button
                        onClick={() => setShowRegisterView(true)}
                        className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-bold ${isDark ? 'bg-primary/10 text-primary border-primary/30 hover:bg-primary/20' : 'bg-primary/5 text-primary border-primary/20 hover:bg-primary/10'} rounded-lg border transition-all hover:scale-105 active:scale-95`}
                    >
                        <History className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline whitespace-nowrap">View Register</span>
                    </button>
                    <button
                        onClick={() => setShowConfigModal(true)}
                        className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-bold ${isDark ? 'bg-[#21262d] text-white border-[#30363d] hover:bg-[#30363d]' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'} rounded-lg border transition-all hover:scale-105 active:scale-95`}
                    >
                        <Plus className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline whitespace-nowrap">Add Generator</span>
                    </button>
                </div>

                <Toast
                    message={toast.message}
                    type={toast.type}
                    visible={toast.visible}
                    onClose={() => setToast(prev => ({ ...prev, visible: false }))}
                />

                {/* Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {generators.map(gen => (
                        <DieselLoggerCard
                            key={gen.id}
                            generator={gen}
                            previousClosing={previousClosings[gen.id]}
                            averageConsumption={averages[gen.id]}
                            activeTariff={activeTariffs[gen.id]}
                            onReadingChange={handleReadingChange}
                            onSave={handleSaveSingleReading}
                            onDelete={handleDeleteGenerator}
                            isSubmitting={isSubmitting}
                            isDark={isDark}
                        />
                    ))}
                    {generators.length === 0 && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-200 rounded-xl">
                            <p className="text-slate-400 font-bold">No generators found.</p>
                            <button onClick={() => setShowConfigModal(true)} className="mt-4 text-primary font-bold hover:underline">Configure Generators</button>
                        </div>
                    )}
                </div>
            </main>



            {/* Config Modal */}
            <GeneratorConfigModal
                isOpen={showConfigModal}
                onClose={() => setShowConfigModal(false)}
                onSubmit={async (data) => {
                    const res = await fetch(`/api/properties/${propertyId}/generators`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if (res.ok) fetchData();
                }}
                isDark={isDark}
            />

            <DGTariffModal
                isOpen={showTariffModal}
                onClose={() => {
                    setShowTariffModal(false);
                    fetchData(); // Refresh to get new rates
                }}
                propertyId={propertyId}
                generators={generators}
                isDark={isDark}
            />

            <DieselImportModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                propertyId={propertyId}
                generators={generators}
                onSuccess={(count) => {
                    setToast({ message: `✅ ${count} readings imported successfully!`, type: 'success', visible: true });
                    fetchData();
                }}
            />
        </div >
    );
};

export default DieselStaffDashboard;
