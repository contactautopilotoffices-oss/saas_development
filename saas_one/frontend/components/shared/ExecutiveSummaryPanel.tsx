/**
 * ExecutiveSummaryPanel
 * High-level summary panel showing KPI tiles and charts for dashboard overview.
 * @remarks Client component.
 */

'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Download, ExternalLink, ChevronLeft, ChevronRight, Calendar, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

interface TicketData {
    id: string;
    category: string;
    status: string;
    created_at: string;
    resolved_at: string | null;
    internal: boolean;
}

interface MonthStats {
    label: string;       // "January 2026"
    shortLabel: string;  // "Jan"
    yearMonth: string;   // "2026-01"
    total: number;
    closed: number;
    open: number;
    pending: number;
    rate: number;
    topCategories: { name: string; count: number }[];
}

interface ExecutiveSummaryPanelProps {
    propertyId: string;
    idPrefix?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────
function toMonthInput(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fromMonthInput(s: string): Date {
    const [y, m] = s.split('-').map(Number);
    return new Date(y, m - 1, 1);
}
function monthsBetween(start: string, end: string): Date[] {
    const months: Date[] = [];
    const cur = fromMonthInput(start);
    const last = fromMonthInput(end);
    while (cur <= last) {
        months.push(new Date(cur));
        cur.setMonth(cur.getMonth() + 1);
    }
    return months;
}
function shortLabel(d: Date) {
    return d.toLocaleDateString('en-US', { month: 'short' });
}
function longLabel(d: Date) {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function rangeLabel(start: string, end: string) {
    const s = fromMonthInput(start);
    const e = fromMonthInput(end);
    if (s.getFullYear() === e.getFullYear()) {
        return `${shortLabel(s)}–${shortLabel(e)} ${e.getFullYear()}`;
    }
    return `${shortLabel(s)} ${s.getFullYear()}–${shortLabel(e)} ${e.getFullYear()}`;
}

export default function ExecutiveSummaryPanel({ propertyId, idPrefix = 'esp' }: ExecutiveSummaryPanelProps) {
    const router = useRouter();
    const supabase = createClient();
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dashboardData, setDashboardData] = useState<any>(null);
    const [rawTickets, setRawTickets] = useState<TicketData[]>([]);
    const [rawProperty, setRawProperty] = useState<any>(null);
    const reportRef = useRef<HTMLDivElement>(null);
    const pickerRef = useRef<HTMLDivElement>(null);
    const [showPicker, setShowPicker] = useState(false);
    const [includeInternal, setIncludeInternal] = useState(false);

    // Default: last 2 months
    const now = new Date();
    const [startMonth, setStartMonth] = useState(toMonthInput(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
    const [endMonth, setEndMonth] = useState(toMonthInput(new Date(now.getFullYear(), now.getMonth(), 1)));
    const [pendingStart, setPendingStart] = useState(startMonth);
    const [pendingEnd, setPendingEnd] = useState(endMonth);

    const label = rangeLabel(startMonth, endMonth);
    const monthCount = monthsBetween(startMonth, endMonth).length;

    // Close picker on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowPicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Fetch tickets once
    useEffect(() => {
        if (!propertyId) return;
        (async () => {
            setIsLoading(true);
            setError(null);
            try {
                const { data: tickets, error: ticketsError } = await supabase
                    .from('tickets')
                    .select('id, category, status, created_at, resolved_at, internal, issue_category:category_id(name)')
                    .eq('property_id', propertyId)
                    .order('created_at', { ascending: false });

                if (ticketsError) throw new Error(ticketsError.message);

                const { data: property } = await supabase
                    .from('properties')
                    .select('id, name, code')
                    .eq('id', propertyId)
                    .single();

                const normalised: TicketData[] = (tickets || []).map((t: any) => ({
                    id: t.id,
                    category: t.issue_category?.name || t.category || 'Other',
                    status: t.status,
                    created_at: t.created_at,
                    resolved_at: t.resolved_at ?? null,
                    internal: t.internal ?? false,
                }));

                setRawTickets(normalised);
                setRawProperty(property);
            } catch (err: any) {
                setError(err.message || 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        })();
    }, [propertyId]);

    // Re-process whenever tickets, range, or internal toggle changes
    useEffect(() => {
        if (!rawTickets.length || !rawProperty) return;
        const filtered = includeInternal ? rawTickets : rawTickets.filter(t => !t.internal);
        processData(filtered, rawProperty, startMonth, endMonth);
    }, [rawTickets, rawProperty, startMonth, endMonth, includeInternal]);

    const processData = (tickets: TicketData[], property: any, start: string, end: string) => {
        const allTimeTotal = tickets.length;
        const months = monthsBetween(start, end);

        const getMonthStats = (monthDate: Date): MonthStats => {
            const mt = tickets.filter(t => {
                const d = new Date(t.created_at);
                return d.getMonth() === monthDate.getMonth() && d.getFullYear() === monthDate.getFullYear();
            });
            const total = mt.length;
            const closed = mt.filter(t => t.status === 'resolved' || t.status === 'closed').length;
            const pending = mt.filter(t => t.status === 'pending_validation').length;
            const open = total - closed - pending;
            const rate = total > 0 ? (closed / total) * 100 : 0;
            const cats: Record<string, number> = {};
            mt.forEach(t => { const c = t.category || 'Other'; cats[c] = (cats[c] || 0) + 1; });
            const topCategories = Object.entries(cats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
            return { label: longLabel(monthDate), shortLabel: shortLabel(monthDate), yearMonth: toMonthInput(monthDate), total, closed, open, pending, rate, topCategories };
        };

        const monthsStats: MonthStats[] = months.map(getMonthStats);

        // Period aggregate
        const periodTotal = monthsStats.reduce((s, m) => s + m.total, 0);
        const periodClosed = monthsStats.reduce((s, m) => s + m.closed, 0);
        const periodOpen = monthsStats.reduce((s, m) => s + m.open, 0);
        const periodRate = periodTotal > 0 ? (periodClosed / periodTotal) * 100 : 0;
        const periodCats: Record<string, number> = {};
        tickets.filter(t => {
            const d = new Date(t.created_at);
            const ym = toMonthInput(d);
            return ym >= start && ym <= end;
        }).forEach(t => {
            const c = t.category || 'Other';
            periodCats[c] = (periodCats[c] || 0) + 1;
        });
        const periodTopCategories = Object.entries(periodCats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

        const latestStats = monthsStats[monthsStats.length - 1];
        const firstStats = monthsStats[0];

        // Sparkline: daily trend across the whole period
        const periodStart = fromMonthInput(start);
        const periodEnd = fromMonthInput(end);
        periodEnd.setMonth(periodEnd.getMonth() + 1); // exclusive
        const totalDays = Math.ceil((periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
        const getDailyTrend = (tickArr: TicketData[]) => {
            const trend = new Array(totalDays).fill(0);
            tickArr.forEach(t => {
                const d = new Date(t.created_at);
                const diff = Math.floor((d.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24));
                if (diff >= 0 && diff < totalDays) trend[diff]++;
            });
            return trend;
        };

        const periodTickets = tickets.filter(t => {
            const ym = toMonthInput(new Date(t.created_at));
            return ym >= start && ym <= end;
        });

        setDashboardData({
            property,
            allTimeTotal,
            monthsStats,
            periodTotal,
            periodClosed,
            periodOpen,
            periodRate,
            periodTopCategories,
            latestStats,
            firstStats,
            sparklines: {
                allTime: getDailyTrend(tickets),
                period: getDailyTrend(periodTickets),
                closed: getDailyTrend(periodTickets.filter(t => t.status === 'resolved' || t.status === 'closed')),
                open: getDailyTrend(periodTickets.filter(t => t.status !== 'resolved' && t.status !== 'closed' && t.status !== 'pending_validation')),
            }
        });
    };

    // Charts
    useEffect(() => {
        if (!dashboardData || isLoading) return;

        let chartInstances: any[] = [];
        let timeoutId: ReturnType<typeof setTimeout>;

        const initCharts = async () => {
            const ChartModule = await import('chart.js/auto');
            const Chart = ChartModule.default;
            const ChartDataLabels = (await import('chartjs-plugin-datalabels')).default;
            Chart.register(ChartDataLabels);

            const safeCanvas = (id: string): HTMLCanvasElement | null => {
                const el = document.getElementById(id) as HTMLCanvasElement | null;
                if (!el) return null;
                const existing = Chart.getChart(el);
                if (existing) existing.destroy();
                return el;
            };

            const { monthsStats } = dashboardData;
            const monthLabels = monthsStats.map((m: MonthStats) => m.shortLabel + (monthsStats.length > 6 ? ` '${String(fromMonthInput(m.yearMonth).getFullYear()).slice(2)}` : ''));

            // Volume chart
            const volCanvas = safeCanvas(`${idPrefix}-volumeChart`);
            if (volCanvas) {
                chartInstances.push(new Chart(volCanvas, {
                    type: 'bar',
                    data: {
                        labels: monthLabels,
                        datasets: [
                            { label: 'Total', data: monthsStats.map((m: MonthStats) => m.total), backgroundColor: '#475569', borderRadius: 2, barPercentage: 0.75, categoryPercentage: 0.7 },
                            { label: 'Closed', data: monthsStats.map((m: MonthStats) => m.closed), backgroundColor: '#22C55E', borderRadius: 2, barPercentage: 0.75, categoryPercentage: 0.7 },
                            { label: 'Open', data: monthsStats.map((m: MonthStats) => m.open + m.pending), backgroundColor: '#F97316', borderRadius: 2, barPercentage: 0.75, categoryPercentage: 0.7 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top', align: 'start', labels: { boxWidth: 10, font: { size: 10 } } },
                            title: { display: true, text: 'Monthly Ticket Volume', color: '#000', font: { size: 11, weight: 'bold' } },
                            datalabels: { anchor: 'end', align: 'top', formatter: (v: number) => v > 0 ? Math.round(v) : '', font: { weight: 'bold', size: monthsStats.length > 4 ? 7 : 9 }, color: '#000' }
                        },
                        scales: {
                            y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, title: { display: true, text: 'Tickets', font: { size: 10, weight: 'bold' }, color: '#000' } },
                            x: { grid: { display: false }, border: { display: false }, ticks: { font: { weight: 'bold', size: monthsStats.length > 6 ? 8 : 10 } } }
                        }
                    }
                }));
            }

            // Closure rate chart
            const closureCanvas = safeCanvas(`${idPrefix}-closureChart`);
            if (closureCanvas) {
                const barColors = monthsStats.map((m: MonthStats) => m.rate >= 95 ? '#22C55E' : m.rate >= 80 ? '#FACC15' : '#EF4444');
                chartInstances.push(new Chart(closureCanvas, {
                    type: 'bar',
                    data: {
                        labels: monthLabels,
                        datasets: [
                            { type: 'line', label: 'Target (95%)', data: monthsStats.map(() => 95), borderColor: '#EF4444', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, fill: false, datalabels: { display: false } } as any,
                            { type: 'bar', label: 'Closure Rate (%)', data: monthsStats.map((m: MonthStats) => +m.rate.toFixed(1)), backgroundColor: barColors, borderRadius: 2, barPercentage: 0.6 } as any,
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top', align: 'end', labels: { boxWidth: 20, font: { size: 10 }, filter: (item) => item.text.includes('Target') } },
                            title: { display: true, text: 'Closure Rate Performance', color: '#000', font: { size: 11, weight: 'bold' } },
                            datalabels: { anchor: 'end', align: 'top', formatter: (val: any, ctx: any) => ctx.dataset.type === 'line' ? '' : val + '%', font: { weight: 'bold', size: monthsStats.length > 4 ? 7 : 9 }, color: '#000' }
                        },
                        scales: {
                            y: { min: 0, max: 110, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { stepSize: 25 }, title: { display: true, text: 'Closure Rate (%)', font: { size: 10, weight: 'bold' }, color: '#000' } },
                            x: { grid: { display: false }, border: { display: false }, ticks: { font: { weight: 'bold', size: monthsStats.length > 6 ? 8 : 10 } } }
                        }
                    }
                }));
            }

            // Category charts
            const renderCategoryChart = (canvasId: string, title: string, data: any[]) => {
                const canvas = safeCanvas(canvasId);
                if (!canvas) return;
                const top7 = data.slice(0, 7).reverse();
                if (!top7.length) return;
                const colors = ['#3B82F6', '#1E3A8A', '#22C55E', '#EAB308', '#EF4444', '#8B5CF6', '#F97316'];
                chartInstances.push(new Chart(canvas, {
                    type: 'bar',
                    data: { labels: top7.map((d: any) => d.name), datasets: [{ data: top7.map((d: any) => d.count), backgroundColor: colors.slice(0, top7.length).reverse(), borderRadius: 1, barThickness: 6 }] },
                    options: {
                        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            title: { display: true, text: title, font: { size: 10, weight: 'bold' }, color: '#000' },
                            datalabels: { anchor: 'end', align: 'right', formatter: Math.round, font: { weight: 'bold', size: 9 }, color: '#000' }
                        },
                        scales: {
                            y: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 8, weight: 'bold' }, color: '#000' } },
                            x: { display: true, max: Math.max(...top7.map((d: any) => d.count)) * 1.25, title: { display: true, text: 'Tickets', font: { size: 9, weight: 'bold' }, color: '#000' }, grid: { color: '#f1f5f9' } }
                        },
                        layout: { padding: { right: 20 } }
                    }
                }));
            };

            renderCategoryChart(`${idPrefix}-periodCatChart`, `Top Categories · Full Period (${label})`, dashboardData.periodTopCategories);
            renderCategoryChart(`${idPrefix}-latestCatChart`, `Top Categories · ${dashboardData.latestStats?.label}`, dashboardData.latestStats?.topCategories || []);

            // Sparklines
            const renderSparkline = (canvasId: string, data: number[], color: string) => {
                const canvas = safeCanvas(canvasId);
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                const gradient = ctx.createLinearGradient(0, 0, 0, 40);
                gradient.addColorStop(0, color + '44');
                gradient.addColorStop(1, color + '00');
                chartInstances.push(new Chart(canvas, {
                    type: 'line',
                    data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: gradient, tension: 0.4 }] },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false }, tooltip: { enabled: false }, datalabels: { display: false } },
                        scales: { x: { display: false }, y: { display: false } },
                        layout: { padding: 0 }
                    }
                }));
            };

            renderSparkline(`${idPrefix}-sparkline1`, dashboardData.sparklines.allTime, '#1e3a8a');
            renderSparkline(`${idPrefix}-sparkline2`, dashboardData.sparklines.period, '#22c55e');
            renderSparkline(`${idPrefix}-sparkline3`, dashboardData.sparklines.closed, '#eab308');
            renderSparkline(`${idPrefix}-sparkline4`, dashboardData.sparklines.open, '#f97316');
        };

        timeoutId = setTimeout(() => initCharts(), 100);
        return () => { clearTimeout(timeoutId); chartInstances.forEach(c => c.destroy()); };
    }, [dashboardData, isLoading, idPrefix, label]);

