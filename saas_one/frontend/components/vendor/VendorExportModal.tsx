/**
 * VendorExportModal
 * Modal for configuring vendor data exports (CSV/XLSX) with period selection.
 * @remarks Client component.
 */

'use client';

import React, { useState } from 'react';
import { X, FileDown, Calendar, FileSpreadsheet, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface VendorExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onExport: (options: ExportOptions) => void;
    isExporting?: boolean;
}

interface ExportOptions {
    period: 'today' | 'month' | 'year' | 'custom';
    startDate?: string;
    endDate?: string;
    format: 'csv' | 'xlsx';
}

const VendorExportModal: React.FC<VendorExportModalProps> = ({
    isOpen,
    onClose,
    onExport,
    isExporting = false,
}) => {
    const [period, setPeriod] = useState<'today' | 'month' | 'year' | 'custom'>('month');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [format, setFormat] = useState<'csv' | 'xlsx'>('xlsx');

    const handleExport = () => {
        onExport({
            period,
            startDate: period === 'custom' ? startDate : undefined,
            endDate: period === 'custom' ? endDate : undefined,
            format,
        });
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                    onClick={onClose}
                />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 - 16, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-4 sm:p-6 border-b border-slate-100">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                                    <FileDown className="w-5 h-5" />
                                </div>
                                <h2 className="text-xl font-black text-slate-900">Export Revenue Data</h2>
                            </div>
                            <button
                                onClick={onClose}
                                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
                            >
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="p-4 sm:p-6 space-y-6">
                        {/* Date Range Selection */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                                Select Date Range
                            </label>
                            <div className="space-y-2">
                                {[
                                    { value: 'today', label: 'Today' },
                                    { value: 'month', label: 'This Month' },
                                    { value: 'year', label: 'This Year' },
                                    { value: 'custom', label: 'Custom Range' },
                                ].map((option) => (
                                    <label
                                        key={option.value}
                                        className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition-all ${period === option.value
                                            ? 'border-indigo-500 bg-indigo-50'
                                            : 'border-slate-100 hover:border-slate-200'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="period"
                                            value={option.value}
                                            checked={period === option.value}
                                            onChange={() => setPeriod(option.value as any)}
                                            className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className={`font-bold text-sm ${period === option.value ? 'text-indigo-600' : 'text-slate-600'
                                            }`}>
                                            {option.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Custom Date Range */}
                        <AnimatePresence>
                            {period === 'custom' && (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                                >
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                            Start Date
                                        </label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-indigo-500 focus:ring-0 transition-colors"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                                            End Date
                                        </label>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-indigo-500 focus:ring-0 transition-colors"
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Format Selection */}
                        <div>
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                                Export Format
                            </label>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setFormat('xlsx')}
                                    className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-2xl border-2 font-bold text-sm transition-all ${format === 'xlsx'
                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                                        : 'border-slate-100 text-slate-500 hover:border-slate-200'
                                        }`}
                                >
                                    <FileSpreadsheet className="w-5 h-5" />
                                    Excel
                                </button>
                                <button
                                    onClick={() => setFormat('csv')}
                                    className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-2xl border-2 font-bold text-sm transition-all ${format === 'csv'
                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                                        : 'border-slate-100 text-slate-500 hover:border-slate-200'
                                        }`}
                                >
                                    <FileText className="w-5 h-5" />
                                    CSV
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 sm:p-6 border-t border-slate-100 flex gap-3">
                        <button
                            onClick={onClose}
                            className="flex-1 px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleExport}
                            disabled={isExporting || (period === 'custom' && (!startDate || !endDate))}
                            className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isExporting ? (
                                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <FileDown className="w-5 h-5" />
                                    Download
                                </>
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default VendorExportModal;
