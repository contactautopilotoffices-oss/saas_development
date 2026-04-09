/**
 * ElectricityImportModal
 * Modal for bulk importing electricity meter readings from CSV/Excel.
 * @remarks Client component.
 */

'use client';

import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Download, AlertTriangle, CheckCircle, Loader2, FileText } from 'lucide-react';

interface ElectricityMeter {
    id: string;
    name: string;
    meter_number?: string;
    meter_type?: string;
}

interface ParsedRow {
    rowNum: number;
    date: string;          // YYYY-MM-DD
    openingReading: number;
    closingReading: number;
    notes: string;
    error?: string;
}

interface ElectricityImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    meters: ElectricityMeter[];
    onSuccess: (count: number) => void;
}

// Parse DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD
function parseDate(raw: string): string | null {
    const trimmed = raw.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // DD/MM/YYYY or DD-MM-YYYY
    const parts = trimmed.split(/[\/\-]/);
    if (parts.length === 3) {
        const [a, b, c] = parts;
        if (a.length === 4) {
            // YYYY-MM-DD already
            return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
        }
        // DD/MM/YYYY
        return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    }
    return null;
}

function parseCSV(text: string): ParsedRow[] {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
        // Handle CSV values (with or without quotes)
        const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
        const rowNum = i + 1;

        if (cols.length < 3 || cols.every(c => !c)) continue;

        const dateStr = parseDate(cols[0] || '');
        const opening = parseFloat(cols[1] || '');
        const closing = parseFloat(cols[2] || '');
        const notes = cols[3] || '';

        let error: string | undefined;
        if (!dateStr) error = `Invalid date format "${cols[0]}"`;
        else if (isNaN(opening)) error = `Invalid opening reading "${cols[1]}"`;
        else if (isNaN(closing)) error = `Invalid closing reading "${cols[2]}"`;
        else if (closing < opening) error = `Closing (${closing}) < Opening (${opening})`;

        rows.push({ rowNum, date: dateStr || cols[0], openingReading: opening, closingReading: closing, notes, error });
    }

    return rows;
}

