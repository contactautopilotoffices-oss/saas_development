/**
 * GeneratorConfigModal
 * Modal for configuring DG generators (name, capacity, diesel tank size).
 * @remarks Client component.
 */

'use client';

import React, { useState } from 'react';
import { X, Plus, Fuel, Settings2, Calendar, Database, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface GeneratorConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (generator: GeneratorFormData) => Promise<void>;
    existingGenerator?: GeneratorFormData & { id: string };
    isDark?: boolean;
}

interface GeneratorFormData {
    name: string;
    make: string;
    capacity_kva: number;
    tank_capacity_litres: number;
    status: 'active' | 'inactive';
    last_maintenance_date?: string;
    next_maintenance_date?: string;
    // Initial Setup Fields (shown only on creation)
    initial_kwh_reading?: number;
    initial_run_hours?: number;
    initial_diesel_level?: number;
    effective_from_date?: string;
}

const GeneratorConfigModal: React.FC<GeneratorConfigModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    existingGenerator,
    isDark = false,
}) => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState<GeneratorFormData>({
        name: existingGenerator?.name || '',
        make: existingGenerator?.make || '',
        capacity_kva: existingGenerator?.capacity_kva || 500,
        tank_capacity_litres: existingGenerator?.tank_capacity_litres || 1000,
        status: (existingGenerator?.status as any) || 'active',
        last_maintenance_date: existingGenerator?.last_maintenance_date || '',
        next_maintenance_date: existingGenerator?.next_maintenance_date || '',
        initial_kwh_reading: 0,
        initial_run_hours: 0,
        initial_diesel_level: 0,
        effective_from_date: new Date().toISOString().split('T')[0],
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Validation
        if (!formData.name.trim()) {
            setError('Generator name is required');
            return;
        }

        if (formData.capacity_kva <= 0) {
            setError('Capacity must be greater than 0');
            return;
        }

        if (formData.tank_capacity_litres <= 0) {
            setError('Tank capacity must be greater than 0');
            return;
        }

        if (!existingGenerator) {
            if ((formData.initial_diesel_level || 0) > formData.tank_capacity_litres) {
                setError('Initial diesel level cannot exceed tank capacity');
                return;
            }
        }

        setIsSubmitting(true);
        try {
            await onSubmit(formData);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save generator');
        } finally {
            setIsSubmitting(false);
        }
    };

    const updateField = (field: keyof GeneratorFormData, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    if (!isOpen) return null;

    const isNew = !existingGenerator;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className={`relative ${isDark ? 'bg-[#161b22] border-[#21262d]' : 'bg-white'} border rounded-3xl shadow-2xl w-full max-w-xl mx-auto overflow-hidden flex flex-col max-h-[90vh]`}
                >
                    {/* Header */}
                    <div className={`flex items-center justify-between px-8 py-6 border-b ${isDark ? 'border-[#21262d] bg-[#0d1117]' : 'border-slate-100 bg-slate-50/50'}`}>
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 ${isDark ? 'bg-primary/10' : 'bg-primary/10'} rounded-2xl flex items-center justify-center`}>
                                <Settings2 className={`w-6 h-6 ${isDark ? 'text-primary' : 'text-primary'}`} />
                            </div>
                            <div>
                                <h2 className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'} tracking-tight`}>
                                    {isNew ? 'Configure New Generator' : 'Edit Generator'}
                                </h2>
                                <p className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>DG identity & static attributes</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className={`p-2 ${isDark ? 'hover:bg-[#21262d]' : 'hover:bg-slate-100'} rounded-xl transition-colors`}
                        >
                            <X className={`w-5 h-5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                        </button>
                    </div>

                    {/* Scrollable Form */}
                    <form onSubmit={handleSubmit} className="p-8 space-y-8 overflow-y-auto">
                        {error && (
                            <div className={`${isDark ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-700'} text-xs font-black uppercase tracking-widest px-4 py-3 rounded-xl border flex items-center gap-2`}>
                                <ShieldCheck className="w-4 h-4" />
                                {error}
                            </div>
                        )}

                        {/* Section 1: Generator Identity */}
                        <div className="space-y-6">
                            <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-slate-600' : 'text-slate-400'} flex items-center gap-2`}>
                                <Database className="w-3 h-3" />
                                Generator Identity
                            </h3>
                            <div className="grid grid-cols-2 gap-6">
                                <label className="flex flex-col gap-2">
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                                        Generator Name <span className="text-rose-500">*</span>
                                    </span>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => updateField('name', e.target.value)}
                                        placeholder="e.g., DG-1"
                                        className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white focus:border-primary' : 'bg-slate-50 border-slate-200 focus:border-primary'} rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-4 ${isDark ? 'focus:ring-primary/10' : 'focus:ring-primary/10'} border transition-all`}
                                    />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Make</span>
                                    <input
                                        type="text"
                                        value={formData.make}
                                        onChange={(e) => updateField('make', e.target.value)}
                                        placeholder="e.g., Cummins"
                                        className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-slate-50 border-slate-200'} rounded-xl px-4 py-3 text-sm font-bold border focus:outline-none`}
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Section 2: Capacity & Storage */}
                        <div className="space-y-6">
                            <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-slate-600' : 'text-slate-400'} flex items-center gap-2`}>
                                <Fuel className="w-3 h-3" />
                                Capacity & Fuel Storage
                            </h3>
                            <div className="grid grid-cols-2 gap-6">
                                <label className="flex flex-col gap-2">
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Capacity (KVA) *</span>
                                    <input
                                        type="number"
                                        value={formData.capacity_kva || ''}
                                        onChange={(e) => updateField('capacity_kva', parseInt(e.target.value) || 0)}
                                        className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-slate-50 border-slate-200'} rounded-xl px-4 py-3 text-sm font-bold border focus:outline-none`}
                                    />
                                </label>
                                <label className="flex flex-col gap-2">
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Tank Capacity (L) *</span>
                                    <input
                                        type="number"
                                        value={formData.tank_capacity_litres || ''}
                                        onChange={(e) => updateField('tank_capacity_litres', parseInt(e.target.value) || 0)}
                                        className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-slate-50 border-slate-200'} rounded-xl px-4 py-3 text-sm font-bold border focus:outline-none`}
                                    />
                                </label>
                            </div>
                        </div>

                        {/* Section 3: Status & Maintenance */}
                        <div className="grid grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Status</h3>
                                <select
                                    value={formData.status}
                                    onChange={(e) => updateField('status', e.target.value)}
                                    className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-slate-50 border-slate-200'} rounded-xl px-4 py-3 text-sm font-bold border focus:outline-none`}
                                >
                                    <option value="active">Active</option>
                                    <option value="inactive">Inactive</option>
                                </select>
                            </div>
                            <div className="space-y-6">
                                <h3 className={`text-[10px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>Next Maintenance</h3>
                                <input
                                    type="date"
                                    value={formData.next_maintenance_date || ''}
                                    onChange={(e) => updateField('next_maintenance_date', e.target.value)}
                                    className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-slate-50 border-slate-200'} rounded-xl px-4 py-3 text-sm font-bold border focus:outline-none`}
                                />
                            </div>
                        </div>

                        {/* Initial Setup Section (Only for new generators) */}
                        {isNew && (
                            <div className={`mt-4 p-6 rounded-3xl border-2 border-dashed ${isDark ? 'bg-primary/5 border-primary/20' : 'bg-slate-50 border-slate-200'} space-y-6`}>
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <Calendar className="w-4 h-4 text-primary" />
                                    </div>
                                    <h3 className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'} uppercase tracking-widest`}>Initial Setup</h3>
                                </div>
                                <p className={`text-[10px] font-bold ${isDark ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-[0.1em] mb-4`}>Starting truth for first log entry</p>

                                <div className="grid grid-cols-2 gap-6">
                                    <label className="flex flex-col gap-2">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Initial kWh Reading *</span>
                                        <input
                                            type="number"
                                            value={formData.initial_kwh_reading || ''}
                                            onChange={(e) => updateField('initial_kwh_reading', parseFloat(e.target.value) || 0)}
                                            className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-white border-slate-200'} rounded-xl px-4 py-3 text-sm font-bold border focus:outline-none`}
                                        />
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Initial Run Hours *</span>
                                        <input
                                            type="number"
                                            value={formData.initial_run_hours || ''}
                                            onChange={(e) => updateField('initial_run_hours', parseFloat(e.target.value) || 0)}
                                            className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-white border-slate-200'} rounded-xl px-4 py-3 text-sm font-bold border focus:outline-none`}
                                        />
                                    </label>
                                </div>

                                <div className="grid grid-cols-2 gap-6">
                                    <label className="flex flex-col gap-2">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Initial Diesel Level (L) *</span>
                                        <input
                                            type="number"
                                            value={formData.initial_diesel_level || ''}
                                            onChange={(e) => updateField('initial_diesel_level', parseFloat(e.target.value) || 0)}
                                            className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-white border-slate-200'} rounded-xl px-4 py-3 text-sm font-bold border focus:outline-none`}
                                        />
                                    </label>
                                    <label className="flex flex-col gap-2">
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase tracking-wide`}>Effective From *</span>
                                        <input
                                            type="date"
                                            value={formData.effective_from_date || ''}
                                            onChange={(e) => updateField('effective_from_date', e.target.value)}
                                            className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-white border-slate-200'} rounded-xl px-4 py-3 text-sm font-bold border focus:outline-none`}
                                        />
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-4 pt-4">
                            <button
                                type="button"
                                onClick={onClose}
                                className={`flex-1 px-6 py-4 border-2 ${isDark ? 'border-slate-800 text-slate-500 hover:bg-white/5' : 'border-slate-100 text-slate-400 hover:bg-slate-50'} text-xs font-black uppercase tracking-[0.2em] rounded-2xl transition-all`}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={`flex-1 px-6 py-4 bg-primary text-white text-xs font-black uppercase tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                {isSubmitting ? 'Saving Configuration...' : isNew ? 'Establish Configuration' : 'Update Configuration'}
                            </button>
                        </div>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default GeneratorConfigModal;
