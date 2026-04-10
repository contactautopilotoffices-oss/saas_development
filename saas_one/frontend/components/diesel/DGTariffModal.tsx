/**
 * DGTariffModal
 * Modal for configuring Diesel Generator (DG) tariff rates.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { X, Plus, Fuel, History, AlertTriangle, Save, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface DGTariffModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    generators: any[];
    isDark?: boolean;
}

interface DGTariff {
    id: string;
    generator_id: string;
    cost_per_litre: number;
    effective_from: string;
    effective_to?: string | null;
}

const DGTariffModal: React.FC<DGTariffModalProps> = ({
    isOpen,
    onClose,
    propertyId,
    generators,
    isDark = false,
}) => {
    const [selectedGenId, setSelectedGenId] = useState<string>(generators[0]?.id || '');
    const [costPerLitre, setCostPerLitre] = useState<number | ''>('');
    const [effectiveFrom, setEffectiveFrom] = useState<string>(new Date().toISOString().split('T')[0]);
    const [tariffs, setTariffs] = useState<DGTariff[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Update selected generator when generators prop changes
    useEffect(() => {
        if (generators.length > 0 && !selectedGenId) {
            setSelectedGenId(generators[0].id);
        }
    }, [generators, selectedGenId]);

    // Fetch tariffs for selected generator
    const fetchTariffs = async () => {
        if (!selectedGenId) return;
        setIsLoading(true);
        try {
            const res = await fetch(`/api/properties/${propertyId}/dg-tariffs?generatorId=${selectedGenId}&includeHistory=true`);
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
        if (isOpen && selectedGenId) {
            fetchTariffs();
        }
    }, [isOpen, selectedGenId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedGenId || !costPerLitre || !effectiveFrom) {
            setError('Please fill all required fields');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const res = await fetch(`/api/properties/${propertyId}/dg-tariffs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    generator_id: selectedGenId,
                    cost_per_litre: Number(costPerLitre),
                    effective_from: effectiveFrom,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to save tariff');
            }

            setCostPerLitre('');
            fetchTariffs();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to delete this price entry?')) return;

        try {
            const res = await fetch(`/api/properties/${propertyId}/dg-tariffs?id=${id}`, {
                method: 'DELETE',
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete tariff');
            }

            fetchTariffs();
        } catch (err: any) {
            setError(err.message);
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
                                <div className="p-2 bg-emerald-500/10 rounded-xl">
                                    <Fuel className="w-6 h-6 text-emerald-500" />
                                </div>
                                <div>
                                    <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Fuel Cost Configuration</h2>
                                    <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>Set and update diesel prices for generators</p>
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
                                Update Diesel Price
                            </h3>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Select Generator</label>
                                    <select
                                        value={selectedGenId}
                                        onChange={(e) => setSelectedGenId(e.target.value)}
                                        className={`w-full p-3 rounded-xl border text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                                    >
                                        {generators.map(gen => (
                                            <option key={gen.id} value={gen.id}>{gen.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Cost per Litre (₹)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={costPerLitre}
                                        onChange={(e) => setCostPerLitre(e.target.value === '' ? '' : parseFloat(e.target.value))}
                                        placeholder="e.g. 94.50"
                                        className={`w-full p-3 rounded-xl border text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Effective From</label>
                                    <input
                                        type="date"
                                        value={effectiveFrom}
                                        onChange={(e) => setEffectiveFrom(e.target.value)}
                                        className={`w-full p-3 rounded-xl border text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
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
                                    disabled={isSubmitting || !costPerLitre}
                                    className={`w-full p-4 bg-emerald-500 text-white font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-2`}
                                >
                                    {isSubmitting ? (
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4" />
                                    )}
                                    Update Price
                                </button>
                            </form>
                        </div>

                        {/* History Section */}
                        <div className={`p-6 ${isDark ? 'bg-[#0d1117]' : 'bg-slate-50'} overflow-y-auto max-h-[400px]`}>
                            <h3 className={`text-sm font-black ${isDark ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-widest mb-4 flex items-center gap-2`}>
                                <History className="w-4 h-4" />
                                Price History
                            </h3>

                            {isLoading ? (
                                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                                    <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
                                    <p className="text-[10px] font-black uppercase tracking-widest">Fetching data...</p>
                                </div>
                            ) : tariffs.length === 0 ? (
                                <div className="text-center py-20">
                                    <Fuel className="w-8 h-8 text-slate-300 mx-auto mb-2 opacity-50" />
                                    <p className="text-xs font-bold text-slate-400">No prices configured</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {tariffs.map((tariff, idx) => (
                                        <div
                                            key={tariff.id}
                                            className={`p-4 rounded-xl border ${idx === 0 ? (isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50/50 border-emerald-500/20') : (isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-100')} transition-all`}
                                        >
                                            <div className="flex items-center justify-between mb-2">
                                                <span className={`text-lg font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>₹{tariff.cost_per_litre}</span>
                                                <div className="flex items-center gap-2">
                                                    {idx === 0 && (
                                                        <span className="px-2 py-0.5 bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest rounded-full">Active</span>
                                                    )}
                                                    <button
                                                        onClick={() => handleDelete(tariff.id)}
                                                        className={`p-1.5 rounded-lg transition-colors ${isDark ? 'text-slate-500 hover:text-rose-500 hover:bg-rose-500/10' : 'text-slate-400 hover:text-rose-500 hover:bg-rose-50'}`}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
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

export default DGTariffModal;