function downloadTemplate() {
    const csv = [
        'Date,Opening Reading (kWh),Closing Reading (kWh),Notes',
        '01/01/2025,1000.0,1050.5,',
        '02/01/2025,1050.5,1102.3,Normal reading',
        '03/01/2025,1102.3,1155.0,',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'electricity_readings_template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

const ElectricityImportModal: React.FC<ElectricityImportModalProps> = ({
    isOpen, onClose, propertyId, meters, onSuccess
}) => {
    const [selectedMeterId, setSelectedMeterId] = useState('');
    const [multiplier, setMultiplier] = useState(1.0);
    const [rows, setRows] = useState<ParsedRow[]>([]);
    const [fileName, setFileName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');
    const [submitDone, setSubmitDone] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const validRows = rows.filter(r => !r.error);
    const errorRows = rows.filter(r => r.error);

    const handleFile = useCallback((file: File) => {
        setFileName(file.name);
        setSubmitError('');
        setSubmitDone(false);
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            setRows(parseCSV(text));
        };
        reader.readAsText(file);
    }, []);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    };

    const handleSubmit = async () => {
        if (!selectedMeterId || validRows.length === 0) return;
        setIsSubmitting(true);
        setSubmitError('');

        try {
            const readings = validRows.map(r => ({
                meter_id: selectedMeterId,
                reading_date: r.date,
                opening_reading: r.openingReading,
                closing_reading: r.closingReading,
                multiplier_value_used: multiplier,
                notes: r.notes || undefined,
            }));

            const res = await fetch(`/api/properties/${propertyId}/electricity-readings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ readings }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || `HTTP ${res.status}`);
            }

            setSubmitDone(true);
            onSuccess(validRows.length);
        } catch (err) {
            setSubmitError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setSelectedMeterId('');
        setMultiplier(1.0);
        setRows([]);
        setFileName('');
        setSubmitError('');
        setSubmitDone(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleClose} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Import Electricity Readings</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Upload a CSV file to bulk import meter readings</p>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-6 space-y-5">

                    {/* Step 1: Download Template */}
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between gap-4">
                        <div>
                            <p className="font-bold text-blue-900 text-sm">Step 1: Download Template</p>
                            <p className="text-xs text-blue-600 mt-0.5">Fill columns: Date, Opening (kWh), Closing (kWh), Notes (optional)</p>
                            <p className="text-xs text-blue-500 mt-0.5">Date format: DD/MM/YYYY or YYYY-MM-DD</p>
                        </div>
                        <button
                            onClick={downloadTemplate}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shrink-0"
                        >
                            <Download size={14} /> Template
                        </button>
                    </div>

                    {/* Step 2: Select Meter */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Step 2: Select Meter</label>
                        <select
                            value={selectedMeterId}
                            onChange={e => setSelectedMeterId(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 bg-white"
                        >
                            <option value="">— Select a meter —</option>
                            {meters.map(m => (
                                <option key={m.id} value={m.id}>
                                    {m.name}{m.meter_number ? ` (${m.meter_number})` : ''}{m.meter_type ? ` · ${m.meter_type}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Step 2.1: Multiplier */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5 flex items-center justify-between">
                            Step 2.1: Multiplier (Factor)
                            <span className="text-[10px] font-normal text-gray-400 capitalize italic">usually 1, 10, or 40 (CT ratio)</span>
                        </label>
                        <input
                            type="number"
                            step="any"
                            min="0"
                            value={multiplier || ''}
                            onChange={e => setMultiplier(parseFloat(e.target.value) || 0)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-blue-500 bg-white"
                            placeholder="Enter multiplier (e.g. 1.0)"
                        />
                    </div>

                    {/* Step 3: Upload CSV */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Step 3: Upload CSV</label>
                        <div
                            onDrop={handleDrop}
                            onDragOver={e => e.preventDefault()}
                            onClick={() => fileRef.current?.click()}
                            className="border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl p-8 text-center cursor-pointer transition-colors"
                        >
                            {fileName ? (
                                <div className="flex items-center justify-center gap-2 text-blue-600">
                                    <FileText size={20} />
                                    <span className="font-bold text-sm">{fileName}</span>
                                </div>
                            ) : (
                                <>
                                    <Upload size={28} className="mx-auto text-gray-300 mb-2" />
                                    <p className="text-sm font-bold text-gray-500">Drop CSV here or click to browse</p>
                                    <p className="text-xs text-gray-400 mt-1">.csv files only</p>
                                </>
                            )}
                        </div>
                        <input
                            ref={fileRef}
                            type="file"
                            accept=".csv,text/csv"
                            className="hidden"
                            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                        />
                    </div>

                    {/* Preview */}
                    {rows.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-bold text-gray-700">
                                    Preview — {rows.length} rows ({validRows.length} valid{errorRows.length > 0 ? `, ${errorRows.length} errors` : ''})
                                </p>
                            </div>
                            <div className="rounded-xl border border-gray-100 overflow-hidden">
                                <div className="overflow-x-auto" style={{ maxHeight: '260px', overflowY: 'auto' }}>
                                    <table style={{ minWidth: '500px', width: '100%', borderCollapse: 'collapse' }}>
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr>
                                                {['Row', 'Date', 'Opening (kWh)', 'Closing (kWh)', 'Consumed', 'Notes', 'Status'].map(h => (
                                                    <th key={h} className="text-left py-2 px-3 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map(row => (
                                                <tr key={row.rowNum} className={`border-t border-gray-100 ${row.error ? 'bg-red-50' : ''}`}>
                                                    <td className="py-2 px-3 text-xs text-gray-400 whitespace-nowrap">{row.rowNum}</td>
                                                    <td className="py-2 px-3 text-xs whitespace-nowrap">{row.date}</td>
                                                    <td className="py-2 px-3 text-xs whitespace-nowrap">{isNaN(row.openingReading) ? '—' : row.openingReading}</td>
                                                    <td className="py-2 px-3 text-xs whitespace-nowrap">{isNaN(row.closingReading) ? '—' : row.closingReading}</td>
                                                    <td className="py-2 px-3 text-xs font-bold whitespace-nowrap">
                                                        {(!isNaN(row.openingReading) && !isNaN(row.closingReading))
                                                            ? `${((row.closingReading - row.openingReading) * multiplier).toFixed(2)} kVAh`
                                                            : '—'}
                                                    </td>
                                                    <td className="py-2 px-3 text-xs text-gray-400 whitespace-nowrap">{row.notes || '—'}</td>
                                                    <td className="py-2 px-3 whitespace-nowrap">
                                                        {row.error
                                                            ? <span className="flex items-center gap-1 text-red-500 text-xs"><AlertTriangle size={11} />{row.error}</span>
                                                            : <CheckCircle size={14} className="text-green-500" />
                                                        }
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {errorRows.length > 0 && (
                                <p className="text-xs text-orange-600 mt-2 font-medium">
                                    ⚠ {errorRows.length} row(s) with errors will be skipped. Fix your CSV and re-upload to include them.
                                </p>
                            )}
                        </div>
                    )}

                    {submitError && (
                        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700 font-medium">
                            {submitError}
                        </div>
                    )}

                    {submitDone && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2 text-sm text-green-700 font-bold">
                            <CheckCircle size={16} /> {validRows.length} readings imported successfully!
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-400">
                        Multiplier & tariff auto-applied from meter config per reading date.
                    </p>
                    <div className="flex gap-2">
                        <button onClick={handleClose} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                            {submitDone ? 'Close' : 'Cancel'}
                        </button>
                        {!submitDone && (
                            <button
                                onClick={handleSubmit}
                                disabled={!selectedMeterId || validRows.length === 0 || isSubmitting}
                                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                {isSubmitting ? 'Importing...' : `Import ${validRows.length} Rows`}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ElectricityImportModal;
