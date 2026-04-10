/**
 * ElectricityStaffDashboard
 * Staff-facing electricity logging dashboard with quick entry forms.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { History, Settings, CheckCircle, AlertTriangle, ArrowLeft, Zap, Upload } from 'lucide-react';
import { motion } from 'framer-motion';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import ElectricityLoggerCard from './ElectricityLoggerCard';
import ElectricityMeterConfigModal from './ElectricityMeterConfigModal';
import ElectricityReadingHistory from './ElectricityReadingHistory';
import ElectricityImportModal from './ElectricityImportModal';
import { Toast } from '../ui/Toast';
import { useDataCache } from '@/frontend/context/DataCacheContext';

interface ElectricityMeter {
    id: string;
    name: string;
    meter_number?: string;
    meter_type?: string;
    max_load_kw?: number;
    status: string;
    last_reading?: number;
    property_id: string;
}

interface Property {
    id: string;
    name: string;
    code: string;
}

interface ElectricityReading {
    opening_reading: number;
    closing_reading: number;
    computed_units?: number;
    final_units?: number;
    multiplier_id?: string;
    multiplier_value?: number;
    notes?: string;
    reading_date?: string;
    photo_url?: string;
    ocr_reading?: number;
    ocr_confidence?: number;
    ocr_status?: string;
}

interface MeterMultiplier {
    id: string;
    meter_id: string;
    multiplier_value: number;
    ct_ratio_primary: number;
    ct_ratio_secondary: number;
    pt_ratio_primary: number;
    pt_ratio_secondary: number;
    meter_constant: number;
    effective_from: string;
}

interface GridTariff {
    id: string;
    rate_per_unit: number;
    utility_provider?: string;
    effective_from: string;
}

interface ElectricityStaffDashboardProps {
    isDark?: boolean;
    propertyId?: string;
    isEmbedded?: boolean;
}

/**
 * Staff Dashboard for daily electricity logging
 * v2.1: Simplified logger with per-card save and no cost display.
 */
