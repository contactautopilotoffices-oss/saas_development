/**
 * BulkImportModal
 * Modal for bulk importing stock items from CSV.
 * @remarks Client component.
 */

'use client';

import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, CheckCircle, AlertCircle, Download, ArrowLeft, Loader2, Tag, Package, Hash, Layers, CircleDollarSign } from 'lucide-react';

interface BulkImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    onSuccess?: () => void;
}

interface ValidationError {
    row: number;
    field: string;
    message: string;
}

interface PreviewItem {
    name: string;
    item_code?: string;
    category?: string;
    unit?: string;
    quantity?: number;
    min_threshold?: number;
    location?: string;
    description?: string;
    per_unit_cost?: number;
}

type Step = 'upload' | 'preview' | 'importing' | 'result';

const CSV_COLUMNS = [
    { name: 'Category', required: false, desc: 'e.g. Supplies, Safety', icon: Tag },
    { name: 'Item Name', required: true, desc: 'Name of the item', icon: Package },
    { name: 'Base SKU (1 Unit)', required: false, desc: 'Unit of measure', icon: Hash },
    { name: 'Current Stock (Single Units)', required: false, desc: 'Initial quantity', icon: Layers },
    { name: 'Per Unit Cost', required: false, desc: 'Cost per unit', icon: CircleDollarSign },
];

