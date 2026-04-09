/**
 * StockItemFormModal
 * Form modal for creating or editing a stock item.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { X, Scan, QrCode, ChevronDown, CheckCircle2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createClient } from '@/frontend/utils/supabase/client';
import { Toast } from '@/frontend/components/ui/Toast';
import Barcode, { downloadBarcode } from './Barcode';

const BarcodeScannerModal = dynamic(
    () => import('./BarcodeScannerModal'),
    { ssr: false, loading: () => <div>Loading scanner...</div> }
);

interface StockItemFormModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    item?: any;
    onSuccess?: () => void;
    propertyCode?: string;
}

const UNIT_OPTIONS = ['units', 'kg', 'g', 'litre', 'ml', 'pieces', 'boxes', 'rolls', 'packs', 'bottles', 'sheets'];
const CATEGORY_OPTIONS = ['HK Material Equipment', 'HK Chemical', 'Mineral Water Expenses Sources', 'Tea and Coffee Expenses', 'Tissue Paper Expenses', 'Supplies', 'Safety', 'Other'];

const inputClass = 'w-full px-4 py-3.5 bg-white border border-border rounded-2xl focus:outline-none focus:border-primary text-sm text-text-primary placeholder-text-secondary transition-all appearance-none';
const labelClass = 'block text-sm font-bold text-text-primary mb-1.5';

const StockItemFormModal: React.FC<StockItemFormModalProps> = ({ isOpen, onClose, propertyId, item, onSuccess, propertyCode }) => {
    const [formData, setFormData] = useState({
        name: '',
        item_code: '',
        category: '',
        unit: 'units',
        quantity: 0,
        min_threshold: 5,
        per_unit_cost: 0,
        location: '',
        description: '',
    });
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [showScanModal, setShowScanModal] = useState(false);
    const supabase = React.useMemo(() => createClient(), []);

    const defaultFormData = () => ({
        name: '',
        item_code: propertyCode ? `${propertyCode.toUpperCase()}-` : '',
        category: '',
        unit: 'units',
        quantity: 0,
        min_threshold: 5,
        per_unit_cost: 0,
        location: '',
        description: '',
    });

    useEffect(() => {
        if (item) {
            setFormData({
                name: item.name || '',
                item_code: item.item_code || '',
                category: item.category || '',
                unit: item.unit || 'units',
                quantity: item.quantity || 0,
                min_threshold: item.min_threshold || 5,
                per_unit_cost: item.per_unit_cost || 0,
                location: item.location || '',
                description: item.description || '',
            });
        } else {
            setFormData(defaultFormData());
        }
    }, [item, isOpen, propertyCode]);

    const handleReset = () => {
        setFormData(defaultFormData());
    };

    const generateCode = () => {
        const prefix = propertyCode ? propertyCode.toUpperCase() : 'INV';
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const newCode = `${prefix}-${timestamp}${random}`;
        setFormData({ ...formData, item_code: newCode });
        downloadBarcode(newCode);
    };

    const handleScanSuccess = (barcode: string) => {
        setFormData({ ...formData, item_code: barcode });
        setShowScanModal(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name) {
            setToast({ message: 'Name is required', type: 'error' });
            return;
        }

        setIsLoading(true);

        try {
            if (item) {
                const { error } = await supabase
                    .from('stock_items')
                    .update({
                        name: formData.name,
                        category: formData.category,
                        unit: formData.unit,
                        quantity: parseInt(formData.quantity as any) || 0,
                        min_threshold: formData.min_threshold,
                        per_unit_cost: parseFloat(formData.per_unit_cost as any) || 0,
                        location: formData.location,
                        description: formData.description,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', item.id);

                if (error) throw error;
            } else {
                const response = await fetch(`/api/properties/${propertyId}/stock/items`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...formData,
                        quantity: parseInt(formData.quantity as any),
                        min_threshold: parseInt(formData.min_threshold as any),
                        per_unit_cost: parseFloat(formData.per_unit_cost as any) || 0,
                    }),
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to create item');
            }

            onSuccess?.();
            onClose();
        } catch (err) {
            setToast({ message: err instanceof Error ? err.message : 'Error saving item', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50"
                onClick={onClose}
            >
                <div
                    className="bg-background w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-xl transition-all"
                        >
                            <X size={18} className="text-text-secondary" />
                        </button>
                        <h2 className="text-base font-black text-text-primary tracking-tight">
                            {item ? 'Edit Item' : 'Add New Item'}
                        </h2>
                        {!item ? (
                            <button
                                type="button"
                                onClick={handleReset}
                                className="text-sm font-bold text-primary hover:opacity-70 transition-all"
                            >
                                Reset
                            </button>
                        ) : (
                            <div className="w-8" />
                        )}
                    </div>

                    {/* Scrollable Content */}
                    <form id="stock-item-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 pb-2 space-y-4">

                        {/* Item Name */}
                        <div>
                            <label className={labelClass}>Item Name</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className={inputClass}
                                placeholder="e.g. Organic Arabica Beans"
                                required
                            />
                        </div>

                        {/* Item Code */}
                        <div>
                            <label className={labelClass}>Item Code</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    value={formData.item_code}
                                    onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                                    placeholder="Scan or enter SKU"
                                    disabled={!!item}
                                    className={`${inputClass} pr-12 disabled:opacity-50`}
                                />
                                {!item && (
                                    <button
                                        type="button"
                                        onClick={() => setShowScanModal(true)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-primary hover:opacity-70 transition-all"
                                        title="Scan QR code"
                                    >
                                        <Scan size={20} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Unit & Category */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className={labelClass}>Unit</label>
                                <div className="relative">
                                    <select
                                        value={formData.unit}
                                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                        className={`${inputClass} pr-8`}
                                    >
                                        {UNIT_OPTIONS.map(u => (
                                            <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Category</label>
                                <div className="relative">
                                    <select
                                        value={formData.category}
                                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                        className={`${inputClass} pr-8`}
                                    >
                                        <option value="">Select Category</option>
                                        {CATEGORY_OPTIONS.map(c => (
                                            <option key={c} value={c}>{c}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                                </div>
                            </div>
                        </div>

                        {/* Inventory & Pricing Section */}
                        <div className="bg-primary/5 rounded-2xl p-4 space-y-3">
                            <p className="text-xs font-black text-primary uppercase tracking-widest">Inventory &amp; Pricing</p>

                            {/* Per Unit Cost */}
                            <div>
                                <label className={labelClass}>Per Unit Cost</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary font-bold text-sm">₹</span>
                                    <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={formData.per_unit_cost || ''}
                                        onChange={(e) => setFormData({ ...formData, per_unit_cost: parseFloat(e.target.value) || 0 })}
                                        placeholder="0.00"
                                        className={`${inputClass} pl-8`}
                                    />
                                </div>
                            </div>

                            {/* Min Threshold & Qty */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>Min Threshold</label>
                                    <input
                                        type="number"
                                        value={formData.min_threshold || ''}
                                        onChange={(e) => setFormData({ ...formData, min_threshold: parseInt(e.target.value) || 0 })}
                                        className={inputClass}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>{item ? 'Current Stock' : 'Initial Qty'}</label>
                                    <input
                                        type="number"
                                        value={formData.quantity || ''}
                                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                                        min="0"
                                        className={inputClass}
                                    />
                                </div>
                            </div>
                        </div>

                
                        {/* QR Code Section */}
                        {formData.item_code ? (
                            <div className="p-4 bg-muted border border-border rounded-2xl flex flex-col items-center gap-3">
                                <div className="w-full flex justify-between items-center">
                                    <span className="text-[10px] font-black text-text-secondary uppercase tracking-widest">QR Label</span>
                                    <button
                                        type="button"
                                        onClick={() => downloadBarcode(formData.item_code)}
                                        className="text-[11px] font-bold text-primary uppercase tracking-wide hover:opacity-70 transition-all"
                                    >
                                        Download QR
                                    </button>
                                </div>
                                <Barcode
                                    value={formData.item_code}
                                    className="shadow-lg border-4 border-white rounded-2xl"
                                    size={160}
                                />
                                <p className="text-[11px] font-mono text-text-secondary bg-white px-4 py-1.5 rounded-full border border-border">{formData.item_code}</p>
                            </div>
                        ) : (
                            !item && (
                                <button
                                    type="button"
                                    onClick={generateCode}
                                    className="w-full p-5 border-2 border-dashed border-border rounded-2xl flex flex-col items-center gap-2 hover:border-primary/40 hover:bg-primary/5 transition-all group"
                                >
                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                        <QrCode size={20} className="text-text-secondary group-hover:text-primary" />
                                    </div>
                                    <div className="text-center">
                                        <p className="font-bold text-text-primary text-sm">Generate QR Identifier</p>
                                        <p className="text-[10px] text-text-secondary uppercase tracking-widest mt-0.5">Secure Item ID &amp; Auto-Download</p>
                                    </div>
                                </button>
                            )
                        )}
                    </form>

                    {/* Footer */}
                    <div className="px-5 py-4 flex gap-2.5 shrink-0">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3.5 border border-border rounded-2xl hover:bg-muted transition-all text-text-secondary font-bold text-sm"
                        >
                            Discard
                        </button>
                        <button
                            form="stock-item-form"
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-3.5 bg-primary text-text-inverse rounded-2xl hover:opacity-90 transition-all font-black text-sm disabled:opacity-50 active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                            {isLoading ? 'Saving...' : (
                                <>
                                    {item ? 'Update Item' : 'Create Item'}
                                    {!isLoading && <CheckCircle2 size={16} />}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    visible={true}
                    onClose={() => setToast(null)}
                    duration={3000}
                />
            )}

            <Suspense fallback={null}>
                <BarcodeScannerModal
                    isOpen={showScanModal}
                    onClose={() => setShowScanModal(false)}
                    onScanSuccess={handleScanSuccess}
                    title="Scan Item Code"
                />
            </Suspense>
        </>
    );
};

export default StockItemFormModal;
