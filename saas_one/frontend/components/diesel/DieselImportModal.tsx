/**
 * DieselImportModal
 * Modal for bulk importing diesel readings from CSV/Excel files.
 * @remarks Client component.
 */

'use client';

import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Download, AlertTriangle, CheckCircle, Loader2, FileText } from 'lucide-react';

interface Generator {
    id: string;
    name: string;
    make?: string;
    capacity_kva?: number;
}

interface ParsedRow {
    rowNum: number;
    date: string;          // YYYY-MM-DD
    openingHours: number;
    closingHours: number;
    openingKwh: number;
    closingKwh: number;
    openingLevel: number;
    closingLevel: number;
    addedLitres: number;
    notes: string;
    error?: string;
}

interface DieselImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    generators: Generator[];
    onSuccess: (count: number) => void;
}

// Parse DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD
function parseDate(raw: string): string | null {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parts = trimmed.split(/[\/\-]/);
    if (parts.length === 3) {
        const [a, b, c] = parts;
        if (a.length === 4) {
            return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
        }
        return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    }
    return null;
}

function parseCSV(text: string): ParsedRow[] {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const rows: ParsedRow[] = [];

    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
        const rowNum = i + 1;

        if (cols.length < 8 || cols.every(c => !c)) continue;

        const dateStr = parseDate(cols[0] || '');
        const opHours = parseFloat(cols[1] || '0');
        const clHours = parseFloat(cols[2] || '0');
        const opKwh = parseFloat(cols[3] || '0');
        const clKwh = parseFloat(cols[4] || '0');
        const opLevel = parseFloat(cols[5] || '0');
        const clLevel = parseFloat(cols[6] || '0');
        const added = parseFloat(cols[7] || '0');
        const notes = cols[8] || '';

        let error: string | undefined;
        if (!dateStr) error = `Invalid date format "${cols[0]}"`;
        else if (isNaN(opHours)) error = `Invalid opening hours "${cols[1]}"`;
        else if (isNaN(clHours)) error = `Invalid closing hours "${cols[2]}"`;
        else if (clHours < opHours) error = `Closing Hours (${clHours}) < Opening (${opHours})`;
        else if (isNaN(opKwh)) error = `Invalid opening kWh "${cols[3]}"`;
        else if (isNaN(clKwh)) error = `Invalid closing kWh "${cols[4]}"`;
        else if (clKwh < opKwh) error = `Closing kWh (${clKwh}) < Opening (${opKwh})`;

        rows.push({
            rowNum,
            date: dateStr || cols[0],
            openingHours: opHours,
            closingHours: clHours,
            openingKwh: opKwh,
            closingKwh: clKwh,
            openingLevel: opLevel,
            closingLevel: clLevel,
            addedLitres: added,
            notes,
            error
        });
    }

    return rows;
}

