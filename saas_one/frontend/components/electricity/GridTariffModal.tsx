/**
 * GridTariffModal
 * Modal for configuring grid electricity tariff rates and slabs.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Zap, History, AlertTriangle, Save, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GridTariffModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    isDark?: boolean;
}

interface GridTariff {
    id: string;
    rate_per_unit: number;
    utility_provider?: string;
    effective_from: string;
    effective_to?: string | null;
}

const GridTariffModal: React.FC<GridTariffModalProps> = ({
    isOpen,
    onClose,
    propertyId,
    isDark = false,
}) => {
    const [ratePerUnit, setRatePerUnit] = useState<number | ''>('');
    const [effectiveFrom, setEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);
    const [utilityProvider, setUtilityProvider] = useState<string>('');
    const [tariffs, setTariffs] = useState<GridTariff[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch tariffs
    const fetchTariffs = async () => {
        if (!propertyId) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/properties/${propertyId}/grid-tariffs?includeHistory=true`);
            if (res.ok) {
                const data = await res.json();
                setTariffs(data);
            }
        } catch (err) {
            console.error('Error fetching tariffs:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen && propertyId) {
            fetchTariffs();
        }
    }, [isOpen, propertyId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ratePerUnit || !effectiveFrom) {
            setError('Please fill all required fields');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/api/properties/${propertyId}/grid-tariffs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    rate_per_unit: Number(ratePerUnit),
                    effective_from: effectiveFrom,
                    utility_provider: utilityProvider || null,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save tariff');
            }

            setRatePerUnit('');
            setUtilityProvider('');
            fetchTariffs();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this tariff? This will also clear calculations for recorded readings in this period.')) {
            return;
        }

        setDeletingId(id);
        setError(null);

        try {
            const res = await fetch(`/api/properties/${propertyId}/grid-tariffs?id=${id}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete tariff');
            }

            fetchTariffs();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setDeletingId(null);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className={`relative w-full max-w-2xl ${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200'} border rounded-3xl shadow-2xl overflow-hidden`}
                >
                    {/* Header */}
                    <div className={`p-6 border-b ${isDark ? 'border-[#30363d]' : 'border-slate-100'}`}>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 rounded-xl">
                                    <Zap className="w-6 h-6 text-primary" />
                                </div>
                                <div>
                                    <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Grid Tariff Configuration</h2>
                                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Set and update electricity rates (kVAh)</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2">
                        {/* Form Section */}
                        <div className={`p-6 border-r ${isDark ? 'border-[#30363d]' : 'border-slate-100'}`}>
                            <h3 className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'} mb-4 flex items-center gap-2`}>
                                <Plus className="w-4 h-4" />
                                Update Tariff Rate
                            </h3>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Rate per kVAh (₹)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={ratePerUnit}
                                        onChange={(e) => setRatePerUnit(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                        placeholder="e.g. 8.50"
                                        className={`w-full p-3 rounded-xl border text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Utility Provider (Optional)</label>
                                    <input
                                        type="text"
                                        value={utilityProvider}
                                        onChange={(e) => setUtilityProvider(e.target.value)}
                                        placeholder="e.g. Tata Power, BESCOM"
                                        className={`w-full p-3 rounded-xl border text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Effective From</label>
                                    <input
                                        type="date"
                                        value={effectiveFrom}
                                        onChange={(e) => setEffectiveFrom(e.target.value)}
                                        className={`w-full p-3 rounded-xl border text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none transition-all ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-2 text-rose-500 text-xs font-bold">
                                        <AlertTriangle className="w-4 h-4" />
                                        {error}
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSubmitting || !ratePerUnit}
                                    className={`w-full p-4 bg-primary text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:opacity-90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-2`}
                                >
                                    {isSubmitting ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4" />
                                    )}
                                    Update Rate
                                </button>
                            </form>
                        </div>

                        {/* History Section */}
                        <div className={`p-6 ${isDark ? 'bg-[#0d1117]' : 'bg-slate-50'} overflow-y-auto max-h-[400px]`}>
                            <h3 className={`text-sm font-black ${isDark ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-widest mb-4 flex items-center gap-2`}>
                                <History className="w-4 h-4" />
                                Tariff History
                            </h3>

                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mb-4" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Fetching data...</p>
                                </div>
                            ) : tariffs.length === 0 ? (
                                <div className="text-center py-20">
                                    <Zap className="w-8 h-8 text-slate-300 mx-auto mb-2 opacity-50" />
                                    <p className="text-xs font-bold text-slate-400">No tariffs configured</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tariffs.map((tariff, idx) => (
                                        <div
                                            key={tariff.id}
                                            className={`p-4 rounded-xl border ${idx === 0 ? (isDark ? 'bg-primary/5 border-primary/20' : 'bg-primary/5 border-primary/20') : (isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-100')} transition-all`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex flex-col">
                                                    <span className={`text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>₹{tariff.rate_per_unit}</span>
                                                    {tariff.utility_provider && (
                                                        <span className="text-[10px] font-bold text-slate-500">{tariff.utility_provider}</span>
                                                    )}
                                                </div>
                                                {idx === 0 && (
                                                    <span className="px-2 py-0.5 bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest rounded-full">Active</span>
                                                )}
                                                <button
                                                    onClick={() => handleDelete(tariff.id)}
                                                    disabled={deletingId === tariff.id}
                                                    className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                    title="Delete Tariff"
                                                >
                                                    {deletingId === tariff.id ? (
                                                        <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                                                <span>From: {new Date(tariff.effective_from).toLocaleDateString()}</span>
                                                {tariff.effective_to && (
                                                    <span>To: {new Date(tariff.effective_to).toLocaleDateString()}</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default GridTariffModal;
