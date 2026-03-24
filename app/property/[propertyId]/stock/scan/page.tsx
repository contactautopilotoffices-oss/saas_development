'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import { ArrowLeft, Plus, Minus, Package, CheckCircle, AlertCircle } from 'lucide-react';
import Loader from '@/frontend/components/ui/Loader';

interface StockItem {
    id: string;
    name: string;
    item_code: string;
    quantity: number;
    min_threshold?: number;
    unit?: string;
    location?: string;
    category?: string;
    barcode?: string;
}

type ActionState = 'idle' | 'loading' | 'success' | 'error';

function ScanActionContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const propertyId = params.propertyId as string;

    const itemId = searchParams.get('item');
    const barcode = searchParams.get('barcode');

    const [item, setItem] = useState<StockItem | null>(null);
    const [isFetching, setIsFetching] = useState(true);
    const [notFound, setNotFound] = useState(false);

    const [action, setAction] = useState<'add' | 'remove'>('add');
    const [quantity, setQuantity] = useState(1);
    const [notes, setNotes] = useState('');
    const [actionState, setActionState] = useState<ActionState>('idle');
    const [resultMessage, setResultMessage] = useState('');
    const [newQuantity, setNewQuantity] = useState<number | null>(null);

    const supabase = createClient();

    useEffect(() => {
        const fetchItem = async () => {
            setIsFetching(true);
            try {
                let query = supabase
                    .from('stock_items')
                    .select('id, name, item_code, quantity, min_threshold, unit, location, category, barcode')
                    .eq('property_id', propertyId);

                if (itemId) {
                    query = query.eq('id', itemId);
                } else if (barcode) {
                    query = query.eq('barcode', decodeURIComponent(barcode));
                } else {
                    setNotFound(true);
                    setIsFetching(false);
                    return;
                }

                const { data, error } = await query.maybeSingle();

                if (error || !data) {
                    setNotFound(true);
                } else {
                    setItem(data);
                }
            } catch {
                setNotFound(true);
            } finally {
                setIsFetching(false);
            }
        };

        fetchItem();
    }, [propertyId, itemId, barcode]);

    const handleConfirm = async () => {
        if (!item || quantity < 1) return;

        setActionState('loading');
        try {
            const res = await fetch(`/api/properties/${propertyId}/stock/scan`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    itemId: item.id,
                    action,
                    quantity,
                    notes: notes || `Stock ${action === 'add' ? 'In' : 'Out'} via QR Scan`,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                setResultMessage(data.error || 'Something went wrong');
                setActionState('error');
            } else {
                setNewQuantity(data.newQuantity);
                setResultMessage(`${action === 'add' ? 'Added' : 'Removed'} ${quantity} ${item.unit || 'unit(s)'} successfully`);
                setActionState('success');
                // Update local item quantity for display
                setItem(prev => prev ? { ...prev, quantity: data.newQuantity } : prev);
            }
        } catch {
            setResultMessage('Network error. Please try again.');
            setActionState('error');
        }
    };

    const handleReset = () => {
        setActionState('idle');
        setQuantity(1);
        setNotes('');
        setResultMessage('');
        setNewQuantity(null);
    };

    if (isFetching) {
        return (
            <div className="h-screen flex items-center justify-center bg-background">
                <Loader size="lg" />
            </div>
        );
    }

    if (notFound || !item) {
        return (
            <div className="h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
                <Package className="w-14 h-14 text-text-tertiary" />
                <h2 className="text-xl font-bold text-text-primary">Item Not Found</h2>
                <p className="text-text-secondary text-sm">No stock item matches this QR code.</p>
                <button
                    onClick={() => router.back()}
                    className="mt-2 px-6 py-2.5 rounded-[var(--radius-md)] bg-primary text-white font-semibold text-sm"
                >
                    Go Back
                </button>
            </div>
        );
    }

    const isLowStock = item.quantity <= (item.min_threshold || 0);

    // Success screen
    if (actionState === 'success') {
        return (
            <div className="h-screen flex flex-col items-center justify-center gap-5 bg-background px-6 text-center">
                <CheckCircle className="w-16 h-16 text-green-500" />
                <h2 className="text-xl font-bold text-text-primary">{resultMessage}</h2>
                <div className="bg-surface border border-border rounded-[var(--radius-lg)] px-6 py-4 w-full max-w-sm">
                    <p className="text-text-secondary text-sm">{item.name}</p>
                    <p className="text-3xl font-bold text-text-primary mt-1">
                        {newQuantity ?? item.quantity}
                        <span className="text-base font-normal text-text-tertiary ml-1">{item.unit || 'units'}</span>
                    </p>
                    <p className="text-xs text-text-tertiary mt-1">Current stock</p>
                </div>
                <div className="flex gap-3 w-full max-w-sm">
                    <button
                        onClick={handleReset}
                        className="flex-1 py-3 rounded-[var(--radius-md)] border border-border bg-surface text-text-primary font-semibold text-sm"
                    >
                        Another Action
                    </button>
                    <button
                        onClick={() => router.back()}
                        className="flex-1 py-3 rounded-[var(--radius-md)] bg-primary text-white font-semibold text-sm"
                    >
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-border bg-surface">
                <button
                    onClick={() => router.back()}
                    className="p-2 rounded-full hover:bg-muted transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-text-primary" />
                </button>
                <div>
                    <h1 className="text-base font-bold text-text-primary leading-tight">{item.name}</h1>
                    <p className="text-xs text-text-tertiary">{item.item_code}</p>
                </div>
            </div>

            <div className="flex-1 px-4 py-6 flex flex-col gap-5 max-w-md mx-auto w-full">
                {/* Item info card */}
                <div className="bg-surface border border-border rounded-[var(--radius-lg)] p-4 flex items-center justify-between">
                    <div>
                        <p className="text-xs text-text-tertiary mb-0.5">Current Stock</p>
                        <p className={`text-3xl font-bold ${isLowStock ? 'text-red-500' : 'text-text-primary'}`}>
                            {item.quantity}
                            <span className="text-base font-normal text-text-tertiary ml-1">{item.unit || 'units'}</span>
                        </p>
                        {isLowStock && (
                            <p className="text-xs text-red-500 mt-0.5 font-medium">Low Stock</p>
                        )}
                    </div>
                    <div className="text-right text-xs text-text-tertiary space-y-1">
                        {item.category && <p className="bg-muted px-2 py-0.5 rounded-full">{item.category}</p>}
                        {item.location && <p>{item.location}</p>}
                    </div>
                </div>

                {/* Action toggle */}
                <div className="flex rounded-[var(--radius-md)] overflow-hidden border border-border bg-surface">
                    <button
                        onClick={() => setAction('add')}
                        className={`flex-1 py-3 text-sm font-bold transition-colors ${action === 'add'
                            ? 'bg-green-500 text-white'
                            : 'text-text-secondary hover:bg-muted'
                            }`}
                    >
                        Stock In
                    </button>
                    <button
                        onClick={() => setAction('remove')}
                        className={`flex-1 py-3 text-sm font-bold transition-colors ${action === 'remove'
                            ? 'bg-red-500 text-white'
                            : 'text-text-secondary hover:bg-muted'
                            }`}
                    >
                        Stock Out
                    </button>
                </div>

                {/* Quantity picker */}
                <div className="bg-surface border border-border rounded-[var(--radius-lg)] p-4">
                    <p className="text-xs text-text-tertiary mb-3 font-medium uppercase tracking-wider">Quantity</p>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setQuantity(q => Math.max(1, q - 1))}
                            className="w-12 h-12 rounded-full border border-border bg-muted flex items-center justify-center hover:bg-border transition-colors"
                        >
                            <Minus className="w-5 h-5 text-text-primary" />
                        </button>
                        <input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                            className="flex-1 text-center text-3xl font-bold text-text-primary bg-transparent border-none outline-none"
                        />
                        <button
                            onClick={() => setQuantity(q => q + 1)}
                            className="w-12 h-12 rounded-full border border-border bg-muted flex items-center justify-center hover:bg-border transition-colors"
                        >
                            <Plus className="w-5 h-5 text-text-primary" />
                        </button>
                    </div>
                    <p className="text-center text-xs text-text-tertiary mt-2">{item.unit || 'units'}</p>
                </div>

                {/* Notes (optional) */}
                <input
                    type="text"
                    placeholder="Notes (optional)"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    className="w-full px-4 py-3 rounded-[var(--radius-md)] border border-border bg-surface text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-primary"
                />

                {/* Error message */}
                {actionState === 'error' && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-[var(--radius-md)] px-4 py-3">
                        <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                        <p className="text-sm text-red-600">{resultMessage}</p>
                    </div>
                )}

                {/* Confirm button */}
                <button
                    onClick={handleConfirm}
                    disabled={actionState === 'loading'}
                    className={`w-full py-4 rounded-[var(--radius-md)] font-bold text-white text-base transition-colors ${action === 'add' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                        } disabled:opacity-50`}
                >
                    {actionState === 'loading'
                        ? 'Processing...'
                        : `Confirm ${action === 'add' ? 'Stock In' : 'Stock Out'} · ${quantity} ${item.unit || 'units'}`
                    }
                </button>
            </div>
        </div>
    );
}

export default function StockScanPage() {
    return (
        <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-background"><Loader size="lg" /></div>}>
            <ScanActionContent />
        </Suspense>
    );
}
