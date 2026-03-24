'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { Search, Plus, Trash2, Edit2, Scan, Download, Upload } from 'lucide-react';
import dynamic from 'next/dynamic';
import { createClient } from '@/frontend/utils/supabase/client';
import Skeleton from '@/frontend/components/ui/Skeleton';
import StockItemFormModal from './StockItemFormModal';
import StockItemDetailsModal from './StockItemDetailsModal';
import BulkImportModal from './BulkImportModal';
import { Toast } from '@/frontend/components/ui/Toast';
import BarcodeGenerator, { downloadBarcode } from './Barcode';

const BarcodeScannerModal = dynamic(
    () => import('./BarcodeScannerModal'),
    { ssr: false, loading: () => <div>Loading scanner...</div> }
);

interface StockItemListProps {
    propertyId: string;
    onRefresh?: () => void;
    propertyCode?: string;
    initialSearch?: string;
}

interface StockItem {
    id: string;
    item_code: string;
    name: string;
    category?: string;
    quantity: number;
    min_threshold?: number;
    location?: string;
    unit?: string;
    barcode?: string;
    barcode_format?: string;
    qr_code_data?: Record<string, any>;
    created_at?: string;
    updated_at?: string;
    description?: string;
}

const StockItemList: React.FC<StockItemListProps> = ({ propertyId, onRefresh, propertyCode, initialSearch }) => {
    const [items, setItems] = useState<StockItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState(initialSearch || '');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [showFormModal, setShowFormModal] = useState(false);
    const [editingItem, setEditingItem] = useState<StockItem | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [showScanModal, setShowScanModal] = useState(false);
    const [viewingItem, setViewingItem] = useState<StockItem | null>(null);
    const [showBulkImport, setShowBulkImport] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const supabase = React.useMemo(() => createClient(), []);

    const fetchItems = useCallback(async () => {
        try {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('stock_items')
                .select('*')
                .eq('property_id', propertyId)
                .order('name', { ascending: true });

            if (error) throw error;
            setItems(data || []);
        } catch (err) {
            setToast({ message: 'Error loading items', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    }, [propertyId, supabase]);

    useEffect(() => {
        fetchItems();
    }, [fetchItems]);

    const handleDelete = async (itemId: string) => {
        if (!confirm('Are you sure you want to delete this item?')) return;

        try {
            const { error } = await supabase.from('stock_items').delete().eq('id', itemId);
            if (error) throw error;

            setItems(items.filter(i => i.id !== itemId));
            setToast({ message: 'Item deleted', type: 'success' });
        } catch (err) {
            setToast({ message: 'Error deleting item', type: 'error' });
        }
    };

    const handleFormSuccess = () => {
        setShowFormModal(false);
        setEditingItem(null);
        fetchItems();
        onRefresh?.();
        setToast({ message: editingItem ? 'Item updated' : 'Item created', type: 'success' });
    };

    const handleScanSuccess = (barcode: string) => {
        setSearchTerm(barcode);
        setShowScanModal(false);
    };

    const handleDownloadBarcode = (item: StockItem) => {
        if (!item.barcode) return;
        try {
            const fileName = `qr-${item.name.replace(/\s+/g, '_')}-${item.item_code || 'item'}.png`;
            downloadBarcode(item.barcode, fileName);
        } catch (err) {
            setToast({ message: 'Error generating QR image', type: 'error' });
        }
    };

    const toggleSelectItem = (itemId: string) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(itemId)) {
                next.delete(itemId);
            } else {
                next.add(itemId);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedItems.size === filteredItems.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredItems.map(i => i.id)));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedItems.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedItems.size} item(s)? Stock movement history will be preserved.`)) return;

        try {
            setIsDeleting(true);
            const res = await fetch(`/api/properties/${propertyId}/stock/items`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemIds: Array.from(selectedItems) }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Delete failed');

            setItems(items.filter(i => !selectedItems.has(i.id)));
            setSelectedItems(new Set());
            setToast({ message: `${data.deletedCount} item(s) deleted`, type: 'success' });
            onRefresh?.();
        } catch (err) {
            setToast({ message: err instanceof Error ? err.message : 'Error deleting items', type: 'error' });
        } finally {
            setIsDeleting(false);
        }
    };

    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
            (item.barcode && item.barcode.toLowerCase().includes(searchTerm.toLowerCase())) ||
            item.id.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = !categoryFilter || item.category === categoryFilter;
        return matchesSearch && matchesCategory;
    });

    const categories = Array.from(new Set(items.map(i => i.category).filter(Boolean)));

    if (isLoading) {
        return <Skeleton className="h-96" />;
    }

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex justify-between items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold truncate">Inventory Items</h3>
                <div className="flex items-center gap-1.5 shrink-0">
                    {selectedItems.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={isDeleting}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-semibold text-xs disabled:opacity-50"
                        >
                            <Trash2 size={13} />
                            {isDeleting ? '...' : selectedItems.size}
                        </button>
                    )}
                    <button
                        onClick={() => setShowBulkImport(true)}
                        className="p-1.5 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-all"
                        title="Bulk Import"
                    >
                        <Upload size={15} />
                    </button>
                    <button
                        onClick={() => { setEditingItem(null); setShowFormModal(true); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-primary text-text-inverse rounded-full hover:opacity-90 transition-all font-semibold text-sm"
                    >
                        <Plus size={14} />
                        Add
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-2">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                    <input
                        type="text"
                        placeholder="Search name or code..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm"
                    />
                </div>
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-2 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-400 text-sm shrink-0 w-20"
                >
                    <option value="">All</option>
                    {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
            </div>

            {/* Table — scrolls horizontally independently */}
            <div className="rounded-xl border border-gray-100" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                <table style={{ minWidth: '620px', width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50">
                                <th className="py-2.5 px-3 w-8 whitespace-nowrap">
                                    <input
                                        type="checkbox"
                                        checked={filteredItems.length > 0 && selectedItems.size === filteredItems.length}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                        title="Select All"
                                    />
                                </th>
                                <th className="text-left py-2.5 px-3 font-semibold text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">Code</th>
                                <th className="text-left py-2.5 px-3 font-semibold text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">QR Code</th>
                                <th className="text-left py-2.5 px-3 font-semibold text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">Name</th>
                                <th className="text-left py-2.5 px-3 font-semibold text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">Category</th>
                                <th className="text-right py-2.5 px-3 font-semibold text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">Qty</th>
                                <th className="text-center py-2.5 px-3 font-semibold text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">Location</th>
                                <th className="text-center py-2.5 px-3 font-semibold text-xs text-gray-500 uppercase tracking-wide whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredItems.map(item => {
                                const isLowStock = item.quantity < (item.min_threshold || 10);
                                // Show last 8 chars of code so it's short but unique
                                const shortCode = item.item_code.length > 8
                                    ? '…' + item.item_code.slice(-8)
                                    : item.item_code;
                                return (
                                    <tr key={item.id} className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedItems.has(item.id) ? 'bg-blue-50' : ''}`}>
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.has(item.id)}
                                                onChange={() => toggleSelectItem(item.id)}
                                                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            <span className="text-xs font-mono text-gray-600">{shortCode}</span>
                                        </td>
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            {item.barcode ? (
                                                <button onClick={() => setViewingItem(item)} className="flex items-center gap-1 text-accent-primary hover:underline">
                                                    <Scan size={12} />
                                                    <span className="text-xs font-mono">{item.barcode.substring(0, 8)}…</span>
                                                </button>
                                            ) : (
                                                <span className="text-gray-300 text-xs">—</span>
                                            )}
                                            <div className="hidden pointer-events-none">
                                                {item.barcode && <BarcodeGenerator value={item.barcode} />}
                                            </div>
                                        </td>
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            <span className="text-sm font-medium">{item.name}</span>
                                        </td>
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            <span className="text-xs text-gray-500">{item.category || '—'}</span>
                                        </td>
                                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${isLowStock ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700'}`}>
                                                {item.quantity}
                                            </span>
                                            <span className="text-[10px] text-gray-400 ml-1">{item.unit || 'u'}</span>
                                        </td>
                                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                            <span className="text-xs text-gray-500">{item.location || '—'}</span>
                                        </td>
                                        <td className="py-2.5 px-3 whitespace-nowrap">
                                            <div className="flex items-center justify-center gap-0.5">
                                                {item.barcode && (
                                                    <button onClick={() => handleDownloadBarcode(item)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" title="Download QR">
                                                        <Download size={13} className="text-green-500" />
                                                    </button>
                                                )}
                                                <button onClick={() => { setEditingItem(item); setShowFormModal(true); }} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                                                    <Edit2 size={13} className="text-blue-500" />
                                                </button>
                                                <button onClick={() => handleDelete(item.id)} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
                                                    <Trash2 size={13} className="text-red-500" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                </table>
            </div>

            {filteredItems.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">
                    No items found. Create one to get started!
                </div>
            )}

            {/* Modals */}
            <StockItemFormModal
                isOpen={showFormModal}
                onClose={() => {
                    setShowFormModal(false);
                    setEditingItem(null);
                }}
                propertyId={propertyId}
                item={editingItem}
                onSuccess={handleFormSuccess}
                propertyCode={propertyCode}
            />

            <Suspense fallback={null}>
                <BarcodeScannerModal
                    isOpen={showScanModal}
                    onClose={() => setShowScanModal(false)}
                    onScanSuccess={handleScanSuccess}
                    title="Scan to Search"
                />
            </Suspense>

            {viewingItem && (
                <StockItemDetailsModal
                    isOpen={!!viewingItem}
                    onClose={() => setViewingItem(null)}
                    item={viewingItem}
                />
            )}

            <BulkImportModal
                isOpen={showBulkImport}
                onClose={() => setShowBulkImport(false)}
                propertyId={propertyId}
                onSuccess={() => {
                    fetchItems();
                    onRefresh?.();
                    setToast({ message: 'Items imported successfully', type: 'success' });
                }}
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

export default StockItemList;