    // Shift range by N months
    const shiftRange = (delta: number) => {
        const s = fromMonthInput(startMonth);
        const e = fromMonthInput(endMonth);
        s.setMonth(s.getMonth() + delta);
        e.setMonth(e.getMonth() + delta);
        const ns = toMonthInput(s);
        const ne = toMonthInput(e);
        setStartMonth(ns); setEndMonth(ne);
        setPendingStart(ns); setPendingEnd(ne);
    };

    const applyCustom = () => {
        setStartMonth(pendingStart);
        setEndMonth(pendingEnd);
        setShowPicker(false);
    };

    const applyPreset = (offsetStart: number, offsetEnd: number) => {
        const s = new Date(now.getFullYear(), now.getMonth() + offsetStart, 1);
        const e = new Date(now.getFullYear(), now.getMonth() + offsetEnd, 1);
        const ns = toMonthInput(s);
        const ne = toMonthInput(e);
        setStartMonth(ns); setEndMonth(ne);
        setPendingStart(ns); setPendingEnd(ne);
        setShowPicker(false);
    };

    const presets = [
        { label: 'Last 1 month', s: -1, e: -1 },
        { label: 'Last 2 months', s: -2, e: -1 },
        { label: 'Last 3 months', s: -3, e: -1 },
        { label: 'Last 6 months', s: -6, e: -1 },
        { label: 'Last 12 months', s: -12, e: -1 },
        { label: 'This month', s: 0, e: 0 },
    ];

