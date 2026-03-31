'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Download, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';

interface TicketData {
    id: string;
    category: string;
    status: string;
    created_at: string;
    resolved_at: string | null;
}

interface ExecutiveSummaryPanelProps {
    propertyId: string;
    /** unique prefix to avoid canvas ID collisions if multiple instances exist on one page */
    idPrefix?: string;
}

function formatMonthYear(date: Date) {
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function formatShortMonth(date: Date) {
    return date.toLocaleDateString('en-US', { month: 'short' });
}

export default function ExecutiveSummaryPanel({ propertyId, idPrefix = 'esp' }: ExecutiveSummaryPanelProps) {
    const router = useRouter();
    const supabase = createClient();
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dashboardData, setDashboardData] = useState<any>(null);
    const reportRef = useRef<HTMLDivElement>(null);

    const currentDate = new Date();
    const currentMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const previousMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);

    const prevMonthLabel = formatMonthYear(previousMonthDate);
    const currMonthLabel = formatMonthYear(currentMonthDate);
    const shortPrevMonth = formatShortMonth(previousMonthDate);
    const shortCurrMonth = formatShortMonth(currentMonthDate);

    useEffect(() => {
        if (!propertyId) return;
        const loadData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // Fetch ALL tickets for the property — no date filter so totals are always accurate
                const { data: tickets, error: ticketsError } = await supabase
                    .from('tickets')
                    .select('id, category, status, created_at, resolved_at, issue_category:category_id(name)')
                    .eq('property_id', propertyId)
                    .eq('internal', false)
                    .order('created_at', { ascending: false });

                if (ticketsError) throw new Error(ticketsError.message);

                // Fetch property name
                const { data: property } = await supabase
                    .from('properties')
                    .select('id, name, code')
                    .eq('id', propertyId)
                    .single();

                // Normalise to TicketData shape expected by processData
                const normalised: TicketData[] = (tickets || []).map((t: any) => ({
                    id: t.id,
                    category: t.issue_category?.name || t.category || 'Other',
                    status: t.status,
                    created_at: t.created_at,
                    resolved_at: t.resolved_at ?? null,
                }));

                processData(normalised, property);
            } catch (err: any) {
                setError(err.message || 'An error occurred loading the dashboard');
            } finally {
                setIsLoading(false);
            }
        };
        loadData();
    }, [propertyId]);

    const processData = (tickets: TicketData[], property: any) => {
        // All-time totals (no date filter — full DB count)
        const allTimeTotal = tickets.length;

        // Filter to prev/curr month using created_at
        const prevTickets = tickets.filter(t => {
            const d = new Date(t.created_at);
            return d.getMonth() === previousMonthDate.getMonth() && d.getFullYear() === previousMonthDate.getFullYear();
        });
        const currTickets = tickets.filter(t => {
            const d = new Date(t.created_at);
            return d.getMonth() === currentMonthDate.getMonth() && d.getFullYear() === currentMonthDate.getFullYear();
        });

        const getStats = (tickArr: TicketData[]) => {
            const total = tickArr.length;
            const closed = tickArr.filter(t => t.status === 'resolved' || t.status === 'closed').length;
            const pendingValidation = tickArr.filter(t => t.status === 'pending_validation').length;
            const open = total - closed - pendingValidation;
            const rate = total > 0 ? (closed / total) * 100 : 0;
            const cats: Record<string, number> = {};
            tickArr.forEach(t => { const c = t.category || 'Other'; cats[c] = (cats[c] || 0) + 1; });
            const topCategories = Object.entries(cats).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
            return { total, closed, open, pendingValidation, rate, topCategories };
        };

        const getDailyTrend = (tickArr: TicketData[], startDate: Date, days: number) => {
            const trend = new Array(days).fill(0);
            tickArr.forEach(t => {
                const d = new Date(t.created_at);
                const diff = Math.floor((d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
                if (diff >= 0 && diff < days) trend[diff]++;
            });
            return trend;
        };

        const prevStats = getStats(prevTickets);
        const currStats = getStats(currTickets);
        const allDailyTrend = getDailyTrend(tickets, previousMonthDate, 60);
        const currDailyTrend = getDailyTrend(currTickets, currentMonthDate, 30);
        const prevDailyTrend = getDailyTrend(prevTickets, previousMonthDate, 30);

        setDashboardData({
            property,
            prevStats,
            currStats,
            allTimeTotal,   // true total — all tickets ever for this property
            trends: {
                total: allDailyTrend,
                prevRate: prevDailyTrend,
                currRate: currDailyTrend,
                open: currDailyTrend,
            }
        });
    };

    useEffect(() => {
        if (!dashboardData || isLoading) return;

        let chartInstances: any[] = [];
        let timeoutId: ReturnType<typeof setTimeout>;

        const initCharts = async () => {
            const ChartModule = await import('chart.js/auto');
            const Chart = ChartModule.default;
            const ChartDataLabels = (await import('chartjs-plugin-datalabels')).default;
            Chart.register(ChartDataLabels);

            // Helper: destroy any existing Chart.js instance on a canvas before creating a new one
            const safeCanvas = (id: string): HTMLCanvasElement | null => {
                const el = document.getElementById(id) as HTMLCanvasElement | null;
                if (!el) return null;
                const existing = Chart.getChart(el);
                if (existing) existing.destroy();
                return el;
            };

            const volCanvas = safeCanvas(`${idPrefix}-volumeChart`);
            if (volCanvas) {
                chartInstances.push(new Chart(volCanvas, {
                    type: 'bar',
                    data: {
                        labels: [prevMonthLabel, currMonthLabel],
                        datasets: [
                            { label: 'Total', data: [dashboardData.prevStats.total, dashboardData.currStats.total], backgroundColor: '#475569', borderRadius: 1, barPercentage: 0.8, categoryPercentage: 0.7 },
                            { label: 'Closed', data: [dashboardData.prevStats.closed, dashboardData.currStats.closed], backgroundColor: '#22C55E', borderRadius: 1, barPercentage: 0.8, categoryPercentage: 0.7 },
                            { label: 'Open', data: [dashboardData.prevStats.open + dashboardData.prevStats.pendingValidation, dashboardData.currStats.open + dashboardData.currStats.pendingValidation], backgroundColor: '#F97316', borderRadius: 1, barPercentage: 0.8, categoryPercentage: 0.7 }
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top', align: 'start', labels: { boxWidth: 10, usePointStyle: false, font: { size: 10 } } },
                            title: { display: true, text: 'Monthly Ticket Volume Comparison', color: '#000', font: { size: 11, weight: 'bold' } },
                            datalabels: { anchor: 'end', align: 'top', formatter: Math.round, font: { weight: 'bold', size: 9 }, color: '#000' }
                        },
                        scales: {
                            y: { beginAtZero: true, grid: { color: '#f1f5f9' }, border: { display: false }, title: { display: true, text: 'Tickets', font: { size: 10, weight: 'bold' }, color: '#000' } },
                            x: { grid: { display: false }, border: { display: false }, ticks: { font: { weight: 'bold', size: 10 } } }
                        }
                    }
                }));
            }

            const closureCanvas = safeCanvas(`${idPrefix}-closureChart`);
            if (closureCanvas) {
                chartInstances.push(new Chart(closureCanvas, {
                    type: 'bar',
                    data: {
                        labels: [prevMonthLabel, currMonthLabel],
                        datasets: [
                            { type: 'line', label: 'Target (95%)', data: [95, 95], borderColor: '#EF4444', borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0, fill: false, datalabels: { display: false } } as any,
                            { type: 'bar', label: 'Closure Rate (%)', data: [+dashboardData.prevStats.rate.toFixed(1), +dashboardData.currStats.rate.toFixed(1)], backgroundColor: ['#22C55E', '#FACC15'], borderRadius: 1, barPercentage: 0.5 } as any,
                        ]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                            legend: { position: 'top', align: 'end', labels: { boxWidth: 20, font: { size: 10 }, filter: (item) => item.text.includes('Target') } },
                            title: { display: true, text: 'Closure Rate Performance', color: '#000', font: { size: 11, weight: 'bold' } },
                            datalabels: { anchor: 'end', align: 'top', formatter: (val: any, ctx: any) => ctx.dataset.type === 'line' ? '' : val + '%', font: { weight: 'bold', size: 9 }, color: '#000' }
                        },
                        scales: {
                            y: { min: 0, max: 100, grid: { color: '#f1f5f9' }, border: { display: false }, ticks: { stepSize: 50 }, title: { display: true, text: 'Closure Rate (%)', font: { size: 10, weight: 'bold' }, color: '#000' } },
                            x: { grid: { display: false }, border: { display: false }, ticks: { font: { weight: 'bold', size: 10 } } }
                        }
                    }
                }));
            }

            const renderCategoryChart = (canvasId: string, title: string, data: any[]) => {
                const canvas = safeCanvas(canvasId);
                if (!canvas) return;
                const top7 = data.slice(0, 7).reverse();
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
                            x: { display: true, max: Math.max(...top7.map((d: any) => d.count)) * 1.2, title: { display: true, text: 'Tickets', font: { size: 9, weight: 'bold' }, color: '#000' }, grid: { color: '#f1f5f9' } }
                        },
                        layout: { padding: { right: 20 } }
                    }
                }));
            };

            renderCategoryChart(`${idPrefix}-prevCatChart`, `Top Issue Categories - ${prevMonthLabel}`, dashboardData.prevStats.topCategories);
            renderCategoryChart(`${idPrefix}-currCatChart`, `Top Issue Categories - ${currMonthLabel}`, dashboardData.currStats.topCategories);

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

            renderSparkline(`${idPrefix}-sparkline1`, dashboardData.trends.total, '#1e3a8a');
            renderSparkline(`${idPrefix}-sparkline2`, dashboardData.trends.prevRate, '#22c55e');
            renderSparkline(`${idPrefix}-sparkline3`, dashboardData.trends.currRate, '#eab308');
            renderSparkline(`${idPrefix}-sparkline4`, dashboardData.trends.open, '#f97316');
        };

        timeoutId = setTimeout(() => initCharts(), 100);
        return () => {
            clearTimeout(timeoutId);
            chartInstances.forEach(c => c.destroy());
        };
    }, [dashboardData, prevMonthLabel, currMonthLabel, idPrefix]);

    const handleDownloadHD = async () => {
        if (!reportRef.current) return;
        setIsExporting(true);
        const originalScrollY = window.scrollY;
        try {
            window.scrollTo(0, 0);
            const element = reportRef.current;
            const originalBorder = element.style.border;
            const originalShadow = element.style.boxShadow;
            element.style.border = 'none';
            element.style.boxShadow = 'none';
            const html2canvas = (await import('html2canvas')).default;
            const { jsPDF } = await import('jspdf');
            const canvas = await html2canvas(element, { scale: 3, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: 1240, windowHeight: element.scrollHeight });
            element.style.border = originalBorder;
            element.style.boxShadow = originalShadow;
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width / 3, canvas.height / 3] });
            pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 3, canvas.height / 3);
            pdf.save(`Executive_Summary_${dashboardData.property?.name || 'Report'}_${shortPrevMonth}_${shortCurrMonth}.pdf`);
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            window.scrollTo(0, originalScrollY);
            setIsExporting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-border">
                <Loader2 className="w-10 h-10 text-[#4f46e5] animate-spin mb-4" />
                <p className="text-slate-500 font-medium">Generating Executive Summary...</p>
            </div>
        );
    }

    if (error || !dashboardData) {
        return (
            <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-border">
                <div className="bg-red-50 text-red-600 p-6 rounded-2xl border border-red-200 max-w-md text-center">
                    <h2 className="text-lg font-bold mb-2">Could not load dashboard</h2>
                    <p className="text-sm">{error || 'No data available'}</p>
                </div>
            </div>
        );
    }

    const { property, prevStats, currStats, allTimeTotal } = dashboardData;
    const prevRateStr = prevStats.rate.toFixed(1) + '%';
    const volumeChange = prevStats.total > 0 ? ((currStats.total - prevStats.total) / prevStats.total) * 100 : 0;
    const volSpikeText = volumeChange > 0 ? `(${volumeChange.toFixed(0)}% increase) - volume spike` : `(${Math.abs(volumeChange).toFixed(0)}% decrease)`;
    const topCurrCat = currStats.topCategories[0] || { name: 'N/A', count: 0 };
    const topPrevCat = prevStats.topCategories[0] || { name: 'N/A', count: 0 };

    const tableRows = [
        { month: prevMonthLabel, total: prevStats.total, closed: prevStats.closed, open: prevStats.open, pending: prevStats.pendingValidation, rate: prevStats.rate.toFixed(1) + '%', topCat: `${topPrevCat.name} (${topPrevCat.count} tickets)`, status: prevStats.rate >= 95 ? 'Excellent' : 'Needs Attention' },
        { month: currMonthLabel, total: currStats.total, closed: currStats.closed, open: currStats.open, pending: currStats.pendingValidation, rate: currStats.rate.toFixed(1) + '%', topCat: `${topCurrCat.name} (${topCurrCat.count} tickets)`, status: currStats.rate >= 95 ? 'Excellent' : 'Needs Attention' }
    ];

    return (
        <div className="space-y-3">
            {/* Action bar */}
            <div className="flex items-center justify-between">
                <p className="text-[11px] text-slate-500 font-medium">
                    2-month rolling performance · {shortPrevMonth}–{shortCurrMonth} {currentDate.getFullYear()}
                </p>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownloadHD}
                        disabled={isExporting}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4f46e5] text-white text-xs font-bold rounded-lg hover:bg-[#4338ca] disabled:opacity-50 transition-colors"
                    >
                        {isExporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                        Download PDF
                    </button>
                    <button
                        onClick={() => router.push(`/property/${propertyId}/reports/executive-summary`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-200 transition-colors"
                    >
                        <ExternalLink className="w-3 h-3" />
                        Full View
                    </button>
                </div>
            </div>

            {/* Dashboard Container */}
            <div
                ref={reportRef}
                className="w-full bg-white border border-[#e2e8f0] shadow-sm p-6 overflow-hidden rounded-xl"
            >
                {/* Header */}
                <div className="flex items-center justify-between pb-5 mb-4 border-b border-[#e2e8f0]">
                    <div className="flex items-center gap-3">
                        <img src="/autopilot-logo-new.png" className="h-[20px] opacity-60 grayscale" alt="Logo" />
                    </div>
                    <div className="text-center flex-1">
                        <h1 className="text-[18px] font-bold text-[#1e3a8a] tracking-tight">FMS Executive Impact Dashboard</h1>
                        <p className="text-[12px] font-medium text-[#64748b]">{property?.name || ''} · Facility Management Performance</p>
                    </div>
                    <div className="bg-[#1e3a8a] text-white px-3 py-1 rounded text-[11px] font-bold shadow-sm">
                        {shortPrevMonth}–{shortCurrMonth} {currentDate.getFullYear()}
                    </div>
                </div>

                {/* Top KPIs */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <div className="relative bg-[#F8FAFC] border-t-[3px] border-[#1e3a8a] py-3 px-4 shadow-sm border-x border-b border-[#e2e8f0] overflow-hidden flex justify-between">
                        <div className="relative z-10">
                            <p className="text-[10px] uppercase tracking-wider text-[#64748b] font-bold mb-1">TOTAL TICKETS MANAGED</p>
                            <h2 className="text-[28px] leading-none font-bold text-[#1e3a8a] mb-1">{allTimeTotal}</h2>
                            <p className="text-[9px] text-[#94a3b8] font-medium">All time · {shortPrevMonth}–{shortCurrMonth} shown below</p>
                        </div>
                        <div className="absolute right-0 bottom-0 w-[45%] h-[40%] opacity-40">
                            <canvas id={`${idPrefix}-sparkline1`}></canvas>
                        </div>
                    </div>
                    <div className="relative bg-[#F8FAFC] border-t-[3px] border-[#22c55e] py-3 px-4 shadow-sm border-x border-b border-[#e2e8f0] overflow-hidden flex justify-between">
                        <div className="relative z-10">
                            <p className="text-[10px] uppercase tracking-wider text-[#64748b] font-bold mb-1">{shortPrevMonth} CLOSURE RATE</p>
                            <h2 className="text-[28px] leading-none font-bold text-[#22c55e] mb-1">{prevStats.rate.toFixed(1)}%</h2>
                            <p className="text-[9px] text-[#94a3b8] font-medium">{prevStats.closed} of {prevStats.total} closed</p>
                        </div>
                        <div className="absolute right-0 bottom-0 w-[45%] h-[40%] opacity-40">
                            <canvas id={`${idPrefix}-sparkline2`}></canvas>
                        </div>
                    </div>
                    <div className="relative bg-[#F8FAFC] border-t-[3px] border-[#eab308] py-3 px-4 shadow-sm border-x border-b border-[#e2e8f0] overflow-hidden flex justify-between">
                        <div className="relative z-10">
                            <p className="text-[10px] uppercase tracking-wider text-[#64748b] font-bold mb-1">{shortCurrMonth} CLOSURE RATE</p>
                            <h2 className="text-[28px] leading-none font-bold text-[#1e3a8a] mb-1">{currStats.rate.toFixed(1)}%</h2>
                            <p className="text-[9px] text-[#94a3b8] font-medium">{currStats.closed} of {currStats.total} closed</p>
                        </div>
                        <div className="absolute right-0 bottom-0 w-[45%] h-[40%] opacity-40">
                            <canvas id={`${idPrefix}-sparkline3`}></canvas>
                        </div>
                    </div>
                    <div className="relative bg-[#F8FAFC] border-t-[3px] border-[#f97316] py-3 px-4 shadow-sm border-x border-b border-[#e2e8f0] overflow-hidden flex justify-between">
                        <div className="relative z-10">
                            <p className="text-[10px] uppercase tracking-wider text-[#64748b] font-bold mb-1">OPEN TICKETS ({shortCurrMonth.toUpperCase()})</p>
                            <h2 className="text-[28px] leading-none font-bold text-[#1e3a8a] mb-1">{currStats.open}</h2>
                            <p className="text-[9px] text-[#94a3b8] font-medium">Requires immediate attention</p>
                        </div>
                        <div className="absolute right-0 bottom-0 w-[45%] h-[40%] opacity-40">
                            <canvas id={`${idPrefix}-sparkline4`}></canvas>
                        </div>
                    </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
                    <div className="bg-white border border-[#e2e8f0] rounded-sm shadow-sm overflow-hidden flex flex-col" style={{ height: '220px' }}>
                        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 text-[#1e3a8a] text-[12px] font-bold">Monthly Ticket Volume Comparison</div>
                        <div className="p-3 flex-1 relative">
                            <canvas id={`${idPrefix}-volumeChart`}></canvas>
                        </div>
                    </div>
                    <div className="bg-white border border-[#e2e8f0] rounded-sm shadow-sm overflow-hidden flex flex-col" style={{ height: '220px' }}>
                        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 text-[#1e3a8a] text-[12px] font-bold">Closure Rate Performance</div>
                        <div className="p-3 flex-1 relative">
                            <canvas id={`${idPrefix}-closureChart`}></canvas>
                        </div>
                    </div>
                </div>

                {/* Categories + Insights Row */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
                    <div className="bg-white border border-[#e2e8f0] rounded-sm shadow-sm overflow-hidden flex flex-col" style={{ height: '200px' }}>
                        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 text-[#1e3a8a] text-[12px] font-bold">Top Categories · {shortPrevMonth}</div>
                        <div className="p-2 flex-1 relative">
                            <canvas id={`${idPrefix}-prevCatChart`}></canvas>
                        </div>
                    </div>
                    <div className="bg-white border border-[#e2e8f0] rounded-sm shadow-sm overflow-hidden flex flex-col" style={{ height: '200px' }}>
                        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 text-[#1e3a8a] text-[12px] font-bold">Top Categories · {shortCurrMonth}</div>
                        <div className="p-2 flex-1 relative">
                            <canvas id={`${idPrefix}-currCatChart`}></canvas>
                        </div>
                    </div>
                    <div className="bg-white border border-[#e2e8f0] rounded-sm shadow-sm overflow-hidden flex flex-col" style={{ height: '200px' }}>
                        <div className="bg-[#f8fafc] border-b border-[#e2e8f0] px-3 py-2 text-[#1e3a8a] text-[12px] font-bold">Key Accountability Insights</div>
                        <div className="p-4 flex-1 overflow-auto">
                            <ul className="space-y-2.5 text-[11px] text-[#475569]">
                                <li className="flex gap-2 items-start leading-[1.3]">
                                    <span className="w-[5px] h-[5px] rounded-full bg-[#22c55e] mt-1 flex-shrink-0"></span>
                                    <div><span className="font-bold text-[#1e3a8a]">{shortPrevMonth}:</span> {prevRateStr} closure rate · {prevStats.rate >= 90 ? 'excellent performance' : 'moderate performance'}</div>
                                </li>
                                <li className="flex gap-2 items-start leading-[1.3]">
                                    <span className="w-[5px] h-[5px] rounded-full bg-[#eab308] mt-1 flex-shrink-0"></span>
                                    <div><span className="font-bold text-[#1e3a8a]">{shortCurrMonth}:</span> {currStats.total} tickets {volSpikeText}</div>
                                </li>
                                <li className="flex gap-2 items-start leading-[1.3]">
                                    <span className="w-[5px] h-[5px] rounded-full bg-[#ef4444] mt-1 flex-shrink-0"></span>
                                    <div><span className="font-bold text-[#ef4444]">{currStats.open} open tickets</span> in {shortCurrMonth} need immediate resolution</div>
                                </li>
                                <li className="flex gap-2 items-start leading-[1.3]">
                                    <span className="w-[5px] h-[5px] rounded-full bg-[#22c55e] mt-1 flex-shrink-0"></span>
                                    <div><span className="font-bold text-[#1e3a8a]">{topCurrCat.name}</span> top category ({topCurrCat.count} tickets)</div>
                                </li>
                                <li className="flex gap-2 items-start leading-[1.3]">
                                    <span className="w-[5px] h-[5px] rounded-full bg-[#22c55e] mt-1 flex-shrink-0"></span>
                                    <div><span className="font-bold text-[#1e3a8a]">{topPrevCat.name}</span> prominent in {shortPrevMonth} ({topPrevCat.count} tickets)</div>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Summary Table */}
                <div>
                    <h3 className="text-[12px] font-bold text-[#1e3a8a] mb-2 px-1">Monthly Performance Summary</h3>
                    <div className="border border-[#1e3a8a] overflow-hidden rounded-sm">
                        <table className="w-full text-[11px] text-left">
                            <thead className="bg-[#1e3a8a] text-white">
                                <tr>
                                    {['Month', 'Total', 'Closed', 'Open/WIP', 'Pending', 'Closure Rate', 'Top Category', 'Status'].map(h => (
                                        <th key={h} className="py-2 px-3 font-bold border-r border-[#2C4A9E] last:border-r-0">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white">
                                {tableRows.map((row, idx) => (
                                    <tr key={idx} className={idx === 0 ? 'border-b border-[#e2e8f0]' : ''}>
                                        <td className="py-2.5 px-3 font-bold text-[#334155]">{row.month}</td>
                                        <td className="py-2.5 px-3 text-[#64748b]">{row.total}</td>
                                        <td className="py-2.5 px-3 text-[#64748b]">{row.closed}</td>
                                        <td className="py-2.5 px-3 text-[#64748b]">{row.open}</td>
                                        <td className="py-2.5 px-3 text-[#64748b]">{row.pending}</td>
                                        <td className="py-2.5 px-3 font-bold text-[#334155]">{row.rate}</td>
                                        <td className="py-2.5 px-3 text-[#64748b] max-w-[160px] truncate">{row.topCat}</td>
                                        <td className="py-2.5 px-3">
                                            {row.status === 'Excellent'
                                                ? <span className="text-[#16a34a] font-bold">Excellent</span>
                                                : <span className="text-[#d97706] font-bold bg-[#fef3c7] px-1.5 py-0.5 rounded">Needs Attention</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
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
