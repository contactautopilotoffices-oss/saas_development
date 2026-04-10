/**
 * StockItemDetailsModal
 * Modal showing full details of a stock item with movement history.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { X } from 'lucide-react';
import BarcodeDisplay from './BarcodeDisplay';

interface StockItem {
    id: string;
    name: string;
    item_code: string;
    category?: string;
    unit?: string;
    quantity: number;
    min_threshold?: number;
    location?: string;
    description?: string;
    barcode?: string;
    barcode_format?: string;
    qr_code_data?: Record<string, any>;
    created_at?: string;
    updated_at?: string;
}

interface StockItemDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    item: StockItem;
}

export default function StockItemDetailsModal({
    isOpen,
    onClose,
    item
}: StockItemDetailsModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            {/* Modal Container */}
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-border-primary bg-gradient-to-r from-accent-primary/10 to-transparent">
                    <h2 className="text-2xl font-bold text-text-primary">{item.name}</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-bg-secondary rounded-lg transition-colors"
                    >
                        <X size={24} className="text-text-secondary" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Item Details Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-bg-secondary rounded-lg p-4">
                            <p className="text-xs font-semibold text-text-secondary uppercase mb-1">
                                Item Code
                            </p>
                            <p className="text-lg font-mono font-semibold text-text-primary break-all">
                                {item.item_code}
                            </p>
                        </div>

                        <div className="bg-bg-secondary rounded-lg p-4">
                            <p className="text-xs font-semibold text-text-secondary uppercase mb-1">
                                Quantity
                            </p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-lg font-bold text-text-primary">
                                    {item.quantity}
                                </p>
                                <p className="text-sm text-text-secondary">{item.unit || 'units'}</p>
                            </div>
                        </div>

                        {item.category && (
                            <div className="bg-bg-secondary rounded-lg p-4">
                                <p className="text-xs font-semibold text-text-secondary uppercase mb-1">
                                    Category
                                </p>
                                <p className="text-sm font-medium text-text-primary">{item.category}</p>
                            </div>
                        )}

                        {item.location && (
                            <div className="bg-bg-secondary rounded-lg p-4">
                                <p className="text-xs font-semibold text-text-secondary uppercase mb-1">
                                    Location
                                </p>
                                <p className="text-sm font-medium text-text-primary">{item.location}</p>
                            </div>
                        )}

                        {item.min_threshold && (
                            <div className="bg-bg-secondary rounded-lg p-4">
                                <p className="text-xs font-semibold text-text-secondary uppercase mb-1">
                                    Min Threshold
                                </p>
                                <p className="text-sm font-medium text-text-primary">{item.min_threshold}</p>
                            </div>
                        )}

                        <div className="bg-bg-secondary rounded-lg p-4">
                            <p className="text-xs font-semibold text-text-secondary uppercase mb-1">
                                Status
                            </p>
                            <div className="flex items-center gap-2">
                                {item.quantity <= (item.min_threshold || 0) ? (
                                    <>
                                        <span className="inline-block w-2 h-2 rounded-full bg-red-500"></span>
                                        <p className="text-sm font-medium text-red-600">Low Stock</p>
                                    </>
                                ) : (
                                    <>
                                        <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                                        <p className="text-sm font-medium text-green-600">In Stock</p>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    {item.description && (
                        <div>
                            <h3 className="font-semibold text-text-primary mb-2">Description</h3>
                            <p className="text-sm text-text-secondary bg-bg-secondary rounded-lg p-4">
                                {item.description}
                            </p>
                        </div>
                    )}

                    {/* Barcode Display */}
                    {item.barcode && (
                        <div>
                            <h3 className="font-semibold text-text-primary mb-4">QR Code</h3>
                            <BarcodeDisplay
                                value={item.barcode}
                                itemName={item.name}
                                itemCode={item.item_code}
                                format="both"
                                showValue={true}
                            />
                        </div>
                    )}

                    {/* Metadata */}
                    <div className="border-t border-border-primary pt-4 mt-4">
                        <div className="grid grid-cols-2 gap-4 text-xs text-text-secondary">
                            {item.created_at && (
                                <div>
                                    <p className="font-semibold mb-1">Created</p>
                                    <p>{new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString()}</p>
                                </div>
                            )}
                            {item.updated_at && (
                                <div>
                                    <p className="font-semibold mb-1">Updated</p>
                                    <p>{new Date(item.updated_at).toLocaleDateString()} {new Date(item.updated_at).toLocaleTimeString()}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="border-t border-border-primary p-6 bg-bg-secondary flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-accent-primary text-white rounded-lg font-semibold hover:bg-accent-primary/90 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
