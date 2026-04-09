/**
 * StockDashboard
 *
 * Inventory and stock management dashboard for a property.
 * Tracks stock items, low-stock alerts, and records stock movements
 * (additions, removals, adjustments) via barcode scanning.
 *
 * Features:
 * - KPI cards: total item count, low-stock warning count, overall status
 * - Inventory tab: searchable stock item list with refresh capability
 * - Scanner tab: barcode scanning to record add/remove/adjust movements
 * - Reports tab: stock movement and valuation reports
 * - Movement history with relative timestamps ("5m ago", "2h ago")
 * - Low-stock threshold detection (default: quantity < min_threshold or 10)
 * - Data caching via DataCacheContext for stats and movement lists
 * - Toast notifications on successful movement recording
 * - Pre-selected item on QR scan navigation
 *
 * @example
 * <StockDashboard
 *   propertyId="prop_123"
 *   hideReports={false}
 *   initialItemId="item_789"
 * />
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { TrendingDown, AlertTriangle, Package, Scan, ArrowUpCircle, ArrowDownCircle, Clock } from 'lucide-react';
import { createClient } from '@/frontend/utils/supabase/client';
import { Toast } from '@/frontend/components/ui/Toast';
import Skeleton from '@/frontend/components/ui/Skeleton';
import StockItemList from './StockItemList';
import StockMovementModal from './StockMovementModal';
import StockReportView from './StockReportView';
import { useDataCache } from '@/frontend/context/DataCacheContext';

type SubTab = 'inventory' | 'movements' | 'reports';

interface StockDashboardProps {
    propertyId: string;
    hideReports?: boolean;
    hideInventory?: boolean;
    initialSearch?: string;
    initialItemId?: string;
}

interface Movement {
    id: string;
    action: string;
    quantity: number;
    notes: string | null;
    created_at: string;
    stock_items: { name: string; item_code: string; unit?: string } | null;
    users: { full_name: string } | null;
}

const StockDashboard: React.FC<StockDashboardProps> = ({ propertyId, hideReports = false, hideInventory = false, initialSearch, initialItemId }) => {
    const [activeSubTab, setActiveSubTab] = useState<SubTab>(hideInventory ? 'movements' : 'inventory');
    const [showMovementModal, setShowMovementModal] = useState(false);
    const [preSelectedItemId, setPreSelectedItemId] = useState<string | undefined>(undefined);
    const { getCachedData, setCachedData, invalidateCache } = useDataCache();
    const statsCacheKey = `stock-stats-${propertyId}`;
    const movementsCacheKey = `stock-movements-${propertyId}`;
    
    const [stats, setStats] = useState(() => getCachedData(statsCacheKey) || { totalItems: 0, lowStockCount: 0, totalValue: 0 });
    const [movements, setMovements] = useState<Movement[]>(() => getCachedData(movementsCacheKey) || []);
    const [isLoading, setIsLoading] = useState(!getCachedData(statsCacheKey));
    const [isLoadingMovements, setIsLoadingMovements] = useState(false);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [propertyDetails, setPropertyDetails] = useState<{ name: string; code: string } | null>(null);
    const supabase = React.useMemo(() => createClient(), []);

    const fetchPropertyDetails = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('properties')
                .select('name, code')
                .eq('id', propertyId)
                .single();

            if (error) throw error;
            setPropertyDetails(data);
        } catch (err) {
            console.error('Error fetching property details:', err);
        }
    }, [propertyId, supabase]);

    const fetchStats = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('stock_items')
                .select('*')
                .eq('property_id', propertyId);

            if (error) throw error;

            const items = data || [];
            const lowStockCount = items.filter(i => i.quantity < (i.min_threshold || 10)).length;

            setStats({
                totalItems: items.length,
                lowStockCount,
                totalValue: 0,
            });
            setCachedData(statsCacheKey, {
                totalItems: items.length,
                lowStockCount,
                totalValue: 0,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : JSON.stringify(err);
            console.error('Error fetching stock stats:', msg);
        } finally {
            setIsLoading(false);
        }
    }, [propertyId, supabase]);

    const fetchMovements = useCallback(async () => {
        try {
            setIsLoadingMovements(true);
            const { data, error } = await supabase
                .from('stock_movements')
                .select('id, action, quantity_change, notes, created_at, quantity_before, quantity_after, stock_items:item_id(name, item_code, unit), users:user_id(full_name)')
                .eq('property_id', propertyId)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            const processedMovements = (data || []).map((m: any) => ({
                ...m,
                quantity: Math.abs(m.quantity_change),
            }));
            setMovements(processedMovements);
            setCachedData(movementsCacheKey, processedMovements);
        } catch (err) {
            console.error('Error fetching movements:', err);
        } finally {
            setIsLoadingMovements(false);
        }
    }, [propertyId, supabase]);

    useEffect(() => {
        fetchStats();
        fetchPropertyDetails();
    }, [fetchStats, fetchPropertyDetails]);

    // Auto-open movement modal when arriving from a QR scan
    useEffect(() => {
        if (initialItemId) {
            setPreSelectedItemId(initialItemId);
            setShowMovementModal(true);
        }
    }, [initialItemId]);

    useEffect(() => {
        if (activeSubTab === 'movements') {
            fetchMovements();
        }
    }, [activeSubTab, fetchMovements]);

    const handleMovementSuccess = () => {
        setShowMovementModal(false);
        setToast({ message: 'Stock movement recorded successfully', type: 'success' });
        invalidateCache('stock-');
        fetchStats();
        fetchMovements();
    };

    const formatTime = (dateStr: string) => {
        const d = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <div className="w-full space-y-4 overflow-x-hidden">
            {/* KPI Cards — same style across Inventory / Movements / Reports */}
            <div className="grid grid-cols-3 gap-1.5">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-2.5 overflow-hidden min-w-0">
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">Items</p>
                        <Package className="text-blue-400 flex-shrink-0" size={12} />
                    </div>
                    <p className="text-2xl font-black text-gray-900 leading-none">{stats.totalItems}</p>
                </div>

                <div className="bg-orange-50 border border-orange-100 rounded-2xl p-2.5 overflow-hidden min-w-0">
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">Low<br />Stock</p>
                        <AlertTriangle className="text-orange-400 flex-shrink-0" size={12} />
                    </div>
                    <p className="text-2xl font-black text-orange-500 leading-none">{stats.lowStockCount}</p>
                </div>

                <div className="bg-green-50 border border-green-100 rounded-2xl p-2.5 overflow-hidden min-w-0">
                    <div className="flex items-start justify-between gap-1 mb-1.5">
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide leading-none">Status</p>
                        <TrendingDown className="text-green-400 flex-shrink-0" size={12} />
                    </div>
                    <p className="text-2xl font-black text-green-600 leading-none">OK</p>
                </div>
            </div>

            {/* Sub Tabs */}
            <div className="flex gap-0 border-b border-gray-200 overflow-x-auto scrollbar-hide">
                {!hideInventory && (
                    <button
                        onClick={() => setActiveSubTab('inventory')}
                        className={`flex-shrink-0 px-3 sm:px-5 py-2.5 font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap ${activeSubTab === 'inventory'
                            ? 'text-primary border-b-2 border-primary -mb-px'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Inventory
                    </button>
                )}
                <button
                    onClick={() => setActiveSubTab('movements')}
                    className={`flex-shrink-0 px-3 sm:px-5 py-2.5 font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap ${activeSubTab === 'movements'
                        ? 'text-primary border-b-2 border-primary -mb-px'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    Scanner
                </button>
                {!hideReports && (
                    <button
                        onClick={() => setActiveSubTab('reports')}
                        className={`flex-shrink-0 px-3 sm:px-5 py-2.5 font-semibold text-xs sm:text-sm transition-colors whitespace-nowrap ${activeSubTab === 'reports'
                            ? 'text-primary border-b-2 border-primary -mb-px'
                            : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        Reports
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="mt-2">
                {isLoading ? (
                    <Skeleton className="h-96" />
                ) : (
                    <>
                        {activeSubTab === 'inventory' && !hideInventory && (
                            <StockItemList
                                propertyId={propertyId}
                                onRefresh={fetchStats}
                                propertyCode={propertyDetails?.code}
                                initialSearch={initialSearch}
                            />
                        )}

                        {activeSubTab === 'movements' && (
                            <div className="space-y-5">
                                {/* Action Buttons */}
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={() => setShowMovementModal(true)}
                                        className="flex-1 flex items-center justify-center gap-3 px-5 py-4 bg-primary text-text-inverse rounded-2xl hover:opacity-90 transition-all font-bold active:scale-[0.98]"
                                    >
                                        <Scan size={22} />
                                        Scan Barcode &amp; Record Movement
                                    </button>
                                </div>

                                {/* Movement History */}
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 mb-3">Recent Movements</h3>
                                    {isLoadingMovements ? (
                                        <Skeleton className="h-48" />
                                    ) : movements.length === 0 ? (
                                        <div className="text-center py-12 text-gray-400">
                                            <Clock size={40} className="mx-auto mb-3 opacity-40" />
                                            <p className="font-medium">No movements recorded yet</p>
                                            <p className="text-sm mt-1">Scan a barcode to record your first movement</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-gray-100">
                                            {movements.map(mv => (
                                                <div key={mv.id} className="flex items-center gap-2 py-2 px-1">
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${mv.action === 'add' ? 'bg-emerald-100' : mv.action === 'remove' ? 'bg-red-100' : 'bg-blue-100'}`}>
                                                        {mv.action === 'add' ? (
                                                            <ArrowUpCircle size={14} className="text-emerald-600" />
                                                        ) : mv.action === 'remove' ? (
                                                            <ArrowDownCircle size={14} className="text-red-600" />
                                                        ) : (
                                                            <Package size={14} className="text-blue-600" />
                                                        )}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-semibold text-gray-900 text-sm truncate">
                                                            {(mv.stock_items as any)?.name || 'Unknown Item'}
                                                        </p>
                                                        <p className="text-xs text-gray-400 truncate">
                                                            {mv.users?.full_name || 'System'}
                                                            {mv.notes && ` • ${mv.notes}`}
                                                        </p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <span className={`text-sm font-bold ${mv.action === 'add' ? 'text-emerald-600' : mv.action === 'remove' ? 'text-red-600' : 'text-blue-600'}`}>
                                                            {mv.action === 'add' ? '+' : mv.action === 'remove' ? '−' : '↔'}{mv.quantity} {(mv.stock_items as any)?.unit || ''}
                                                        </span>
                                                        <p className="text-xs text-gray-400">{formatTime(mv.created_at)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeSubTab === 'reports' && !hideReports && (
                            <StockReportView propertyId={propertyId} />
                        )}
                    </>
                )}
            </div>

            {/* Modals */}
            <StockMovementModal
                isOpen={showMovementModal}
                onClose={() => { setShowMovementModal(false); setPreSelectedItemId(undefined); }}
                propertyId={propertyId}
                onSuccess={handleMovementSuccess}
                preSelectedItemId={preSelectedItemId}
            />

            {/* Toast */}
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
    );
};

export default StockDashboard;