const BulkImportModal: React.FC<BulkImportModalProps> = ({ isOpen, onClose, propertyId, onSuccess }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [step, setStep] = useState<Step>('upload');
    const [csvData, setCsvData] = useState<string>('');
    const [fileName, setFileName] = useState<string>('');
    const [dragActive, setDragActive] = useState(false);

    // Preview state
    const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
    const [validCount, setValidCount] = useState(0);
    const [invalidCount, setInvalidCount] = useState(0);
    const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

    // Result state
    const [importResult, setImportResult] = useState<{
        imported: number;
        skipped: number;
        total: number;
        errors: ValidationError[];
    } | null>(null);
    const [importError, setImportError] = useState<string>('');

    const resetState = () => {
        setStep('upload');
        setCsvData('');
        setFileName('');
        setPreviewItems([]);
        setValidCount(0);
        setInvalidCount(0);
        setValidationErrors([]);
        setImportResult(null);
        setImportError('');
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const readFile = useCallback((file: File) => {
        if (!file.name.endsWith('.csv')) {
            setImportError('Please upload a CSV file');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target?.result as string;
            setCsvData(text);
            setFileName(file.name);
            setImportError('');

            try {
                const res = await fetch(`/api/properties/${propertyId}/stock/items/bulk-import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ csvData: text, mode: 'validate' }),
                });

                const data = await res.json();

                if (!res.ok) {
                    setImportError(data.error || 'Validation failed');
                    return;
                }

                setPreviewItems(data.preview || []);
                setValidCount(data.valid || 0);
                setInvalidCount(data.invalid || 0);
                setValidationErrors(data.errors || []);
                setStep('preview');
            } catch (err) {
                setImportError('Failed to validate CSV');
            }
        };
        reader.readAsText(file);
    }, [propertyId]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) readFile(file);
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        const file = e.dataTransfer.files?.[0];
        if (file) readFile(file);
    };

    const handleImport = async () => {
        setStep('importing');
        setImportError('');

        try {
            const res = await fetch(`/api/properties/${propertyId}/stock/items/bulk-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csvData, mode: 'import' }),
            });

            const data = await res.json();

            if (!res.ok) {
                setImportError(data.error || 'Import failed');
                setStep('preview');
                return;
            }

            setImportResult({
                imported: data.imported,
                skipped: data.skipped,
                total: data.total,
                errors: data.errors || [],
            });
            setStep('result');
        } catch (err) {
            setImportError('Failed to import items');
            setStep('preview');
        }
    };

    const downloadTemplate = () => {
        const itemCategoryMap: Record<string, string> = {
            'Urnial Pad': 'HK Material Equipment',
            'Scotch Bright': 'HK Material Equipment',
            'Wet Mop Stick': 'HK Material Equipment',
            'Wet Mop Refill': 'HK Material Equipment',
            'Wet Mop Clip': 'HK Material Equipment',
            'Dry Mop Stick': 'HK Material Equipment',
            'Dry Mop Refill': 'HK Material Equipment',
            'Duster': 'HK Material Equipment',
            'Garbage Bag Small 19*21': 'HK Material Equipment',
            'Garbage Bag Big 29*39': 'HK Material Equipment',
            'Toilet Choke Up Pump': 'HK Material Equipment',
            'Soft Broom': 'HK Material Equipment',
            'Hard Room': 'HK Material Equipment',
            'Ceiling Broom': 'HK Material Equipment',
            'Feather Brush': 'HK Material Equipment',
            'Hand Hard Brush': 'HK Material Equipment',
            'Toilet Brush Hockey': 'HK Material Equipment',
            'Toilet Brush Round': 'HK Material Equipment',
            'Wiper': 'HK Material Equipment',
            'Dambar Goli': 'HK Material Equipment',
            'Colour Goli': 'HK Material Equipment',
            'Dust Pan': 'HK Material Equipment',
            'Bucket': 'HK Material Equipment',
            'Mug': 'HK Material Equipment',
            'Spray Bottle': 'HK Material Equipment',
            'Multi Purpose Cleaner (R2)': 'HK Chemical',
            'Glass Cleaning Liquid (R3)': 'HK Chemical',
            'Furniture Polish (R4)': 'HK Chemical',
            'Air Freshner (R5)': 'HK Chemical',
            'Toilet Cleaning Liquid (R6)': 'HK Chemical',
            'Steal Polish (R7)': 'HK Chemical',
            'Dish Wash Liquid': 'HK Chemical',
            'Hand Washing Liquid': 'HK Chemical',
            'Carpet Spot Cleaning Liquid': 'HK Chemical',
            'Carpet Shampooing Liquid': 'HK Chemical',
            'Sanitizer': 'HK Chemical',
            'R1': 'HK Chemical',
            '20 Litre Water Bottle': 'Mineral Water Expenses Sources',
            '500 Ml Water Bottle': 'Mineral Water Expenses Sources',
            '250 Ml Water Bottle': 'Mineral Water Expenses Sources',
            'Milk in litre': 'Tea and Coffee Expenses',
            'Pre Mix Tea per cup': 'Tea and Coffee Expenses',
            'Pre Mix Coffee per cup': 'Tea and Coffee Expenses',
            'Pre Mix Lemon per cup': 'Tea and Coffee Expenses',
            'Paper Cups 70ml': 'Tea and Coffee Expenses',
            'M Fold Tissue': 'Tissue Paper Expenses',
            'Toilet Rolls': 'Tissue Paper Expenses',
            'Table Top': 'Tissue Paper Expenses'
        };

        const itemCosts: Record<string, number> = {
            'Urnial Pad': 15, 'Scotch Bright': 18, 'Wet Mop Stick': 70, 'Wet Mop Refill': 60, 'Wet Mop Clip': 40,
            'Dry Mop Stick': 0, 'Dry Mop Refill': 0, 'Duster': 16, 'Garbage Bag Small 19*21': 18, 'Garbage Bag Big 29*39': 3.5,
            'Toilet Choke Up Pump': 1.33, 'Soft Broom': 50, 'Hard Room': 160, 'Ceiling Broom': 65, 'Feather Brush': 150,
            'Hand Hard Brush': 50, 'Toilet Brush Hockey': 50, 'Toilet Brush Round': 90, 'Wiper': 65, 'Dambar Goli': 190,
            'Colour Goli': 2.92, 'Dust Pan': 30, 'Bucket': 130, 'Mug': 20, 'Spray Bottle': 40,
            'Multi Purpose Cleaner (R2)': 145, 'Glass Cleaning Liquid (R3)': 138, 'Furniture Polish (R4)': 199.6,
            'Air Freshner (R5)': 270, 'Toilet Cleaning Liquid (R6)': 135, 'Steal Polish (R7)': 147,
            'Dish Wash Liquid': 135, 'Hand Washing Liquid': 145, 'Carpet Spot Cleaning Liquid': 210,
            'Carpet Shampooing Liquid': 210, 'Sanitizer': 230, 'R1': 230,
            '20 Litre Water Bottle': 27, '500 Ml Water Bottle': 7.91, '250 Ml Water Bottle': 5,
            'Milk in litre': 56, 'Pre Mix Tea per cup': 2, 'Pre Mix Coffee per cup': 2, 'Pre Mix Lemon per cup': 2, 'Paper Cups 70ml': 0.29,
            'M Fold Tissue': 40, 'Toilet Rolls': 17, 'Table Top': 11
        };

        const csvRows = [
            ['Category', 'Item Name', 'Base SKU (1 Unit)', 'Current Stock (Single Units)', 'Per Unit Cost']
        ];

        Object.entries(itemCategoryMap).forEach(([name, cat]) => {
            csvRows.push([cat, name, '1', '0', (itemCosts[name] || 0).toString()]);
        });

        const csvContent = csvRows.map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "item_import_template.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50"
            onClick={handleClose}
        >
            <div
                className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center px-5 pt-5 pb-4 shrink-0">
                    <div className="flex items-center gap-3">
                        {step === 'preview' && (
                            <button
                                onClick={() => { resetState(); }}
                                className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-xl transition-all"
                            >
                                <ArrowLeft size={17} className="text-text-secondary" />
                            </button>
                        )}
                        <h2 className="text-lg font-black text-text-primary tracking-tight">
                            {step === 'upload' && 'Bulk Import Items'}
                            {step === 'preview' && 'Review Import'}
                            {step === 'importing' && 'Importing...'}
                            {step === 'result' && 'Import Complete'}
                        </h2>
                    </div>
                    <button
                        onClick={handleClose}
                        className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-xl transition-all"
                    >
                        <X size={18} className="text-text-secondary" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 pb-2">

                    {/* Upload Step */}
                    {step === 'upload' && (
                        <div className="space-y-4">

                            {/* Template Section */}
                            <div className="bg-muted rounded-2xl p-4">
                                <p className="text-sm font-bold text-text-primary mb-0.5">Need a template?</p>
                                <p className="text-xs text-text-secondary mb-3">Download our CSV template with sample data pre-filled to get started quickly.</p>
                                <button
                                    onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-text-inverse rounded-xl text-sm font-bold hover:opacity-90 transition-all active:scale-[0.98]"
                                >
                                    <Download size={15} />
                                    Download Template
                                </button>
                            </div>

                            {/* Drop Zone */}
                            <div
                                onDragEnter={handleDrag}
                                onDragLeave={handleDrag}
                                onDragOver={handleDrag}
                                onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all ${dragActive
                                    ? 'border-primary bg-primary/5'
                                    : 'border-border hover:border-primary/50 hover:bg-primary/5'
                                    }`}
                            >
                                <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-2">
                                    <Upload size={18} className="text-primary" />
                                </div>
                                <p className="font-bold text-text-primary text-sm mb-0.5">
                                    {dragActive ? 'Drop CSV file here' : 'Upload CSV File'}
                                </p>
                                <p className="text-xs text-text-secondary">Drag & drop or tap to browse</p>
                                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
                            </div>

                            {/* Error */}
                            {importError && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                                    <AlertCircle size={14} className="text-red-500 shrink-0" />
                                    <p className="text-xs font-medium text-red-700">{importError}</p>
                                </div>
                            )}

                            {/* CSV Columns */}
                            <div>
                                <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest mb-2">CSV Columns</p>
                                <div className="space-y-1">
                                    {CSV_COLUMNS.map(col => {
                                        const Icon = col.icon;
                                        return (
                                            <div key={col.name} className="flex items-center gap-3 p-3 bg-muted rounded-xl">
                                                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
                                                    <Icon size={15} className="text-primary" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <span className="text-xs font-bold text-text-primary">{col.name}</span>
                                                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md ${col.required ? 'bg-red-100 text-red-600' : 'bg-border text-text-secondary'}`}>
                                                            {col.required ? 'REQ' : 'OPT'}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-text-secondary truncate">{col.desc}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Preview Step */}
                    {step === 'preview' && (
                        <div className="space-y-4">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 bg-primary/5 rounded-2xl text-center">
                                    <p className="text-xl font-black text-primary">{validCount + invalidCount}</p>
                                    <p className="text-[10px] font-black text-primary/60 uppercase tracking-widest mt-0.5">Total</p>
                                </div>
                                <div className="p-3 bg-emerald-50 rounded-2xl text-center">
                                    <p className="text-xl font-black text-emerald-700">{validCount}</p>
                                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-0.5">Valid</p>
                                </div>
                                <div className="p-3 bg-red-50 rounded-2xl text-center">
                                    <p className="text-xl font-black text-red-700">{invalidCount}</p>
                                    <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mt-0.5">Errors</p>
                                </div>
                            </div>

                            {/* Validation Errors */}
                            {validationErrors.length > 0 && (
                                <div className="p-3 bg-red-50 border border-red-100 rounded-xl space-y-1.5">
                                    <p className="text-xs font-black text-red-600 uppercase tracking-wider">Validation Errors</p>
                                    <div className="space-y-1 max-h-28 overflow-y-auto">
                                        {validationErrors.map((err, i) => (
                                            <div key={i} className="flex items-center gap-2 text-xs text-red-600">
                                                <AlertCircle size={11} className="flex-shrink-0" />
                                                <span>Row {err.row}: <strong>{err.field}</strong> - {err.message}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Import Error */}
                            {importError && (
                                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                                    <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                                    <p className="text-xs font-medium text-red-700">{importError}</p>
                                </div>
                            )}

                            {/* Preview Table */}
                            {previewItems.length > 0 && (
                                <div className="border border-border rounded-xl overflow-hidden">
                                    <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                                        <table className="w-full text-sm" style={{ minWidth: '480px' }}>
                                            <thead className="bg-muted sticky top-0 z-10">
                                                <tr>
                                                    <th className="text-left py-2.5 px-3 text-[10px] font-black text-text-secondary uppercase tracking-wider">#</th>
                                                    <th className="text-left py-2.5 px-3 text-[10px] font-black text-text-secondary uppercase tracking-wider">Category</th>
                                                    <th className="text-left py-2.5 px-3 text-[10px] font-black text-text-secondary uppercase tracking-wider">Item Name</th>
                                                    <th className="text-left py-2.5 px-3 text-[10px] font-black text-text-secondary uppercase tracking-wider">SKU</th>
                                                    <th className="text-right py-2.5 px-3 text-[10px] font-black text-text-secondary uppercase tracking-wider">Qty</th>
                                                    <th className="text-right py-2.5 px-3 text-[10px] font-black text-text-secondary uppercase tracking-wider">Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-border">
                                                {previewItems.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-muted/50 transition-colors">
                                                        <td className="py-2 px-3 text-text-secondary font-mono text-xs">{idx + 1}</td>
                                                        <td className="py-2 px-3 text-text-secondary text-xs">{item.category || '-'}</td>
                                                        <td className="py-2 px-3 font-bold text-text-primary text-xs">{item.name}</td>
                                                        <td className="py-2 px-3 text-text-secondary text-xs">{item.unit || 'units'}</td>
                                                        <td className="py-2 px-3 text-right font-mono font-bold text-xs">{item.quantity || 0}</td>
                                                        <td className="py-2 px-3 text-right font-mono font-bold text-xs">{item.per_unit_cost || 0}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {validCount > 50 && (
                                        <div className="px-3 py-2 bg-muted text-xs text-text-secondary font-medium text-center border-t border-border">
                                            Showing first 50 of {validCount} items
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* File Info */}
                            <div className="flex items-center gap-2 text-xs text-text-secondary">
                                <FileText size={13} />
                                <span className="font-medium truncate">{fileName}</span>
                            </div>
                        </div>
                    )}

                    {/* Importing Step */}
                    {step === 'importing' && (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <Loader2 size={44} className="text-primary animate-spin" />
                            <div className="text-center">
                                <p className="font-extrabold text-text-primary text-lg">Importing {validCount} items...</p>
                                <p className="text-sm text-text-secondary mt-1">This may take a moment</p>
                            </div>
                        </div>
                    )}

                    {/* Result Step */}
                    {step === 'result' && importResult && (
                        <div className="space-y-4">
                            <div className="flex flex-col items-center py-6 gap-3">
                                <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
                                    <CheckCircle size={32} className="text-emerald-500" />
                                </div>
                                <div className="text-center">
                                    <p className="font-extrabold text-text-primary text-xl">{importResult.imported} Items Imported</p>
                                    <p className="text-sm text-text-secondary mt-1">Successfully added to your inventory</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-3 bg-primary/5 rounded-2xl text-center">
                                    <p className="text-xl font-black text-primary">{importResult.total}</p>
                                    <p className="text-[10px] font-black text-primary/60 uppercase tracking-widest mt-0.5">Total</p>
                                </div>
                                <div className="p-3 bg-emerald-50 rounded-2xl text-center">
                                    <p className="text-xl font-black text-emerald-700">{importResult.imported}</p>
                                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-0.5">Imported</p>
                                </div>
                                <div className="p-3 bg-amber-50 rounded-2xl text-center">
                                    <p className="text-xl font-black text-amber-700">{importResult.skipped}</p>
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mt-0.5">Skipped</p>
                                </div>
                            </div>

                            {importResult.errors.length > 0 && (
                                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-1.5">
                                    <p className="text-xs font-black text-amber-600 uppercase tracking-wider">Skipped Rows</p>
                                    <div className="space-y-1 max-h-24 overflow-y-auto">
                                        {importResult.errors.map((err, i) => (
                                            <div key={i} className="text-xs text-amber-700">
                                                Row {err.row}: {err.field} - {err.message}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-4 flex gap-2.5 shrink-0">
                    {step === 'upload' && (
                        <button
                            onClick={handleClose}
                            className="flex-1 px-4 py-3 border border-border rounded-2xl hover:bg-muted transition-all text-text-secondary font-bold text-sm"
                        >
                            Cancel
                        </button>
                    )}

                    {step === 'preview' && (
                        <>
                            <button
                                onClick={resetState}
                                className="flex-1 px-4 py-3 border border-border rounded-2xl hover:bg-muted transition-all text-text-secondary font-bold text-sm"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={validCount === 0}
                                className="flex-1 px-4 py-3 bg-primary text-text-inverse rounded-2xl hover:opacity-90 transition-all font-black text-sm disabled:opacity-50 active:scale-[0.98]"
                            >
                                Import {validCount} Items
                            </button>
                        </>
                    )}

                    {step === 'result' && (
                        <button
                            onClick={() => {
                                handleClose();
                                onSuccess?.();
                            }}
                            className="flex-1 px-4 py-3 bg-primary text-text-inverse rounded-2xl hover:opacity-90 transition-all font-black text-sm active:scale-[0.98]"
                        >
                            Done
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BulkImportModal;
