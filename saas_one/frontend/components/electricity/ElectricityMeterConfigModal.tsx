/**
 * ElectricityMeterConfigModal
 * Modal for configuring electricity meter details (name, multiplier, tariff slab).
 * @remarks Client component.
 */

'use client';

import React, { useState } from 'react';
import { X, Zap, Plus, ChevronDown, ChevronUp, Calculator } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ElectricityMeterConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: any) => Promise<void>;
    isDark?: boolean;
    propertyId?: string;
}

/**
 * Modal for adding/editing electricity meters
 * PRD v2: Includes multiplier configuration (CT/PT ratios)
 * PRD: Unit is kVAh exclusively
 * Uses global primary color theme
 */
const ElectricityMeterConfigModal: React.FC<ElectricityMeterConfigModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    isDark = false,
    propertyId
}) => {
    // Basic meter info
    const [name, setName] = useState('');
    const [meterNumber, setMeterNumber] = useState('');
    const [meterType, setMeterType] = useState('main');
    const [lastReading, setLastReading] = useState<string>('0');

    // Multiplier configuration (v2)
    const [showMultiplier, setShowMultiplier] = useState(true);
    const [ctPrimary, setCtPrimary] = useState<string>('200');
    const [ctSecondary, setCtSecondary] = useState<string>('5');
    const [ptPrimary, setPtPrimary] = useState<string>('11000');
    const [ptSecondary, setPtSecondary] = useState<string>('110');
    const [meterConstant, setMeterConstant] = useState<string>('1');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Calculate multiplier preview
    const computedMultiplier = () => {
        const cP = parseFloat(ctPrimary) || 0;
        const cS = parseFloat(ctSecondary) || 1;
        const pP = parseFloat(ptPrimary) || 0;
        const pS = parseFloat(ptSecondary) || 1;
        const mC = parseFloat(meterConstant) || 0;

        const ct = cP / (cS || 1);
        const pt = pP / (pS || 1);
        return ct * pt * mC;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            setError('Meter name is required');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await onSubmit({
                name: name.trim(),
                meter_number: meterNumber.trim() || null,
                meter_type: meterType,
                last_reading: parseFloat(lastReading) || 0,
                status: 'active',
                // v2: Include initial multiplier config
                initial_multiplier: {
                    ct_ratio_primary: parseFloat(ctPrimary) || 0,
                    ct_ratio_secondary: parseFloat(ctSecondary) || 0,
                    pt_ratio_primary: parseFloat(ptPrimary) || 0,
                    pt_ratio_secondary: parseFloat(ptSecondary) || 0,
                    meter_constant: parseFloat(meterConstant) || 0,
                    multiplier_value: computedMultiplier(),
                    effective_from: new Date().toISOString().split('T')[0]
                }
            });

            // Reset form
            setName('');
            setMeterNumber('');
            setMeterType('main');
            setLastReading('0');
            setCtPrimary('200');
            setCtSecondary('5');
            setPtPrimary('11000');
            setPtSecondary('110');
            setMeterConstant('1');
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to add meter');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className={`${isDark ? 'bg-[#161b22] border-[#21262d]' : 'bg-white border-slate-200'} rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden border max-h-[90vh] overflow-y-auto`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className={`${isDark ? 'bg-[#0d1117] border-[#21262d]' : 'bg-slate-50 border-slate-100'} px-6 py-4 flex items-center justify-between border-b sticky top-0 z-10`}>
                        <div className="flex items-center gap-3">
                            <div className={`${isDark ? 'bg-primary/10' : 'bg-primary/10'} p-2 rounded-xl`}>
                                <Zap className="w-5 h-5 text-primary" />
                            </div>
                            <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Add Electricity Meter</h2>
                        </div>
                        <button
                            onClick={onClose}
                            className={`${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'} transition-colors`}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-5">
                        {error && (
                            <div className={`${isDark ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-rose-50 text-rose-600 border-rose-100'} px-4 py-3 rounded-xl text-sm border`}>
                                {error}
                            </div>
                        )}

                        {/* Meter Name */}
                        <label className="flex flex-col gap-1.5">
                            <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase tracking-wide`}>
                                Meter Name *
                            </span>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g., Main Meter, DG Meter"
                                className={`${isDark ? 'bg-[#0d1117] border-[#21262d] text-white focus:border-primary' : 'bg-white border-slate-200 focus:border-primary'} border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-primary/20' : 'focus:ring-primary/20'}`}
                                required
                            />
                        </label>

                        {/* Meter Number */}
                        <label className="flex flex-col gap-1.5">
                            <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase tracking-wide`}>
                                Meter Number (Optional)
                            </span>
                            <input
                                type="text"
                                value={meterNumber}
                                onChange={(e) => setMeterNumber(e.target.value)}
                                placeholder="Physical meter serial number"
                                className={`${isDark ? 'bg-[#0d1117] border-[#21262d] text-white focus:border-primary' : 'bg-white border-slate-200 focus:border-primary'} border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-primary/20' : 'focus:ring-primary/20'}`}
                            />
                        </label>

                        {/* Meter Type */}
                        <label className="flex flex-col gap-1.5">
                            <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase tracking-wide`}>
                                Meter Type
                            </span>
                            <select
                                value={meterType}
                                onChange={(e) => setMeterType(e.target.value)}
                                className={`${isDark ? 'bg-[#0d1117] border-[#21262d] text-white focus:border-primary' : 'bg-white border-slate-200 focus:border-primary'} border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-primary/20' : 'focus:ring-primary/20'}`}
                            >
                                <option value="main">Main Grid</option>
                                <option value="dg">DG Backup</option>
                                <option value="solar">Solar</option>
                                <option value="backup">Backup</option>
                            </select>
                        </label>

                        {/* Current Reading - PRD: kVAh unit */}
                        <label className="flex flex-col gap-1.5">
                            <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase tracking-wide`}>
                                Current Reading (kVAh)
                            </span>
                            <input
                                type="text"
                                inputMode="decimal"
                                value={lastReading}
                                onChange={(e) => setLastReading(e.target.value)}
                                placeholder="Starting meter reading"
                                className={`${isDark ? 'bg-[#0d1117] border-[#21262d] text-white focus:border-primary' : 'bg-white border-slate-200 focus:border-primary'} border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 ${isDark ? 'focus:ring-primary/20' : 'focus:ring-primary/20'}`}
                            />
                        </label>

                        {/* Multiplier Configuration Section */}
                        <div className={`${isDark ? 'bg-[#0d1117] border-[#21262d]' : 'bg-slate-50 border-slate-100'} rounded-xl border overflow-hidden`}>
                            <button
                                type="button"
                                onClick={() => setShowMultiplier(!showMultiplier)}
                                className={`w-full px-4 py-3 flex items-center justify-between ${isDark ? 'hover:bg-[#161b22]' : 'hover:bg-slate-100'} transition-colors`}
                            >
                                <div className="flex items-center gap-2">
                                    <Calculator className={`w-4 h-4 ${isDark ? 'text-primary' : 'text-primary'}`} />
                                    <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                                        Meter Factor (Multiplier)
                                    </span>
                                    <span className={`text-xs ${isDark ? 'text-primary' : 'text-primary'} font-mono`}>
                                        ×{computedMultiplier().toFixed(2)}
                                    </span>
                                </div>
                                {showMultiplier ? (
                                    <ChevronUp className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                                ) : (
                                    <ChevronDown className={`w-4 h-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
                                )}
                            </button>

                            <AnimatePresence>
                                {showMultiplier && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className={`px-4 pb-4 space-y-4 ${isDark ? 'border-t border-[#21262d]' : 'border-t border-slate-100'}`}>
                                            <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-400'} pt-3`}>
                                                Configure CT/PT ratios to calculate the meter multiplier for accurate readings.
                                            </p>

                                            {/* CT Ratio */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className="flex flex-col gap-1">
                                                    <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase`}>CT Primary (A)</span>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={ctPrimary}
                                                        onChange={(e) => setCtPrimary(e.target.value)}
                                                        placeholder="200"
                                                        className={`${isDark ? 'bg-[#161b22] border-[#30363d] text-white' : 'bg-white border-slate-200'} font-medium rounded-lg p-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-primary/20`}
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase`}>CT Secondary (A)</span>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={ctSecondary}
                                                        onChange={(e) => setCtSecondary(e.target.value)}
                                                        placeholder="5"
                                                        className={`${isDark ? 'bg-[#161b22] border-[#30363d] text-white' : 'bg-white border-slate-200'} font-medium rounded-lg p-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-primary/20`}
                                                    />
                                                </label>
                                            </div>

                                            {/* PT Ratio */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <label className="flex flex-col gap-1">
                                                    <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase`}>PT Primary (V)</span>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={ptPrimary}
                                                        onChange={(e) => setPtPrimary(e.target.value)}
                                                        placeholder="11000"
                                                        className={`${isDark ? 'bg-[#161b22] border-[#30363d] text-white' : 'bg-white border-slate-200'} font-medium rounded-lg p-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-primary/20`}
                                                    />
                                                </label>
                                                <label className="flex flex-col gap-1">
                                                    <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase`}>PT Secondary (V)</span>
                                                    <input
                                                        type="text"
                                                        inputMode="decimal"
                                                        value={ptSecondary}
                                                        onChange={(e) => setPtSecondary(e.target.value)}
                                                        placeholder="110"
                                                        className={`${isDark ? 'bg-[#161b22] border-[#30363d] text-white' : 'bg-white border-slate-200'} font-medium rounded-lg p-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-primary/20`}
                                                    />
                                                </label>
                                            </div>

                                            {/* Meter Constant */}
                                            <label className="flex flex-col gap-1">
                                                <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase`}>Meter Constant</span>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    value={meterConstant}
                                                    onChange={(e) => setMeterConstant(e.target.value)}
                                                    placeholder="1.0"
                                                    className={`${isDark ? 'bg-[#161b22] border-[#30363d] text-white' : 'bg-white border-slate-200'} font-medium rounded-lg p-2.5 text-sm border focus:outline-none focus:ring-2 focus:ring-primary/20`}
                                                />
                                            </label>

                                            {/* Multiplier Preview */}
                                            <div className={`rounded-lg p-3 ${isDark ? 'bg-primary/10 border-primary/20' : 'bg-primary/5 border-primary/20'} border`}>
                                                <div className="flex justify-between items-center">
                                                    <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Computed Multiplier</span>
                                                    <span className={`text-lg font-black ${isDark ? 'text-primary' : 'text-primary'}`}>
                                                        ×{computedMultiplier().toFixed(2)}
                                                    </span>
                                                </div>
                                                <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                                                    ({ctPrimary}/{ctSecondary}) × ({ptPrimary}/{ptSecondary}) × {meterConstant}
                                                </p>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className={`w-full ${isDark ? 'bg-primary hover:bg-primary-dark shadow-primary/40' : 'bg-primary hover:bg-primary-dark shadow-primary/20'} text-white font-bold py-3 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50`}
                        >
                            <Plus className="w-5 h-5" />
                            {isSubmitting ? 'Adding...' : 'Add Meter'}
                        </button>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default ElectricityMeterConfigModal;