function downloadTemplate() {
    const csv = [
        'Date,Opening Hours,Closing Hours,Opening kWh,Closing kWh,Opening Level (L),Closing Level (L),Added Litres,Notes',
        '01/01/2025,1200.5,1205.2,15000,15050,400,380,0,Normal run',
        '02/01/2025,1205.2,1210.0,15050,15110,380,550,200,Refuelled',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'diesel_readings_template.csv';
    a.click();
    URL.revokeObjectURL(url);
}

const DieselImportModal: React.FC<DieselImportModalProps> = ({
    isOpen, onClose, propertyId, generators, onSuccess
}) => {
    const [selectedGenId, setSelectedGenId] = useState('');
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
        if (!selectedGenId || validRows.length === 0) return;
        setIsSubmitting(true);
        setSubmitError('');

        try {
            const readings = validRows.map(r => ({
                generator_id: selectedGenId,
                reading_date: r.date,
                opening_hours: r.openingHours,
                closing_hours: r.closingHours,
                opening_kwh: r.openingKwh,
                closing_kwh: r.closingKwh,
                opening_diesel_level: r.openingLevel,
                closing_diesel_level: r.closingLevel,
                diesel_added_litres: r.addedLitres,
                computed_consumed_litres: (r.openingLevel + r.addedLitres) - r.closingLevel,
                notes: r.notes || undefined,
            }));

            const res = await fetch(`/api/properties/${propertyId}/diesel-readings`, {
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
        setSelectedGenId('');
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
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-black text-gray-900">Import Diesel Readings</h2>
                        <p className="text-xs text-gray-400 mt-0.5">Bulk import generator logs via CSV</p>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-6 space-y-5">
                    {/* Step 1: Template */}
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between gap-4">
                        <div>
                            <p className="font-bold text-emerald-900 text-sm">Step 1: Download Template</p>
                            <p className="text-xs text-emerald-600 mt-0.5">Required: Date, Hours (Op/Cl), kWh (Op/Cl), Diesel (Op/Cl)</p>
                        </div>
                        <button
                            onClick={downloadTemplate}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors shrink-0"
                        >
                            <Download size={14} /> Template
                        </button>
                    </div>

                    {/* Step 2: Generator */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Step 2: Select Generator</label>
                        <select
                            value={selectedGenId}
                            onChange={e => setSelectedGenId(e.target.value)}
                            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-emerald-500 bg-white font-medium"
                        >
                            <option value="">— Select a generator —</option>
                            {generators.map(g => (
                                <option key={g.id} value={g.id}>
                                    {g.name} {g.capacity_kva ? `(${g.capacity_kva} kVA)` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Step 3: Upload */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1.5">Step 3: Upload CSV</label>
                        <div
                            onDrop={handleDrop}
                            onDragOver={e => e.preventDefault()}
                            onClick={() => fileRef.current?.click()}
                            className="border-2 border-dashed border-gray-200 hover:border-emerald-400 rounded-xl p-8 text-center cursor-pointer transition-colors"
                        >
                            {fileName ? (
                                <div className="flex items-center justify-center gap-2 text-emerald-600">
                                    <FileText size={20} />
                                    <span className="font-bold text-sm">{fileName}</span>
                                </div>
                            ) : (
                                <>
                                    <Upload size={28} className="mx-auto text-gray-300 mb-2" />
                                    <p className="text-sm font-bold text-gray-500">Drop CSV here or click to browse</p>
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

                    {/* Preview Table */}
                    {rows.length > 0 && (
                        <div>
                            <p className="text-sm font-bold text-gray-700 mb-2">
                                Preview — {rows.length} rows ({validRows.length} valid)
                            </p>
                            <div className="rounded-xl border border-gray-100 overflow-hidden text-[10px] md:text-xs">
                                <div className="overflow-x-auto max-h-[300px]">
                                    <table className="w-full border-collapse">
                                        <thead className="bg-gray-50 sticky top-0">
                                            <tr className="border-b border-gray-100">
                                                {['Date', 'Hours', 'kWh', 'Level', 'Added', 'Cons.', 'Status'].map(h => (
                                                    <th key={h} className="text-left py-2 px-3 font-bold text-gray-500 uppercase">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map(row => (
                                                <tr key={row.rowNum} className={`border-t border-gray-50 ${row.error ? 'bg-red-50' : ''}`}>
                                                    <td className="py-2 px-3 whitespace-nowrap">{row.date}</td>
                                                    <td className="py-2 px-3 whitespace-nowrap">{row.openingHours}→{row.closingHours}</td>
                                                    <td className="py-2 px-3 whitespace-nowrap">{row.openingKwh}→{row.closingKwh}</td>
                                                    <td className="py-2 px-3 whitespace-nowrap">{row.openingLevel}→{row.closingLevel}</td>
                                                    <td className="py-2 px-3 font-bold">{row.addedLitres}L</td>
                                                    <td className="py-2 px-3 font-bold text-emerald-600">
                                                        {(row.openingLevel + row.addedLitres - row.closingLevel).toFixed(1)}L
                                                    </td>
                                                    <td className="py-2 px-3">
                                                        {row.error
                                                            ? <span className="text-red-500 font-bold">Error</span>
                                                            : <CheckCircle size={14} className="text-green-500" />
                                                        }
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {submitError && <div className="p-3 bg-red-50 text-red-700 rounded-xl text-sm font-bold border border-red-100">{submitError}</div>}
                    {submitDone && <div className="p-3 bg-green-50 text-green-700 rounded-xl text-sm font-bold border border-green-100">Import complete!</div>}
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
                    <p className="text-xs text-gray-400 italic">Fuel costs will be auto-calculated.</p>
                    <div className="flex gap-2">
                        <button onClick={handleClose} className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-xl">
                            {submitDone ? 'Close' : 'Cancel'}
                        </button>
                        {!submitDone && (
                            <button
                                onClick={handleSubmit}
                                disabled={!selectedGenId || validRows.length === 0 || isSubmitting}
                                className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-md"
                            >
                                {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                Import {validRows.length} entries
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DieselImportModal;
