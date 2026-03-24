'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { X, Scan, Package, Plus, Minus, Search, ArrowLeft } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createClient } from '@/frontend/utils/supabase/client';
import { Toast } from '@/frontend/components/ui/Toast';
import Skeleton from '@/frontend/components/ui/Skeleton';

const BarcodeScannerModal = dynamic(
    () => import('./BarcodeScannerModal'),
    { ssr: false, loading: () => <div>Loading scanner...</div> }
);

interface StockMovementModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    onSuccess?: () => void;
    preSelectedItemId?: string;
    autoOpenScanner?: boolean;
}

interface StockItem {
    id: string;
    name: string;
    item_code: string;
    quantity: number;
    min_threshold: number;
    barcode?: string;
    category?: string;
    location?: string;
    unit?: string;
}

const UNIT_CONVERSIONS: Record<string, { label: string; subUnit: string; subLabel: string; factor: number }> = {
    'litre': { label: 'Litre', subUnit: 'ml', subLabel: 'ml', factor: 1000 },
    'litres': { label: 'Litre', subUnit: 'ml', subLabel: 'ml', factor: 1000 },
    'liter': { label: 'Liter', subUnit: 'ml', subLabel: 'ml', factor: 1000 },
    'liters': { label: 'Liter', subUnit: 'ml', subLabel: 'ml', factor: 1000 },
    'l': { label: 'L', subUnit: 'ml', subLabel: 'ml', factor: 1000 },
    'kg': { label: 'Kg', subUnit: 'grams', subLabel: 'Grams', factor: 1000 },
    'kilogram': { label: 'Kilogram', subUnit: 'grams', subLabel: 'Grams', factor: 1000 },
    'kilograms': { label: 'Kilograms', subUnit: 'grams', subLabel: 'Grams', factor: 1000 },
    'meter': { label: 'Meter', subUnit: 'cm', subLabel: 'cm', factor: 100 },
    'meters': { label: 'Meters', subUnit: 'cm', subLabel: 'cm', factor: 100 },
    'm': { label: 'm', subUnit: 'cm', subLabel: 'cm', factor: 100 },
    'dozen': { label: 'Dozen', subUnit: 'pieces', subLabel: 'Pieces', factor: 12 },
    'dozens': { label: 'Dozens', subUnit: 'pieces', subLabel: 'Pieces', factor: 12 },
    'ml': { label: 'ml', subUnit: 'litre', subLabel: 'Litre', factor: 1000 },
    'millilitre': { label: 'ml', subUnit: 'litre', subLabel: 'Litre', factor: 1000 },
    'millilitres': { label: 'ml', subUnit: 'litre', subLabel: 'Litre', factor: 1000 },
    'grams': { label: 'Grams', subUnit: 'kg', subLabel: 'Kg', factor: 1000 },
    'gram': { label: 'Gram', subUnit: 'kg', subLabel: 'Kg', factor: 1000 },
    'g': { label: 'g', subUnit: 'kg', subLabel: 'Kg', factor: 1000 },
    'cm': { label: 'cm', subUnit: 'meter', subLabel: 'Meter', factor: 100 },
    'centimeter': { label: 'cm', subUnit: 'meter', subLabel: 'Meter', factor: 100 },
    'centimeters': { label: 'cm', subUnit: 'meter', subLabel: 'Meter', factor: 100 },
};

function cleanUnitLabel(unit: string | undefined): string {
    if (!unit) return 'units';
    return unit.replace(/^\d+\s*/, '').trim() || unit;
}

function getUnitConversion(unit: string | undefined) {
    if (!unit) return null;
    const normalized = unit.toLowerCase().trim();
    if (UNIT_CONVERSIONS[normalized]) return UNIT_CONVERSIONS[normalized];
    const stripped = normalized.replace(/^[\d.,\s]+/, '').trim();
    if (UNIT_CONVERSIONS[stripped]) return UNIT_CONVERSIONS[stripped];
    for (const key of Object.keys(UNIT_CONVERSIONS)) {
        if (normalized.includes(key)) return UNIT_CONVERSIONS[key];
    }
    return null;
}