    const handleDownloadHD = async () => {
        if (!reportRef.current || !dashboardData) return;
        setIsExporting(true);
        const originalScrollY = window.scrollY;
        
        try {
            // Immediate feedback: slight delay to allow UI to show loading state if needed
            await new Promise(resolve => setTimeout(resolve, 50));
            
            window.scrollTo(0, 0);
            const element = reportRef.current;
            
            // Temporary styles for capture
            const originalBorder = element.style.border;
            const originalShadow = element.style.boxShadow;
            const originalWidth = element.style.width;
            
            element.style.border = 'none';
            element.style.boxShadow = 'none';
            element.style.width = '1120px';
            
            const canvas = await html2canvas(element, {
                scale: 1.5, // Reduced from 2.0 to 1.5 for much faster processing while keeping HD quality
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                windowWidth: 1200
            });
            
            // Restore styles immediately after capture
            element.style.border = originalBorder;
            element.style.boxShadow = originalShadow;
            element.style.width = originalWidth;
            
            const imgData = canvas.toDataURL('image/png', 0.8); // 0.8 quality for faster encoding
            
            const pdf = new jsPDF({
                orientation: 'landscape',
                unit: 'px',
                format: 'a4'
            });
            
            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 5;
            const maxW = pageWidth - (margin * 2);
            const maxH = pageHeight - (margin * 2);
            
            let imgWidth = maxW;
            let imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            if (imgHeight > maxH) {
                imgHeight = maxH;
                imgWidth = (canvas.width * imgHeight) / canvas.height;
            }
            
            const x = (pageWidth - imgWidth) / 2;
            const y = (pageHeight - imgHeight) / 2;
            
            pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight, undefined, 'FAST');
            pdf.save(`Executive_Impact_${dashboardData.property?.name || 'Report'}_${label.replace(/ /g, '_')}.pdf`);
            
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            window.scrollTo(0, originalScrollY);
            setIsExporting(false);
        }
    };

    if (isLoading) return (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-border">
            <Loader2 className="w-10 h-10 text-[#4f46e5] animate-spin mb-4" />
            <p className="text-slate-500 font-medium">Generating Executive Summary...</p>
        </div>
    );

    if (error || !dashboardData) return (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-border">
            <div className="bg-red-50 text-red-600 p-6 rounded-2xl border border-red-200 max-w-md text-center">
                <h2 className="text-lg font-bold mb-2">Could not load dashboard</h2>
                <p className="text-sm">{error || 'No data available'}</p>
            </div>
        </div>
    );

    const { property, allTimeTotal, monthsStats, periodTotal, periodClosed, periodOpen, periodRate, periodTopCategories, latestStats, firstStats } = dashboardData;
    const bestMonth = [...monthsStats].sort((a: MonthStats, b: MonthStats) => b.rate - a.rate)[0] as MonthStats;
    const topPeriodCat = periodTopCategories[0] || { name: 'N/A', count: 0 };
    const periodRateStr = periodRate.toFixed(1) + '%';
    const volChange = firstStats.total > 0 ? ((latestStats.total - firstStats.total) / firstStats.total) * 100 : 0;

    return (
        <div className="space-y-3">
            {/* Action bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="relative" ref={pickerRef}>
                    <div className="flex items-center gap-1">
                        <button onClick={() => shiftRange(-1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors" title="Previous period">
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button onClick={() => setShowPicker(v => !v)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            {label}
                            <span className="ml-1 bg-slate-300 text-slate-600 text-[9px] font-bold px-1.5 py-0.5 rounded-full">{monthCount}m</span>
                        </button>
                        <button onClick={() => shiftRange(1)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors" title="Next period">
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {showPicker && (
                        <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-72">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Select Period</span>
                                <button onClick={() => setShowPicker(false)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                            </div>

                            {/* Presets */}
                            <div className="grid grid-cols-2 gap-1 mb-3">
                                {presets.map(p => {
                                    const ps = toMonthInput(new Date(now.getFullYear(), now.getMonth() + p.s, 1));
                                    const pe = toMonthInput(new Date(now.getFullYear(), now.getMonth() + p.e, 1));
                                    const active = startMonth === ps && endMonth === pe;
                                    return (
                                        <button key={p.label} onClick={() => applyPreset(p.s, p.e)}
                                            className={`text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${active ? 'bg-[#1e3a8a] text-white' : 'hover:bg-slate-100 text-slate-600'}`}>
                                            {p.label}
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Custom pickers */}
                            <div className="border-t border-slate-100 pt-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Custom Range</p>
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">From</label>
                                        <input type="month" value={pendingStart} max={pendingEnd}
                                            onChange={e => setPendingStart(e.target.value)}
                                            className="w-full px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:border-[#1e3a8a] focus:outline-none" />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">To</label>
                                        <input type="month" value={pendingEnd} min={pendingStart}
                                            onChange={e => setPendingEnd(e.target.value)}
                                            className="w-full px-2 py-1.5 text-[11px] border border-slate-200 rounded-lg focus:border-[#1e3a8a] focus:outline-none" />
                                    </div>
                                </div>
                                {pendingStart && pendingEnd && (
                                    <p className="text-[10px] text-slate-400 mb-2 text-center">
                                        {monthsBetween(pendingStart, pendingEnd).length} month{monthsBetween(pendingStart, pendingEnd).length !== 1 ? 's' : ''} selected
                                    </p>
                                )}
                                <button onClick={applyCustom} className="w-full py-2 bg-[#1e3a8a] hover:bg-[#1e3a8a]/90 text-white text-[11px] font-bold rounded-lg transition-colors">
                                    Apply
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Internal tickets toggle */}
                    <button
                        onClick={() => setIncludeInternal(v => !v)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${includeInternal ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-slate-100 border-slate-200 text-slate-500'}`}
                        title={includeInternal ? 'Excluding internal tickets — click to include' : 'Click to include internal tickets'}
                    >
                        <span className={`w-7 h-4 rounded-full relative transition-colors flex-shrink-0 ${includeInternal ? 'bg-amber-400' : 'bg-slate-300'}`}>
                            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all ${includeInternal ? 'left-3.5' : 'left-0.5'}`} />
                        </span>
                        Internal tickets
                        {includeInternal && (
                            <span className="bg-amber-200 text-amber-800 text-[9px] font-bold px-1.5 py-0.5 rounded-full">ON</span>
                        )}
                    </button>

                    <button onClick={handleDownloadHD} disabled={isExporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4f46e5] text-white text-xs font-bold rounded-lg hover:bg-[#4338ca] disabled:opacity-50 transition-colors">
                        {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        Download PDF
                    </button>
                    <button onClick={() => router.push(`/property/${propertyId}/reports/executive-summary`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors">
                        <ExternalLink className="w-3 h-3" />
                        Full View
                    </button>
                </div>
            </div>

            {/* Dashboard */}
            <div ref={reportRef} className="w-full bg-white border border-[#e2e8f0] shadow-sm p-6 overflow-hidden rounded-xl">
                {/* Header */}
                <div className="flex items-center justify-between pb-6 mb-6 border-b border-[#e2e8f0]">
                    <img src="/autopilot-logo-new.png" className="h-[45px] object-contain transition-all" alt="Logo" />
                    <div className="text-center flex-1">
                        <h1 className="text-[20px] font-black text-[#1e3a8a] tracking-tight leading-tight">FMS Executive Impact Dashboard</h1>
                        <p className="text-[12px] font-bold text-[#64748b] mt-0.5 tracking-wide uppercase">{property?.name || ''} · Facility Management Performance</p>
                    </div>
                    <div className="bg-[#1e3a8a] text-white px-4 py-1.5 rounded-lg text-[11px] font-black shadow-md whitespace-nowrap tracking-wider">{label}</div>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    {/* All-time total */}
                    <div className="relative bg-[#F8FAFC] border-t-[3px] border-[#1e3a8a] py-3 px-4 shadow-sm border-x border-b border-[#e2e8f0] overflow-hidden flex justify-between">
                        <div className="relative z-10">
                            <p className="text-[10px] uppercase tracking-wider text-[#64748b] font-bold mb-1">TOTAL TICKETS MANAGED</p>
                            <h2 className="text-[28px] leading-none font-bold text-[#1e3a8a] mb-1">{allTimeTotal}</h2>
                            <p className="text-[9px] text-[#94a3b8] font-medium">All time · {label} shown below</p>
                        </div>
                        <div className="absolute right-0 bottom-0 w-[45%] h-[40%] opacity-40"><canvas id={`${idPrefix}-sparkline1`}></canvas></div>
                    </div>
                    {/* Period total */}
                    <div className="relative bg-[#F8FAFC] border-t-[3px] border-[#22c55e] py-3 px-4 shadow-sm border-x border-b border-[#e2e8f0] overflow-hidden flex justify-between">
                        <div className="relative z-10">
                            <p className="text-[10px] uppercase tracking-wider text-[#64748b] font-bold mb-1">PERIOD TICKETS</p>
                            <h2 className="text-[28px] leading-none font-bold text-[#22c55e] mb-1">{periodTotal}</h2>
                            <p className="text-[9px] text-[#94a3b8] font-medium">{periodClosed} closed · {periodOpen} open</p>
                        </div>
                        <div className="absolute right-0 bottom-0 w-[45%] h-[40%] opacity-40"><canvas id={`${idPrefix}-sparkline2`}></canvas></div>
                    </div>
                    {/* Period closure rate */}
                    <div className={`relative bg-[#F8FAFC] border-t-[3px] ${periodRate >= 95 ? 'border-[#22c55e]' : 'border-[#eab308]'} py-3 px-4 shadow-sm border-x border-b border-[#e2e8f0] overflow-hidden flex justify-between`}>
                        <div className="relative z-10">
                            <p className="text-[10px] uppercase tracking-wider text-[#64748b] font-bold mb-1">PERIOD CLOSURE RATE</p>
                            <h2 className={`text-[28px] leading-none font-bold mb-1 ${periodRate >= 95 ? 'text-[#22c55e]' : 'text-[#1e3a8a]'}`}>{periodRateStr}</h2>
                            <p className="text-[9px] text-[#94a3b8] font-medium">Best: {bestMonth?.shortLabel} {bestMonth?.rate.toFixed(1)}%</p>
                        </div>
                        <div className="absolute right-0 bottom-0 w-[45%] h-[40%] opacity-40"><canvas id={`${idPrefix}-sparkline3`}></canvas></div>
                    </div>
                    {/* Open tickets latest month */}
                    <div className="relative bg-[#F8FAFC] border-t-[3px] border-[#f97316] py-3 px-4 shadow-sm border-x border-b border-[#e2e8f0] overflow-hidden flex justify-between">
                        <div className="relative z-10">
                            <p className="text-[10px] uppercase tracking-wider text-[#64748b] font-bold mb-1">OPEN TICKETS ({latestStats?.shortLabel?.toUpperCase()})</p>
                            <h2 className="text-[28px] leading-none font-bold text-[#1e3a8a] mb-1">{latestStats?.open ?? 0}</h2>
                            <p className="text-[9px] text-[#94a3b8] font-medium">Requires immediate attention</p>
                        </div>
                        <div className="absolute right-0 bottom-0 w-[45%] h-[40%] opacity-40"><canvas id={`${idPrefix}-sparkline4`}></canvas></div>
                    </div>
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                    <div className="bg-white border border-[#e2e8f0] rounded-sm shadow-sm overflow-hidden flex flex-col" style={{ height: '240px' }}>
                        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 text-[#1e3a8a] text-[12px] font-bold">Monthly Ticket Volume</div>
                        <div className="p-3 flex-1 relative"><canvas id={`${idPrefix}-volumeChart`}></canvas></div>
                    </div>
                    <div className="bg-white border border-[#e2e8f0] rounded-sm shadow-sm overflow-hidden flex flex-col" style={{ height: '240px' }}>
                        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 text-[#1e3a8a] text-[12px] font-bold">Closure Rate Performance</div>
                        <div className="p-3 flex-1 relative"><canvas id={`${idPrefix}-closureChart`}></canvas></div>
                    </div>
                </div>

                {/* Categories + Insights */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                    <div className="bg-white border border-[#e2e8f0] rounded-sm shadow-sm overflow-hidden flex flex-col" style={{ height: '210px' }}>
                        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 text-[#1e3a8a] text-[12px] font-bold">Top Categories · Full Period</div>
                        <div className="p-2 flex-1 relative"><canvas id={`${idPrefix}-periodCatChart`}></canvas></div>
                    </div>
                    <div className="bg-white border border-[#e2e8f0] rounded-sm shadow-sm overflow-hidden flex flex-col" style={{ height: '210px' }}>
                        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 text-[#1e3a8a] text-[12px] font-bold">Top Categories · {latestStats?.shortLabel}</div>
                        <div className="p-2 flex-1 relative"><canvas id={`${idPrefix}-latestCatChart`}></canvas></div>
                    </div>
                    <div className="bg-white border border-[#e2e8f0] rounded-sm shadow-sm overflow-hidden flex flex-col" style={{ height: '210px' }}>
                        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 text-[#1e3a8a] text-[12px] font-bold">Key Accountability Insights</div>
                        <div className="p-4 flex-1 overflow-auto">
                            <ul className="space-y-2 text-[11px] text-[#475569]">
                                <li className="flex gap-2 items-start leading-[1.3]">
                                    <span className="w-[5px] h-[5px] rounded-full bg-[#22c55e] mt-1 flex-shrink-0"></span>
                                    <div>Period closure rate: <span className="font-bold text-[#1e3a8a]">{periodRateStr}</span> across {monthCount} month{monthCount !== 1 ? 's' : ''}</div>
                                </li>
                                <li className="flex gap-2 items-start leading-[1.3]">
                                    <span className="w-[5px] h-[5px] rounded-full bg-[#1e3a8a] mt-1 flex-shrink-0"></span>
                                    <div>Best month: <span className="font-bold text-[#1e3a8a]">{bestMonth?.shortLabel} ({bestMonth?.rate.toFixed(1)}%)</span></div>
                                </li>
                                {monthsStats.filter((m: MonthStats) => m.rate < 95).length > 0 && (
                                    <li className="flex gap-2 items-start leading-[1.3]">
                                        <span className="w-[5px] h-[5px] rounded-full bg-[#eab308] mt-1 flex-shrink-0"></span>
                                        <div><span className="font-bold text-[#d97706]">{monthsStats.filter((m: MonthStats) => m.rate < 95).map((m: MonthStats) => m.shortLabel).join(', ')}</span> below 95% target</div>
                                    </li>
                                )}
                                <li className="flex gap-2 items-start leading-[1.3]">
                                    <span className="w-[5px] h-[5px] rounded-full bg-[#ef4444] mt-1 flex-shrink-0"></span>
                                    <div><span className="font-bold text-[#ef4444]">{latestStats?.open} open tickets</span> in {latestStats?.shortLabel} need resolution</div>
                                </li>
                                <li className="flex gap-2 items-start leading-[1.3]">
                                    <span className="w-[5px] h-[5px] rounded-full bg-[#3b82f6] mt-1 flex-shrink-0"></span>
                                    <div><span className="font-bold text-[#1e3a8a]">{topPeriodCat.name}</span> top category ({topPeriodCat.count} tickets in period)</div>
                                </li>
                                {monthCount >= 2 && (
                                    <li className="flex gap-2 items-start leading-[1.3]">
                                        <span className="w-[5px] h-[5px] rounded-full bg-[#22c55e] mt-1 flex-shrink-0"></span>
                                        <div>{latestStats?.shortLabel} vs {firstStats?.shortLabel}: <span className="font-bold text-[#1e3a8a]">{volChange > 0 ? '+' : ''}{volChange.toFixed(0)}% volume change</span></div>
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Summary Table — one row per month */}
                <div>
                    <h3 className="text-[12px] font-bold text-[#1e3a8a] mb-2 px-1">Monthly Performance Summary · {label}</h3>
                    <div className="border border-[#1e3a8a] overflow-hidden rounded-sm overflow-x-auto">
                        <table className="w-full text-[11px] text-left">
                            <thead className="bg-[#1e3a8a] text-white">
                                <tr>
                                    {['Month', 'Total', 'Closed', 'Open/WIP', 'Pending', 'Closure Rate', 'Top Category', 'Status'].map(h => (
                                        <th key={h} className="py-2 px-3 font-bold border-r border-[#2C4A9E] last:border-r-0 whitespace-nowrap">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {monthsStats.map((row: MonthStats, idx: number) => (
                                    <tr key={row.yearMonth} className={idx < monthsStats.length - 1 ? 'border-b border-[#e2e8f0]' : ''}>
                                        <td className="py-2.5 px-3 font-bold text-[#334155] whitespace-nowrap">{row.label}</td>
                                        <td className="py-2.5 px-3 text-[#64748b]">{row.total}</td>
                                        <td className="py-2.5 px-3 text-[#64748b]">{row.closed}</td>
                                        <td className="py-2.5 px-3 text-[#64748b]">{row.open}</td>
                                        <td className="py-2.5 px-3 text-[#64748b]">{row.pending}</td>
                                        <td className="py-2.5 px-3 font-bold text-[#334155]">{row.rate.toFixed(1)}%</td>
                                        <td className="py-2.5 px-3 text-[#64748b] max-w-[160px] truncate">{row.topCategories[0] ? `${row.topCategories[0].name} (${row.topCategories[0].count})` : '—'}</td>
                                        <td className="py-2.5 px-3">
                                            {row.rate >= 95
                                                ? <span className="text-[#16a34a] font-bold">Excellent</span>
                                                : row.rate >= 80
                                                    ? <span className="text-[#d97706] font-bold bg-[#fef3c7] px-1.5 py-0.5 rounded">Needs Attention</span>
                                                    : <span className="text-[#dc2626] font-bold bg-[#fee2e2] px-1.5 py-0.5 rounded">Critical</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
                                {/* Period total row */}
                                <tr className="bg-[#f8fafc] border-t-2 border-[#1e3a8a]">
                                    <td className="py-2.5 px-3 font-bold text-[#1e3a8a]">TOTAL</td>
                                    <td className="py-2.5 px-3 font-bold text-[#1e3a8a]">{periodTotal}</td>
                                    <td className="py-2.5 px-3 font-bold text-[#1e3a8a]">{periodClosed}</td>
                                    <td className="py-2.5 px-3 font-bold text-[#1e3a8a]">{periodOpen}</td>
                                    <td className="py-2.5 px-3 font-bold text-[#1e3a8a]">{monthsStats.reduce((s: number, m: MonthStats) => s + m.pending, 0)}</td>
                                    <td className="py-2.5 px-3 font-bold text-[#1e3a8a]">{periodRate.toFixed(1)}%</td>
                                    <td className="py-2.5 px-3 font-bold text-[#1e3a8a]">{topPeriodCat.name}</td>
                                    <td className="py-2.5 px-3">
                                        {periodRate >= 95
                                            ? <span className="text-[#16a34a] font-bold">Excellent</span>
                                            : <span className="text-[#d97706] font-bold bg-[#fef3c7] px-1.5 py-0.5 rounded">Needs Attention</span>}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-between items-center text-[9px] text-[#94a3b8] mt-4 px-1">
                    <div className="font-bold text-[#1e3a8a]">FMS Impact Report · {property?.name || ''}</div>
                    <div>Generated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · Ticket Management System</div>
                </div>
            </div>
        </div>
    );
}