const ElectricityStaffDashboard: React.FC<ElectricityStaffDashboardProps> = ({ isDark = false, propertyId: propIdFromProps, isEmbedded = false }) => {
    const params = useParams();
    const router = useRouter();
    const propertyId = propIdFromProps || (params?.propertyId as string);
    const supabase = createClient();
    const { getCachedData, setCachedData, invalidateCache } = useDataCache();

    // State
    const [property, setProperty] = useState<Property | null>(null);
    const [meters, setMeters] = useState<ElectricityMeter[]>([]);
    const [readings, setReadings] = useState<Record<string, ElectricityReading>>({});
    const [previousClosings, setPreviousClosings] = useState<Record<string, number>>({});
    const [averages, setAverages] = useState<Record<string, number>>({});
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error', visible: boolean }>({
        message: '',
        type: 'success',
        visible: false
    });

    // v2: Multipliers and Tariffs state
    const [multipliersMap, setMultipliersMap] = useState<Record<string, MeterMultiplier[]>>({});
    const [activeTariff, setActiveTariff] = useState<GridTariff | null>(null);
    const [retakeTasks, setRetakeTasks] = useState<Record<string, any>>({});



    // Fetch property and meters
    const fetchData = useCallback(async () => {
        if (!propertyId) return;
        
        const cacheKey = `electricity-data-${propertyId}`;
        const cached = getCachedData(cacheKey);

        if (cached) {
            console.log('[ElectricityDashboard] Loading from cache:', propertyId);
            setProperty(cached.property);
            setMeters(cached.meters);
            setPreviousClosings(cached.previousClosings);
            setAverages(cached.averages);
            setMultipliersMap(cached.multipliersMap);
            setActiveTariff(cached.activeTariff);
            setRetakeTasks(cached.retakeTasks || {});
            setIsLoading(false); // Stop skeleton if we have cache
        } else {
            setIsLoading(true);
        }

        setError(null);
        console.log('[ElectricityDashboard] Refreshing data for property:', propertyId);

        let closings: Record<string, number> = {};
        let avgs: Record<string, number> = {};
        let multMap: Record<string, MeterMultiplier[]> = {};
        let activeTariffData: GridTariff | null = null;

        try {
            // Fetch property
            const { data: propData, error: propError } = await supabase
                .from('properties')
                .select('id, name, code')
                .eq('id', propertyId)
                .single();

            if (propError) throw propError;
            setProperty(propData);

            // Fetch meters
            const { data: metersData, error: metersError } = await supabase
                .from('electricity_meters')
                .select('*')
                .eq('property_id', propertyId)
                .is('deleted_at', null)
                .order('name');

            if (metersError) throw metersError;

            const fetchedMeters = metersData || [];
            setMeters(fetchedMeters);
            console.log('[ElectricityDashboard] Fetched', fetchedMeters.length, 'meters');

            // Fetch yesterday's readings for opening readings
            if (fetchedMeters.length > 0) {
                // We'll use the last_reading from the meter itself as the primary fallback,
                // but fetching the latest reading specifically can be redundant if last_reading is robust.
                // However, fetching strictly yesterday's reading might be intentional for daily logs.
                // Let's stick to checking the latest reading entry for relevant meters.

                const { data: latestReadings, error: latestError } = await supabase
                    .from('electricity_readings')
                    .select('meter_id, closing_reading, reading_date, created_at')
                    .eq('property_id', propertyId)
                    .order('reading_date', { ascending: false })
                    .order('created_at', { ascending: false })
                    .limit(fetchedMeters.length * 2); // Get recent history

                if (!latestError && latestReadings) {
                    // Logic: Find the most recent closing reading for each meter
                    latestReadings.forEach((r) => {
                        if (!closings[r.meter_id]) {
                            closings[r.meter_id] = r.closing_reading;
                        }
                    });
                    setPreviousClosings(closings);
                }

                // Fetch 30-day averages
                const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                const avgRes = await fetch(
                    `/api/properties/${propertyId}/electricity-readings?startDate=${monthAgo}`
                );
                if (avgRes.ok) {
                    const avgData = await avgRes.json();
                    const avgByMeter: Record<string, number[]> = {};
                    avgData.forEach((r: any) => {
                        if (!avgByMeter[r.meter_id]) avgByMeter[r.meter_id] = [];
                        const units = r.final_units !== undefined ? r.final_units : r.computed_units;
                        if (units) avgByMeter[r.meter_id].push(units);
                    });
                    
                    Object.entries(avgByMeter).forEach(([meterId, values]) => {
                        if (values.length > 0) {
                            avgs[meterId] = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
                        }
                    });
                    setAverages(avgs);
                    console.log('[ElectricityDashboard] Averages:', avgs);
                }

                // v2: Fetch multipliers for all meters
                const multipliersRes = await fetch(`/api/properties/${propertyId}/meter-multipliers`);
                if (multipliersRes.ok) {
                    const multipliersData = await multipliersRes.json();
                    multipliersData.forEach((m: any) => {
                        if (!multMap[m.meter_id]) multMap[m.meter_id] = [];
                        multMap[m.meter_id].push(m);
                    });
                    setMultipliersMap(multMap);
                    console.log('[ElectricityDashboard] Multipliers fetched for', Object.keys(multMap).length, 'meters');
                }

                // v2: Fetch active tariff for property
                const today = new Date().toISOString().split('T')[0];
                const tariffRes = await fetch(`/api/properties/${propertyId}/grid-tariffs?date=${today}`);
                if (tariffRes.ok) {
                    activeTariffData = await tariffRes.json();
                    setActiveTariff(activeTariffData);
                    console.log('[ElectricityDashboard] Active tariff:', activeTariffData?.rate_per_unit);
                }

                // Fetch pending retakes
                const { data: retakeData } = await supabase
                    .from('electricity_readings')
                    .select('id, meter_id, reading_date, opening_reading, closing_reading, photo_url')
                    .eq('property_id', propertyId)
                    .eq('ocr_status', 'retake');

                const retakes: Record<string, any> = {};
                retakeData?.forEach(r => {
                    retakes[r.meter_id] = r;
                });
                setRetakeTasks(retakes);

                // Update Cache
                setCachedData(cacheKey, {
                    property: propData,
                    meters: fetchedMeters,
                    previousClosings: closings,
                    averages: avgs,
                    multipliersMap: multMap,
                    activeTariff: activeTariffData,
                    retakeTasks: retakes
                });
            }
        } catch (err: any) {
            console.error('[ElectricityDashboard] Error:', err.message);
            setError(err.message || 'Failed to load data');
        } finally {
            setIsLoading(false);
        }
    }, [propertyId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handle reading changes from cards
    const handleReadingChange = (meterId: string, reading: ElectricityReading) => {
        setReadings(prev => ({ ...prev, [meterId]: reading }));
    };

    // Keep validation logic for Submit All fallback
    const validReadingsCount = Object.values(readings).filter(
        r => r.closing_reading > r.opening_reading
    ).length;

    // Submit all readings (fallback)
    const handleSubmitAll = async () => {
        if (validReadingsCount === 0) {
            setError('Please enter at least one valid reading');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        console.log('[ElectricityDashboard] Submitting', validReadingsCount, 'readings');

        try {
            const readingsToSubmit = Object.entries(readings)
                .filter(([_, r]) => r.closing_reading > r.opening_reading)
                .map(([meterId, r]) => ({
                    meter_id: meterId,
                    reading_date: r.reading_date || new Date().toISOString().split('T')[0],
                    ...r,
                    alert_status: averages[meterId] && (r.final_units ?? r.computed_units) &&
                        (r.final_units ?? r.computed_units)! > averages[meterId] * 1.25 ? 'warning' : 'normal',
                }));

            const res = await fetch(`/api/properties/${propertyId}/electricity-readings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ readings: readingsToSubmit }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to submit readings');
            }

            console.log('[ElectricityDashboard] Submission successful');
            setToast({ message: 'All readings submitted successfully!', type: 'success', visible: true });
            setTimeout(() => setSuccessMessage(null), 3000);

            // Reset readings
            setReadings({});
            invalidateCache(`electricity-data-${propertyId}`);
            fetchData(); // Refresh to get new last_reading values
        } catch (err: any) {
            console.error('[ElectricityDashboard] Submit error:', err.message);
            setError(err.message || 'Failed to submit readings');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Submit single reading
    const handleSaveSingleReading = async (meterId: string) => {
        const r = readings[meterId];
        if (!r || r.closing_reading <= r.opening_reading) return;

        console.log('[ElectricityDashboard] Saving single reading:', meterId);
        setIsSubmitting(true);
        setError(null);

        try {
            const readingToSubmit = {
                meter_id: meterId,
                reading_date: r.reading_date || new Date().toISOString().split('T')[0],
                ...r,
                alert_status: 'normal',
            };

            const res = await fetch(`/api/properties/${propertyId}/electricity-readings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ readings: [readingToSubmit] }),
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to save reading');
            }

            setToast({ message: 'Entry saved successfully', type: 'success', visible: true });
            setTimeout(() => setSuccessMessage(null), 3000);

            // Refresh & Invalidate
            invalidateCache(`electricity-data-${propertyId}`);
            fetchData();
        } catch (err: any) {
            console.error('[ElectricityDashboard] Save error:', err.message);
            setToast({ message: err.message, type: 'error', visible: true });
        } finally {
            setIsSubmitting(false);
        }
    };

    // v2: Save multiplier from card flip editor
    const handleSaveMultiplier = async (meterId: string, multiplierData: any) => {
        console.log('[ElectricityDashboard] Saving multiplier for meter:', meterId, multiplierData);

        const res = await fetch(`/api/properties/${propertyId}/meter-multipliers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(multiplierData),
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to save multiplier');
        }

        const newMult = await res.json();
        console.log('[ElectricityDashboard] Multiplier saved:', newMult.id);

        // Update local state
        setMultipliersMap(prev => ({
            ...prev,
            [meterId]: [newMult, ...(prev[meterId] || []).slice(0, 4)], // Keep last 5
        }));

        invalidateCache(`electricity-data-${propertyId}`);
        setToast({ message: 'Multiplier saved successfully!', type: 'success', visible: true });
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    // Add meter
    const handleAddMeter = async (data: any) => {
        console.log('[ElectricityDashboard] Adding meter:', data);

        const res = await fetch(`/api/properties/${propertyId}/electricity-meters`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to add meter');
        }

        setToast({ message: 'Meter added successfully!', type: 'success', visible: true });
        invalidateCache(`electricity-data-${propertyId}`);
        fetchData();
    };

    const handleDeleteMeter = async (meterId: string) => {
        try {
            const res = await fetch(`/api/properties/${propertyId}/electricity-meters?id=${meterId}`, {
                method: 'DELETE'
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || 'Failed to delete meter');
            }

            setToast({ message: 'Meter deleted successfully', type: 'success', visible: true });
            setTimeout(() => setSuccessMessage(null), 3000);
            invalidateCache(`electricity-data-${propertyId}`);
            fetchData();
        } catch (err: any) {
            console.error('Delete error:', err);
            setToast({ message: err.message || 'Failed to delete meter', type: 'error', visible: true });
        }
    };

    // Export
    const handleExport = () => {
        const today = new Date().toISOString().split('T')[0];
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        window.open(`/api/properties/${propertyId}/electricity-export?startDate=${monthAgo}&endDate=${today}`, '_blank');
    };

    if (!propertyId) return <div>Select Property</div>;
    if (isLoading) return (
        <div className={`${isEmbedded ? '' : 'min-h-screen'} bg-background pb-8`}>
            <main className={`flex-1 w-full ${isEmbedded ? 'px-2 py-4' : 'max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8'}`}>
                {/* Header skeleton */}
                <div className={`${isEmbedded ? 'mb-6' : 'mb-10'} flex flex-col md:flex-row md:items-end justify-between gap-4`}>
                    <div className="space-y-2">
                        <div className={`h-3 w-24 rounded-full animate-pulse ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                        <div className={`h-9 w-64 rounded-xl animate-pulse ${isDark ? 'bg-[#21262d]' : 'bg-slate-200'}`} />
                        <div className={`h-4 w-96 rounded-full animate-pulse ${isDark ? 'bg-[#30363d]' : 'bg-slate-100'}`} />
                    </div>
                    <div className="flex items-center gap-2">
                        {[80, 96, 72].map((w, i) => (
                            <div key={i} className={`h-9 rounded-lg animate-pulse ${isDark ? 'bg-[#21262d]' : 'bg-slate-200'}`} style={{ width: w }} />
                        ))}
                    </div>
                </div>
                {/* Meter cards skeleton */}
                <div className={`grid gap-6 ${isEmbedded ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                    {[1, 2, 3].map(i => (
                        <div key={i} className={`rounded-2xl border overflow-hidden animate-pulse ${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200'}`}>
                            {/* Status strip */}
                            <div className={`h-1 w-full ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                            <div className="p-5 space-y-4">
                                {/* Meter name + type */}
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1.5">
                                        <div className={`h-5 w-36 rounded-lg ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                                        <div className={`h-3 w-24 rounded-full ${isDark ? 'bg-[#21262d]' : 'bg-slate-100'}`} />
                                    </div>
                                    <div className={`h-7 w-7 rounded-lg ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                                </div>
                                {/* Date input */}
                                <div className={`h-10 w-full rounded-xl ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`} />
                                {/* Opening reading */}
                                <div className="space-y-1">
                                    <div className={`h-3 w-28 rounded-full ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                                    <div className={`h-12 w-full rounded-xl ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`} />
                                </div>
                                {/* Closing reading */}
                                <div className="space-y-1">
                                    <div className={`h-3 w-28 rounded-full ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                                    <div className={`h-14 w-full rounded-xl ${isDark ? 'bg-[#0d1117]' : 'bg-slate-100'}`} />
                                </div>
                                {/* Save button */}
                                <div className={`h-12 w-full rounded-xl ${isDark ? 'bg-[#30363d]' : 'bg-slate-200'}`} />
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );

    return (
        <div className={`${isEmbedded ? '' : 'min-h-screen'} bg-background pb-8 transition-colors duration-300`}>


            {/* Main Content */}
            <main className={`flex-1 w-full ${isEmbedded ? 'px-2 py-4' : 'max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8'}`}>
                {/* Action Buttons */}
                <div className={`${isEmbedded ? 'mb-6' : 'mb-6'} flex items-center gap-1.5`}>
                    <button
                        onClick={() => setShowImportModal(true)}
                        className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-bold ${isDark ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' : 'text-emerald-600 bg-emerald-50 border-emerald-100'} rounded-lg border transition-all hover:scale-105 active:scale-95`}
                    >
                        <Upload className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline whitespace-nowrap">Import CSV</span>
                    </button>
                    <button onClick={() => setShowHistory(true)} className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-bold ${isDark ? 'text-slate-300 bg-[#161b22] border-[#30363d]' : 'text-slate-600 bg-white border-slate-200'} rounded-lg border transition-all hover:scale-105 active:scale-95`}>
                        <History className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline whitespace-nowrap">View History</span>
                    </button>
                    <button onClick={() => setShowConfigModal(true)} className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 text-xs sm:text-sm font-bold ${isDark ? 'text-slate-300 bg-[#161b22] border-[#30363d]' : 'text-slate-600 bg-white border-slate-200'} rounded-lg border transition-all hover:scale-105 active:scale-95`}>
                        <Settings className="w-4 h-4 shrink-0" /> <span className="hidden sm:inline whitespace-nowrap">Config</span>
                    </button>
                </div>

                <ElectricityImportModal
                    isOpen={showImportModal}
                    onClose={() => setShowImportModal(false)}
                    propertyId={propertyId}
                    meters={meters}
                    onSuccess={(count) => {
                        setToast({ message: `${count} readings imported successfully!`, type: 'success', visible: true });
                        fetchData();
                    }}
                />

                <Toast
                    message={toast.message}
                    type={toast.type}
                    visible={toast.visible}
                    onClose={() => setToast(prev => ({ ...prev, visible: false }))}
                />

                {/* Meters Grid */}
                {meters.length === 0 ? (
                    <div className="rounded-3xl p-12 text-center border bg-white border-slate-100 shadow-sm">
                        <Zap className="w-16 h-16 text-primary/20 mx-auto mb-4" />
                        <h3 className="text-xl font-bold mb-2">No Meters Configured</h3>
                        <button onClick={() => setShowConfigModal(true)} className="px-6 py-3 bg-primary text-white font-bold rounded-xl shadow-lg">+ Add Meter</button>
                    </div>
                ) : (
                    <div className={`grid gap-6 ${isEmbedded ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                        {meters.map((meter) => (
                            <ElectricityLoggerCard
                                key={meter.id}
                                meter={meter}
                                previousClosing={previousClosings[meter.id]}
                                averageConsumption={averages[meter.id]}
                                multipliers={multipliersMap[meter.id] || []}
                                activeTariffRate={activeTariff?.rate_per_unit || 0}
                                onReadingChange={handleReadingChange}
                                onSave={handleSaveSingleReading}
                                onMultiplierSave={handleSaveMultiplier}
                                onDelete={handleDeleteMeter}
                                isSubmitting={isSubmitting}
                                isDark={isDark}
                                retakeTask={retakeTasks[meter.id]}
                            />
                        ))}
                    </div>
                )}
            </main>

            <ElectricityMeterConfigModal
                isOpen={showConfigModal}
                onClose={() => setShowConfigModal(false)}
                onSubmit={handleAddMeter}
                isDark={isDark}
            />

            {showHistory && (
                <div className={`fixed inset-0 ${isEmbedded ? '' : 'lg:ml-64'} z-[60] bg-background animate-in slide-in-from-right duration-300 shadow-2xl border-l border-slate-300 overflow-y-auto`}>
                    <ElectricityReadingHistory
                        propertyId={propertyId}
                        isDark={isDark}
                        onBack={() => setShowHistory(false)}
                        onDeleteSuccess={fetchData}
                    />
                </div>
            )}
        </div>
    );
};

export default ElectricityStaffDashboard;
