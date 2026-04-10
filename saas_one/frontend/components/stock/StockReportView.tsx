/**
 * StockReportView
 * Stock level reports and analytics view.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Package, AlertTriangle, ArrowUpCircle, ArrowDownCircle,
    TrendingUp, Loader2, BarChart3, Activity, ShieldAlert, Box,
    Calendar as CalendarIcon
} from 'lucide-react';
import { format, subDays, startOfDay, endOfDay, addDays, isSameDay } from 'date-fns';
import { createClient } from '@/frontend/utils/supabase/client';

interface StockReportViewProps {
    propertyId?: string;
    orgId?: string;
    propertyName?: string;
}

interface StockItem {
    id: string;
    name: string;
    item_code: string;
    quantity: number;
    min_threshold: number;
    category?: string;
    unit?: string;
    per_unit_cost?: number;
}

interface Movement {
    id: string;
    action: string;
    quantity_change: number;
    created_at: string;
    item_id: string;
    stock_items: { name: string; item_code: string; unit?: string }[];
    users: { full_name: string }[];
}

const StockReportView: React.FC<StockReportViewProps> = ({ propertyId, propertyName }) => {
    const [items, setItems] = useState<StockItem[]>([]);
    const [movements, setMovements] = useState<Movement[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'this_month' | 'all' | 'custom'>('30d');
    const [customStart, setCustomStart] = useState<string>(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
    const [customEnd, setCustomEnd] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
    const supabase = useMemo(() => createClient(), []);
    const [isExporting, setIsExporting] = useState(false);

    const fetchData = useCallback(async () => {
        if (!propertyId) return;
        setIsLoading(true);

        try {
            // Fetch items
            const { data: itemsData } = await supabase
                .from('stock_items')
                .select('id, name, item_code, quantity, min_threshold, category, unit, per_unit_cost')
                .eq('property_id', propertyId)
                .order('name');

            // Fetch movements with date filter
            let movementQuery = supabase
                .from('stock_movements')
                .select('id, action, quantity_change, created_at, item_id, stock_items:item_id(name, item_code, unit), users:user_id(full_name)')
                .eq('property_id', propertyId)
                .order('created_at', { ascending: false });

            // Only limit if it's 'all' or a very small subset without range
            if (dateRange === 'all') {
                movementQuery = movementQuery.limit(1000);
            }

            if (dateRange !== 'all') {
                let start: Date;
                let end: Date = endOfDay(new Date());

                if (dateRange === 'today') {
                    start = startOfDay(new Date());
                } else if (dateRange === '7d') {
                    start = startOfDay(subDays(new Date(), 6));
                } else if (dateRange === '30d') {
                    start = startOfDay(subDays(new Date(), 29));
                } else if (dateRange === 'this_month') {
                    const now = new Date();
                    start = new Date(now.getFullYear(), now.getMonth(), 1);
                    end = endOfDay(now);
                } else { // custom
                    start = startOfDay(new Date(customStart));
                    end = endOfDay(new Date(customEnd));
                }

                movementQuery = movementQuery
                    .gte('created_at', start.toISOString())
                    .lte('created_at', end.toISOString());
            }

            const { data: movementsData } = await movementQuery;

            setItems(itemsData || []);
            setMovements(movementsData || []);
        } catch (err) {
            console.error('Error fetching report data:', err);
        } finally {
            setIsLoading(false);
        }
    }, [propertyId, supabase, dateRange, customStart, customEnd]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

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

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const ExcelJS = await import('exceljs');
            const workbook = new ExcelJS.Workbook();

            let start: Date;
            let end: Date = endOfDay(new Date());

            if (dateRange === 'today') {
                start = startOfDay(new Date());
            } else if (dateRange === '7d') {
                start = startOfDay(subDays(new Date(), 6)); // 6 days ago + today = 7 days
            } else if (dateRange === '30d') {
                start = startOfDay(subDays(new Date(), 29)); // 29 days ago + today = 30 days
            } else if (dateRange === 'this_month') {
                const now = new Date();
                start = new Date(now.getFullYear(), now.getMonth(), 1);
                end = endOfDay(now);
            } else if (dateRange === 'custom') {
                start = startOfDay(new Date(customStart));
                end = endOfDay(new Date(customEnd));
            } else { // 'all'
                const earliestMovementDate = movements.length > 0
                    ? new Date(Math.min(...movements.map(m => new Date(m.created_at).getTime())))
                    : subDays(new Date(), 29);
                start = startOfDay(earliestMovementDate);
            }

            const categories = [
                'HK Material Equipment',
                'HK Chemical',
                'Mineral Water Expenses Sources',
                'Tea and Coffee Expenses',
                'Tissue Paper Expenses'
            ];

            // Helper: build a sheet from a given set of movements
            const buildSheet = (worksheet: InstanceType<typeof ExcelJS.Workbook>['worksheets'][0], sheetMovements: Movement[], isSummary = false) => {
                worksheet.columns = [
                    { width: 35 },
                    { width: 25 },
                    { width: 15 },
                    { width: 15 },
                    { width: 25 }
                ];

                categories.forEach(category => {
                    const groupItems = items.filter(item => (itemCategoryMap[item.name] || item.category) === category);
                    if (groupItems.length === 0) return;

                    let unitHeader = 'Unit Utilized';
                    let costHeader = 'Per Unit Cost';
                    let totalHeader = isSummary ? 'Total Cost for the Period' : 'Total Cost for the Day';

                    if (category === 'Mineral Water Expenses Sources') {
                        unitHeader = 'Bottle Utilized';
                        costHeader = 'Per bottle Cost';
                        totalHeader = isSummary ? 'Total Mineral Water Cost for the Period' : 'Total Mineral Water Cost for the Day';
                    } else if (category === 'HK Chemical') {
                        costHeader = 'Per Litre Cost';
                    }

                    const headerRow = worksheet.addRow([category, 'Average Monthly Consumption', unitHeader, costHeader, totalHeader]);
                    headerRow.eachCell((cell) => {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'DDEBF7' } };
                        cell.font = { bold: true };
                        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                    });

                    let groupTotal = 0;

                    groupItems.forEach(item => {
                        const itemMovements = sheetMovements.filter(m => m.item_id === item.id && m.action === 'remove');
                        const utilized = itemMovements.reduce((sum, m) => sum + Math.abs(m.quantity_change), 0);
                        const costPerUnit = item.per_unit_cost || 0;
                        const totalCost = utilized * costPerUnit;
                        groupTotal += totalCost;

                        const row = worksheet.addRow([item.name, '-', utilized || 0, costPerUnit, totalCost || 0]);
                        row.eachCell(cell => {
                            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                        });
                    });

                    const totalRowLabel = `Total ${category.replace(' Expenses Sources', '').replace(' Expenses', '')} Expenses`;
                    const totalRow = worksheet.addRow([totalRowLabel, '', '', '', groupTotal]);
                    worksheet.mergeCells(`A${totalRow.number}:D${totalRow.number}`);
                    totalRow.eachCell((cell) => {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF00' } };
                        cell.font = { bold: true };
                        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    });
                    const totalValueCell = totalRow.getCell(5);
                    totalValueCell.value = groupTotal;
                    totalValueCell.alignment = { horizontal: 'right' };

                    worksheet.addRow([]);
                });
            };

            // Add summary sheet as first sheet for multi-day ranges
            if (dateRange !== 'today') {
                let summarySheetName: string;
                if (dateRange === 'this_month') {
                    summarySheetName = format(start, 'MMM yyyy') + ' Summary';
                } else if (dateRange === '7d') {
                    summarySheetName = 'Weekly Summary';
                } else if (dateRange === '30d') {
                    summarySheetName = 'Monthly Summary';
                } else {
                    summarySheetName = 'Summary';
                }
                const summarySheet = workbook.addWorksheet(summarySheetName);
                buildSheet(summarySheet, movements, true);
            }

            // Loop through each day in the range and add per-day sheets
            let current = startOfDay(new Date(start));
            const last = endOfDay(new Date(end));

            while (current.getTime() <= last.getTime()) {
                const day = new Date(current);
                const sheetName = format(day, 'dd.MM.yyyy');
                const worksheet = workbook.addWorksheet(sheetName);

                const dayMovements = movements.filter(m => {
                    const mDate = new Date(m.created_at);
                    return format(mDate, 'dd.MM.yyyy') === format(day, 'dd.MM.yyyy');
                });

                buildSheet(worksheet, dayMovements, false);
                current = startOfDay(addDays(current, 1));
            }

            // Write and download
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            const filename = propertyName
                ? `${propertyName.replace(/\s+/g, '_')}_Stock_Report_${format(start, 'dd.MM.yyyy')}_to_${format(end, 'dd.MM.yyyy')}.xlsx`
                : `Stock_Report_${format(start, 'dd.MM.yyyy')}_to_${format(end, 'dd.MM.yyyy')}.xlsx`;
            anchor.download = filename;
            anchor.click();
            window.URL.revokeObjectURL(url);

        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setIsExporting(false);
        }
    };


    // ---- Computed analytics ----
    const totalItems = items.length;
    const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
    const lowStockItems = items.filter(i => i.quantity <= (i.min_threshold || 5));
    const outOfStockItems = items.filter(i => i.quantity === 0);

    const totalAdded = movements
        .filter(m => m.action === 'add')
        .reduce((sum, m) => sum + Math.abs(m.quantity_change), 0);

    const totalRemoved = movements
        .filter(m => m.action === 'remove')
        .reduce((sum, m) => sum + Math.abs(m.quantity_change), 0);

    const netChange = totalAdded - totalRemoved;

    // Category breakdown
    const categoryMap = useMemo(() => {
        const map: Record<string, { count: number; totalQty: number; lowStock: number }> = {};
        items.forEach(item => {
            const cat = item.category || 'Uncategorized';
            if (!map[cat]) map[cat] = { count: 0, totalQty: 0, lowStock: 0 };
            map[cat].count++;
            map[cat].totalQty += item.quantity;
            if (item.quantity <= (item.min_threshold || 5)) map[cat].lowStock++;
        });
        return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
    }, [items]);

    // Top movers (most frequently moved items)
    const topMovers = useMemo(() => {
        const map: Record<string, { name: string; code: string; unit: string; added: number; removed: number; total: number }> = {};
        movements.forEach(m => {
            const id = m.item_id;
            const stockItem = m.stock_items?.[0];
            const name = stockItem?.name || 'Unknown';
            const code = stockItem?.item_code || '';
            const unit = stockItem?.unit || 'units';
            if (!map[id]) map[id] = { name, code, unit, added: 0, removed: 0, total: 0 };
            const abs = Math.abs(m.quantity_change);
            if (m.action === 'add') map[id].added += abs;
            else if (m.action === 'remove') map[id].removed += abs;
            map[id].total += abs;
        });
        return Object.entries(map)
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 5);
    }, [movements]);

    // Daily movement activity (last 7 or 30 days)
    const dailyActivity = useMemo(() => {
        const map: Record<string, { added: number; removed: number }> = {};
        movements.forEach(m => {
            const day = new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            if (!map[day]) map[day] = { added: 0, removed: 0 };
            const abs = Math.abs(m.quantity_change);
            if (m.action === 'add') map[day].added += abs;
            else if (m.action === 'remove') map[day].removed += abs;
        });
        return Object.entries(map).reverse().slice(0, 14);
    }, [movements]);

    const maxDailyValue = useMemo(() => {
        return Math.max(1, ...dailyActivity.map(([, d]) => Math.max(d.added, d.removed)));
    }, [dailyActivity]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin text-blue-500" />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Date Range Filter — mobile-friendly stacked layout */}
            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2 shrink-0">
                        <BarChart3 size={18} className="text-blue-500" />
                        Stock Analytics
                    </h3>
                    <button
                        onClick={handleExport}
                        disabled={isExporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-xl text-xs font-bold transition-all shadow-sm shrink-0"
                    >
                        {isExporting ? <Loader2 size={13} className="animate-spin" /> : <ArrowDownCircle size={13} />}
                        Export
                    </button>
                </div>

                {/* Date pills — horizontally scrollable on mobile */}
                <div className="overflow-x-auto scrollbar-hide -mx-0">
                    <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-max">
                        {[
                            { id: 'today', label: 'Today' },
                            { id: '7d', label: '7 Days' },
                            { id: '30d', label: '30 Days' },
                            { id: 'this_month', label: 'Month' },
                            { id: 'all', label: 'All' },
                            { id: 'custom', label: 'Custom' }
                        ].map((range) => (
                            <button
                                key={range.id}
                                onClick={() => setDateRange(range.id as any)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${dateRange === range.id
                                    ? 'bg-white text-blue-600 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                            >
                                {range.label}
                            </button>
                        ))}
                    </div>
                </div>

                {dateRange === 'custom' && (
                    <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-xl">
                        <input
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="bg-transparent text-xs font-bold text-gray-700 focus:outline-none flex-1 min-w-0"
                        />
                        <span className="text-gray-400 text-[10px] font-bold shrink-0">TO</span>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="bg-transparent text-xs font-bold text-gray-700 focus:outline-none flex-1 min-w-0"
                        />
                    </div>
                )}
            </div>

            {/* Summary KPIs */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                            <Package size={16} className="text-blue-600" />
                        </div>
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Items</p>
                    <p className="text-2xl font-black text-gray-900">{totalItems}</p>
                    <p className="text-xs text-gray-400 mt-1">{totalUnits} total units</p>
                </div>

                <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                            <ArrowUpCircle size={16} className="text-emerald-600" />
                        </div>
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Added</p>
                    <p className="text-2xl font-black text-emerald-600">+{totalAdded}</p>
                    <p className="text-xs text-gray-400 mt-1">{movements.filter(m => m.action === 'add').length} movements</p>
                </div>

                <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                            <ArrowDownCircle size={16} className="text-red-600" />
                        </div>
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Removed</p>
                    <p className="text-2xl font-black text-red-600">−{totalRemoved}</p>
                    <p className="text-xs text-gray-400 mt-1">{movements.filter(m => m.action === 'remove').length} movements</p>
                </div>

                <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                            <TrendingUp size={16} className="text-violet-600" />
                        </div>
                    </div>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Net Change</p>
                    <p className={`text-2xl font-black ${netChange >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {netChange >= 0 ? '+' : ''}{netChange}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">{movements.length} total movements</p>
                </div>
            </div>

            {/* Movement Activity Chart (simple bar chart) */}
            {dailyActivity.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Activity size={16} className="text-blue-500" />
                        Daily Movement Activity
                    </h4>
                    <div className="flex items-end gap-1 h-32">
                        {dailyActivity.map(([day, data]) => (
                            <div key={day} className="flex-1 flex flex-col items-center gap-0.5" title={`${day}: +${data.added} / -${data.removed}`}>
                                {/* Added bar (green) */}
                                <div
                                    className="w-full bg-emerald-400 rounded-t-sm min-h-[2px] transition-all"
                                    style={{ height: `${Math.max(2, (data.added / maxDailyValue) * 100)}%` }}
                                />
                                {/* Removed bar (red) */}
                                <div
                                    className="w-full bg-red-400 rounded-b-sm min-h-[2px] transition-all"
                                    style={{ height: `${Math.max(2, (data.removed / maxDailyValue) * 100)}%` }}
                                />
                                <span className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">{day.split(' ')[1]}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex items-center justify-center gap-6 mt-3">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 bg-emerald-400 rounded-sm" />
                            <span className="text-xs text-gray-500">Added</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 bg-red-400 rounded-sm" />
                            <span className="text-xs text-gray-500">Removed</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Low Stock Alerts */}
                <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <ShieldAlert size={16} className="text-orange-500" />
                        Low Stock Alerts
                        {lowStockItems.length > 0 && (
                            <span className="ml-auto px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs font-bold">
                                {lowStockItems.length}
                            </span>
                        )}
                    </h4>
                    {lowStockItems.length === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                            <Package size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm font-medium">All items are well stocked</p>
                        </div>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {lowStockItems.map(item => (
                                <div key={item.id} className="flex items-center gap-3 p-2.5 bg-orange-50 border border-orange-100 rounded-lg">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${item.quantity === 0 ? 'bg-red-100' : 'bg-orange-100'}`}>
                                        <AlertTriangle size={14} className={item.quantity === 0 ? 'text-red-600' : 'text-orange-600'} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 text-sm truncate">{item.name}</p>
                                        <p className="text-xs text-gray-400">{item.item_code}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className={`text-sm font-bold ${item.quantity === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                                            {item.quantity === 0 ? 'OUT' : item.quantity}
                                        </span>
                                        <p className="text-[10px] text-gray-400">min: {item.min_threshold || 5}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Top Moving Items */}
                <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <TrendingUp size={16} className="text-blue-500" />
                        Most Active Items
                    </h4>
                    {topMovers.length === 0 ? (
                        <div className="text-center py-6 text-gray-400">
                            <Activity size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm font-medium">No movements in this period</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {topMovers.map(([id, data], index) => (
                                <div key={id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs font-black text-blue-600">#{index + 1}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-gray-900 text-sm truncate">{data.name}</p>
                                        <p className="text-xs text-gray-400">
                                            <span className="text-emerald-500">+{data.added}</span>
                                            {' / '}
                                            <span className="text-red-500">−{data.removed}</span>
                                            {' '}
                                            {data.unit}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-sm font-bold text-gray-900">{data.total}</span>
                                        <p className="text-[10px] text-gray-400">{data.unit} moved</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Category Breakdown */}
            {categoryMap.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                    <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <Box size={16} className="text-indigo-500" />
                        Category Breakdown
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {categoryMap.map(([category, data]) => (
                            <div key={category} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 text-sm truncate">{category}</p>
                                    <p className="text-xs text-gray-400">
                                        {data.count} items • {data.totalQty} total units
                                    </p>
                                </div>
                                {data.lowStock > 0 && (
                                    <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs font-bold flex-shrink-0">
                                        {data.lowStock} low
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Out of Stock Section */}
            {outOfStockItems.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-5">
                    <h4 className="text-sm font-bold text-red-800 mb-3 flex items-center gap-2">
                        <AlertTriangle size={16} className="text-red-600" />
                        Out of Stock ({outOfStockItems.length})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {outOfStockItems.map(item => (
                            <span key={item.id} className="px-3 py-1.5 bg-white border border-red-200 rounded-lg text-sm font-medium text-red-700">
                                {item.name}
                            </span>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StockReportView;