function getStockStatus(item: StockItem): { label: string; className: string } {
    const threshold = item.min_threshold || 10;
    if (item.quantity === 0) return { label: 'OUT OF STOCK', className: 'bg-red-100 text-red-600' };
    if (item.quantity < threshold) return { label: 'LOW STOCK', className: 'bg-red-100 text-red-500' };
    if (item.quantity < threshold * 2) return { label: 'REORDER SOON', className: 'bg-amber-100 text-amber-600' };
    return { label: 'IN STOCK', className: 'bg-green-100 text-green-600' };
}

const StockMovementModal: React.FC<StockMovementModalProps> = ({
    isOpen, onClose, propertyId, onSuccess, preSelectedItemId, autoOpenScanner
}) => {
    const [step, setStep] = useState<'select' | 'action'>('select');
    const [items, setItems] = useState<StockItem[]>([]);
    const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
    const [action, setAction] = useState<'add' | 'remove'>('add');
    const [quantity, setQuantity] = useState(1);
    const [selectedUnit, setSelectedUnit] = useState<'base' | 'sub'>('base');
    const [notes, setNotes] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isFetchingItems, setIsFetchingItems] = useState(true);
    const [showScanModal, setShowScanModal] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const supabase = React.useMemo(() => createClient(), []);

    useEffect(() => {
        if (isOpen) {
            fetchItems();
            setStep('select');
            setSelectedItem(null);
            setAction('add');
            setQuantity(1);
            setSelectedUnit('base');
            setNotes('');
            setSearchTerm('');
            if (autoOpenScanner) setShowScanModal(true);
        }
    }, [isOpen, autoOpenScanner]);

    useEffect(() => {
        if (preSelectedItemId && items.length > 0) {
            // Support finding by ID, barcode, or item_code
            const item = items.find(i => 
                i.id === preSelectedItemId || 
                i.barcode === preSelectedItemId || 
                i.item_code === preSelectedItemId
            );
            if (item) { 
                setSelectedItem(item); 
                setStep('action'); 
            }
        }
    }, [preSelectedItemId, items]);

    const fetchItems = async () => {
        try {
            setIsFetchingItems(true);
            const { data, error } = await supabase
                .from('stock_items')
                .select('id, name, item_code, quantity, min_threshold, barcode, category, location, unit')
                .eq('property_id', propertyId)
                .order('name', { ascending: true });
            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            setToast({ message: 'Error loading items', type: 'error' });
        } finally {
            setIsFetchingItems(false);
        }
    };

    const handleScanSuccess = (barcode: string) => {
        setShowScanModal(false);
        const foundItem = items.find(i =>
            i.barcode === barcode || i.item_code === barcode ||
            i.location?.toLowerCase() === barcode.toLowerCase()
        );
        if (foundItem) {
            setSelectedItem(foundItem);
            setStep('action');
        } else {
            const itemsInLocation = items.filter(i => i.location?.toLowerCase().includes(barcode.toLowerCase()));
            if (itemsInLocation.length > 0) {
                setSearchTerm(barcode);
                setToast({ message: `Filtered items by location: ${barcode}`, type: 'success' });
            } else {
                setToast({ message: `No item or location found for: ${barcode}`, type: 'error' });
            }
        }
    };

    const computeBaseQuantity = (): number => {
        if (!selectedItem) return 0;
        const conversion = getUnitConversion(selectedItem.unit);
        if (selectedUnit === 'sub' && conversion) return quantity / conversion.factor;
        return quantity;
    };

    const getActiveUnitLabel = (): string => {
        if (!selectedItem) return 'units';
        const conversion = getUnitConversion(selectedItem.unit);
        if (selectedUnit === 'sub' && conversion) return conversion.subLabel;
        return cleanUnitLabel(selectedItem.unit);
    };

    const handleSubmit = async () => {
        if (!selectedItem || quantity <= 0 || computeBaseQuantity() <= 0) {
            setToast({ message: 'Please enter a valid quantity', type: 'error' });
            return;
        }
        const baseQty = computeBaseQuantity();
        setIsLoading(true);
        try {
            const unitLabel = getActiveUnitLabel();
            const response = await fetch(`/api/properties/${propertyId}/stock/movements`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: selectedItem.id,
                    action,
                    quantity: baseQty,
                    notes: notes || (selectedUnit === 'sub' ? `${quantity} ${unitLabel}` : ''),
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to record movement');
            setToast({ message: `Successfully ${action === 'add' ? 'added' : 'removed'} ${quantity} ${unitLabel}`, type: 'success' });
            onSuccess?.();
            onClose();
        } catch (err) {
            setToast({ message: err instanceof Error ? err.message : 'Error recording movement', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const filteredItems = items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.barcode && item.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
    );

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
                    {step === 'select' && (
                        <>
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-xl transition-all"
                                >
                                    <X size={18} className="text-text-secondary" />
                                </button>
                                <h2 className="text-base font-black text-text-primary tracking-tight">Stock Movement</h2>
                                <div className="w-8" />
                            </div>

                            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
                                {/* Scan Button */}
                                <button
                                    onClick={() => setShowScanModal(true)}
                                    className="w-full flex items-center justify-center gap-3 px-5 py-4 bg-primary text-text-inverse rounded-2xl hover:opacity-90 transition-all font-bold text-base active:scale-[0.98]"
                                >
                                    <Scan size={22} />
                                    Scan Barcode to Find Item
                                </button>

                                {/* Divider */}
                                <div className="flex items-center gap-3">
                                    <div className="flex-1 border-t border-border" />
                                    <span className="text-xs text-text-secondary font-medium">or select manually</span>
                                    <div className="flex-1 border-t border-border" />
                                </div>

                                {/* Search */}
                                <div className="relative">
                                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-secondary" />
                                    <input
                                        type="text"
                                        placeholder="Search items by name, code..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-muted border border-border rounded-2xl focus:outline-none focus:border-primary text-sm text-text-primary placeholder-text-secondary transition-all"
                                    />
                                </div>

                                {/* List Header */}
                                <div className="flex items-center justify-between">
                                    <p className="text-[10px] font-black text-text-secondary uppercase tracking-widest">Inventory Items</p>
                                    <p className="text-xs text-text-secondary">Showing {filteredItems.length} items</p>
                                </div>

                                {/* Item Cards */}
                                {isFetchingItems ? (
                                    <Skeleton className="h-48" />
                                ) : filteredItems.length === 0 ? (
                                    <div className="text-center py-10 text-text-secondary text-sm">
                                        No items found
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {filteredItems.map(item => {
                                            const status = getStockStatus(item);
                                            const unit = cleanUnitLabel(item.unit);
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => { setSelectedItem(item); setStep('action'); }}
                                                    className="w-full p-4 bg-white border border-border rounded-2xl text-left hover:border-primary/40 hover:bg-primary/5 transition-all active:scale-[0.99]"
                                                >
                                                    {/* Row 1: Name + Status */}
                                                    <div className="flex items-start justify-between gap-2 mb-1">
                                                        <p className="text-base font-black text-text-primary leading-tight">{item.name}</p>
                                                        <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-full shrink-0 tracking-wide ${status.className}`}>
                                                            {status.label}
                                                        </span>
                                                    </div>
                                                    {/* Row 2: Code */}
                                                    <p className="text-[11px] font-mono text-text-secondary uppercase mb-2">{item.item_code}</p>
                                                    {/* Row 3: Unit + Qty */}
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-1.5 text-text-secondary">
                                                            <Package size={13} />
                                                            <span className="text-xs font-medium">{unit.charAt(0).toUpperCase() + unit.slice(1)}</span>
                                                        </div>
                                                        <div className="flex items-baseline gap-1">
                                                            <span className="text-base font-black text-text-primary">{item.quantity}</span>
                                                            <span className="text-xs text-text-secondary">Current Qty</span>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {step === 'action' && selectedItem && (
                        <>
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
                                <button
                                    onClick={() => { setStep('select'); setSelectedItem(null); }}
                                    className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-xl transition-all"
                                >
                                    <ArrowLeft size={18} className="text-text-secondary" />
                                </button>
                                <h2 className="text-base font-black text-text-primary tracking-tight">Record Movement</h2>
                                <button
                                    onClick={onClose}
                                    className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-xl transition-all"
                                >
                                    <X size={18} className="text-text-secondary" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto px-5 pb-2 space-y-4">
                                {/* Item Info Card */}
                                <div className="bg-primary/5 border border-primary/10 rounded-2xl p-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                                            <Package size={18} className="text-primary" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="font-black text-text-primary text-base leading-tight truncate">{selectedItem.name}</p>
                                            <p className="text-xs text-text-secondary font-mono truncate">{selectedItem.item_code}</p>
                                        </div>
                                    </div>
                                    <div className="mt-3 flex items-center gap-2">
                                        <span className="text-xs text-text-secondary">Current Stock:</span>
                                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${selectedItem.quantity < (selectedItem.min_threshold || 10) ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                            {selectedItem.quantity} {cleanUnitLabel(selectedItem.unit)}
                                        </span>
                                    </div>
                                </div>

                                {/* Add / Take Toggle */}
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setAction('add')}
                                        className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all ${action === 'add'
                                            ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20'
                                            : 'bg-muted text-text-secondary hover:bg-emerald-50 hover:text-emerald-600'
                                            }`}
                                    >
                                        <Plus size={16} />
                                        Add Stock
                                    </button>
                                    <button
                                        onClick={() => setAction('remove')}
                                        className={`flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-bold text-sm transition-all ${action === 'remove'
                                            ? 'bg-red-500 text-white shadow-md shadow-red-500/20'
                                            : 'bg-muted text-text-secondary hover:bg-red-50 hover:text-red-600'
                                            }`}
                                    >
                                        <Minus size={16} />
                                        Take Stock
                                    </button>
                                </div>

                                {/* Unit Selector */}
                                {(() => {
                                    const conversion = getUnitConversion(selectedItem.unit);
                                    if (!conversion) return null;
                                    return (
                                        <div>
                                            <label className="block text-sm font-bold text-text-primary mb-2">Unit</label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => { setSelectedUnit('base'); setQuantity(1); }}
                                                    className={`px-4 py-2.5 rounded-2xl font-bold text-sm transition-all ${selectedUnit === 'base' ? 'bg-primary text-text-inverse' : 'bg-muted text-text-secondary hover:bg-primary/10 hover:text-primary'}`}
                                                >
                                                    {conversion.label}
                                                </button>
                                                <button
                                                    onClick={() => { setSelectedUnit('sub'); setQuantity(1); }}
                                                    className={`px-4 py-2.5 rounded-2xl font-bold text-sm transition-all ${selectedUnit === 'sub' ? 'bg-primary text-text-inverse' : 'bg-muted text-text-secondary hover:bg-primary/10 hover:text-primary'}`}
                                                >
                                                    {conversion.subLabel}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })()}

                                {/* Quantity Input */}
                                <div>
                                    <label className="block text-sm font-bold text-text-primary mb-2">Quantity ({getActiveUnitLabel()})</label>
                                    <div className="flex items-center gap-2 w-full">
                                        <button
                                            onClick={() => {
                                                const s = selectedUnit === 'sub' ? 100 : 0.5;
                                                setQuantity(Math.max(0, parseFloat((quantity - s).toFixed(2))));
                                            }}
                                            className="w-10 h-10 shrink-0 bg-muted rounded-xl flex items-center justify-center hover:bg-border transition-colors text-text-primary font-bold text-lg"
                                        >−</button>
                                        <input
                                            type="number"
                                            value={quantity === 0 ? '' : quantity}
                                            onChange={(e) => {
                                                const raw = e.target.value;
                                                if (raw === '') { setQuantity(0); return; }
                                                const val = parseFloat(raw);
                                                if (!isNaN(val) && val >= 0) setQuantity(val);
                                            }}
                                            min="0"
                                            step="any"
                                            placeholder="0"
                                            className="flex-1 min-w-0 px-2 py-3 bg-muted border border-border rounded-xl focus:outline-none focus:border-primary text-text-primary text-center text-xl font-black"
                                        />
                                        <button
                                            onClick={() => {
                                                const s = selectedUnit === 'sub' ? 100 : 0.5;
                                                setQuantity(parseFloat((quantity + s).toFixed(2)));
                                            }}
                                            className="w-10 h-10 shrink-0 bg-muted rounded-xl flex items-center justify-center hover:bg-border transition-colors text-text-primary font-bold text-lg"
                                        >+</button>
                                    </div>
                                    {action === 'remove' && computeBaseQuantity() > selectedItem.quantity && (
                                        <p className="text-xs text-red-500 mt-1.5 font-medium">Cannot take more than current stock ({selectedItem.quantity} {cleanUnitLabel(selectedItem.unit)})</p>
                                    )}
                                </div>

                                {/* Notes */}
                                <div>
                                    <label className="block text-sm font-bold text-text-primary mb-2">Notes <span className="text-text-secondary font-normal">(optional)</span></label>
                                    <input
                                        type="text"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Reason for the movement..."
                                        className="w-full px-4 py-3 bg-muted border border-border rounded-2xl focus:outline-none focus:border-primary text-text-primary placeholder-text-secondary text-sm transition-all"
                                    />
                                </div>

                                {/* Result Preview */}
                                <div className="bg-muted rounded-2xl p-3.5 text-sm">
                                    {(() => {
                                        const baseQty = computeBaseQuantity();
                                        const baseUnit = cleanUnitLabel(selectedItem.unit);
                                        const resultQty = action === 'add'
                                            ? selectedItem.quantity + baseQty
                                            : Math.max(0, selectedItem.quantity - baseQty);
                                        const conversion = getUnitConversion(selectedItem.unit);
                                        const showConversion = selectedUnit === 'sub' && conversion;
                                        return (
                                            <>
                                                <span className="text-text-secondary">Result: </span>
                                                <span className="font-black text-text-primary">
                                                    {selectedItem.quantity} {action === 'add' ? '+' : '−'} {baseQty % 1 === 0 ? baseQty : baseQty.toFixed(2)} = {resultQty % 1 === 0 ? resultQty : resultQty.toFixed(2)} {baseUnit}
                                                </span>
                                                {showConversion && (
                                                    <span className="text-text-secondary ml-1">({quantity} {conversion.subLabel})</span>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-5 py-4 shrink-0">
                                <button
                                    onClick={handleSubmit}
                                    disabled={isLoading || (action === 'remove' && computeBaseQuantity() > selectedItem.quantity)}
                                    className={`w-full px-4 py-3.5 rounded-2xl font-black text-sm transition-all disabled:opacity-50 active:scale-[0.98] ${action === 'add'
                                        ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/20 hover:opacity-90'
                                        : 'bg-red-500 text-white shadow-md shadow-red-500/20 hover:opacity-90'
                                        }`}
                                >
                                    {isLoading ? 'Processing...' : action === 'add'
                                        ? `+ Add ${quantity} ${getActiveUnitLabel()}`
                                        : `− Take ${quantity} ${getActiveUnitLabel()}`}
                                </button>
                            </div>
                        </>
                    )}

                    {toast && (
                        <Toast
                            message={toast.message}
                            type={toast.type}
                            visible={true}
                            onClose={() => setToast(null)}
                            duration={3000}
                        />
                    )}
                </div>
            </div>

            <Suspense fallback={null}>
                <BarcodeScannerModal
                    isOpen={showScanModal}
                    onClose={() => setShowScanModal(false)}
                    onScanSuccess={handleScanSuccess}
                    title="Scan Item Barcode"
                />
            </Suspense>
        </>
    );
};

export default StockMovementModal;
