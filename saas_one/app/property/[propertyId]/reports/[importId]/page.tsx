'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft, Download, Printer } from 'lucide-react';
import { createClient } from '@/frontend/utils/supabase/client';

interface TicketData {
    id: string;
    ticketNumber: string;
    ticketNumberDisplay: string;
    title: string;
    description: string;
    category: string;
    status: string;
    priority: string;
    floor: string | null;
    floorLabel: string;
    location: string | null;
    reportedDate: string;
    closedDate: string | null;
    spocName: string;
    spocEmail: string;
    assigneeName: string;
    beforePhoto: string | null;
    afterPhoto: string | null;
}

interface ReportData {
    import: {
        id: string;
        filename: string;
        createdAt: string;
        completedAt: string | null;
        totalRows: number;
        validRows: number;
    };
    property: {
        name: string;
        code: string;
        address?: string;
    };
    kpis: {
        totalSnags: number;
        closedSnags: number;
        openSnags: number;
        closureRate: number;
    };
    charts: {
        floor: {
            labels: string[];
            data: number[];
        };
        department: {
            labels: string[];
            open: number[];
            closed: number[];
        };
    };
    floorGroups: Record<string, TicketData[]>;
    tickets: TicketData[];
}

export default function SnagReportPage() {
    const params = useParams();
    const router = useRouter();
    const propertyId = params?.propertyId as string;
    const importId = params?.importId as string;

    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const chartInitialized = useRef(false);

    useEffect(() => {
        fetchReportData();
    }, [importId]);

    useEffect(() => {
        if (reportData && !chartInitialized.current && typeof window !== 'undefined') {
            initCharts();
            chartInitialized.current = true;
        }
    }, [reportData]);

    const fetchReportData = async () => {
        setIsLoading(true);
        setError(null);

        try {
            const response = await fetch(`/api/reports/snag-report/${importId}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch report');
            }

            setReportData(data);
        } catch (err) {
            console.error('Error fetching report:', err);
            setError(err instanceof Error ? err.message : 'Failed to load report');
        } finally {
            setIsLoading(false);
        }
    };

    const initCharts = async () => {
        if (!reportData) return;

        // Dynamically import Chart.js
        const Chart = (await import('chart.js/auto')).default;

        // Floor Chart
        const floorCanvas = document.getElementById('floorChart') as HTMLCanvasElement;
        if (floorCanvas) {
            new Chart(floorCanvas, {
                type: 'bar',
                data: {
                    labels: reportData.charts.floor.labels,
                    datasets: [{
                        label: 'total snags',
                        data: reportData.charts.floor.data,
                        backgroundColor: '#708F96',
                        borderRadius: 4,
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    onClick: (e, elements) => {
                        if (elements.length > 0) {
                            const index = elements[0].index;
                            const floorLabel = reportData.charts.floor.labels[index];
                            const el = document.getElementById(`floor-${floorLabel.replace(/\s+/g, '-').toLowerCase()}`);
                            if (el) {
                                el.scrollIntoView({ behavior: 'smooth' });
                            }
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        title: { display: true, text: 'snags by floor (click to navigate)' }
                    }
                }
            });
        }

        // Department Chart
        const deptCanvas = document.getElementById('deptChart') as HTMLCanvasElement;
        if (deptCanvas) {
            new Chart(deptCanvas, {
                type: 'bar',
                data: {
                    labels: reportData.charts.department.labels,
                    datasets: [
                        {
                            label: 'open',
                            data: reportData.charts.department.open,
                            backgroundColor: '#E74C3C',
                        },
                        {
                            label: 'closed',
                            data: reportData.charts.department.closed,
                            backgroundColor: '#27AE60',
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { stacked: true },
                        y: { stacked: true }
                    },
                    plugins: {
                        title: { display: true, text: 'snags by department' }
                    }
                }
            });
        }
    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    };

    const handlePrint = () => {
        window.print();
    };

    const handleExportCSV = () => {
        if (!reportData) return;

        const headers = ['ticket id', 'title', 'description', 'category', 'floor', 'location', 'status', 'priority', 'spoc', 'reported date', 'closure date'];
        const rows = reportData.tickets.map(t => [
            t.ticketNumberDisplay,
            t.title,
            t.description?.replace(/,/g, ';') || '',
            t.category,
            t.floorLabel,
            t.location || '-',
            t.status,
            t.priority,
            t.spocName,
            formatDate(t.reportedDate),
            formatDate(t.closedDate)
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `snag_report_${reportData.import.filename.replace(/\.[^/.]+$/, "")}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-12 h-12 text-[#708F96] animate-spin" />
                    <p className="text-gray-500 font-medium">Generating Report...</p>
                </div>
            </div>
        );
    }

    if (error || !reportData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA]">
                <div className="text-center">
                    <p className="text-red-500 font-medium mb-4">{error || 'Failed to load report'}</p>
                    <button
                        onClick={() => router.back()}
                        className="px-4 py-2 bg-[#708F96] text-white rounded-lg"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    const { kpis, property, tickets } = reportData;

    // Group tickets by floor
    const ticketsByFloor: Record<string, TicketData[]> = {};
    tickets.forEach(ticket => {
        const floor = ticket.floorLabel;
        if (!ticketsByFloor[floor]) {
            ticketsByFloor[floor] = [];
        }
        ticketsByFloor[floor].push(ticket);
    });

    return (
        <>
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-break { page-break-inside: avoid; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
                    .charts-grid { display: grid !important; grid-template-columns: 1fr 1fr !important; gap: 10px !important; }
                    .chart-container-print { height: 250px !important; margin-bottom: 20px !important; page-break-inside: avoid; }
                    .dashboard-section { page-break-after: always; padding: 0 !important; margin: 0 !important; }
                    .kpi-grid { gap: 10px !important; margin-bottom: 20px !important; }
                    .kpi-card { padding: 10px !important; }
                }
            `}</style>

            <div className="min-h-screen bg-[#F5F7FA] p-5 print:p-0 print:bg-white" style={{ fontFamily: "'Roboto', sans-serif" }}>
                <div className="max-w-[1100px] mx-auto">

                    {/* Header Controls - No Print */}
                    <div className="no-print flex justify-between items-center mb-5">
                        <button
                            onClick={() => router.back()}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            Back to Reports
                        </button>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleExportCSV}
                                className="flex items-center gap-2 px-4 py-2.5 bg-[#708F96] text-white rounded-lg font-medium hover:bg-[#5a747a] transition-colors"
                            >
                                <Download className="w-4 h-4" />
                                export csv
                            </button>
                            <button
                                onClick={handlePrint}
                                className="flex items-center gap-2 px-4 py-2.5 bg-[#AA895F] text-white rounded-lg font-medium hover:bg-[#8a7050] transition-colors"
                            >
                                <Printer className="w-4 h-4" />
                                print / save pdf
                            </button>
                        </div>
                    </div>

                    {/* Dashboard Section */}
                    <div className="bg-white p-5 rounded-xl shadow-sm mb-8 dashboard-section">
                        <h1 className="text-[#708F96] font-light text-2xl border-l-4 border-[#AA895F] pl-4 mb-4">
                            {property.name} - snag report
                        </h1>
                        <p className="text-gray-500 text-sm mb-4">
                            Import: {reportData.import.filename} | Generated: {formatDate(new Date().toISOString())}
                        </p>

                        {/* KPI Cards */}
                        <div className="grid grid-cols-4 gap-4 mb-6 kpi-grid">
                            <div className="bg-gray-50 p-4 rounded-lg text-center border-t-4 border-[#708F96] kpi-card">
                                <div className="text-3xl font-bold text-gray-800">{kpis.totalSnags}</div>
                                <div className="text-xs text-gray-500 tracking-wide uppercase">Total Snags</div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg text-center border-t-4 border-[#27AE60] kpi-card">
                                <div className="text-3xl font-bold text-[#27AE60]">{kpis.closedSnags}</div>
                                <div className="text-xs text-gray-500 tracking-wide uppercase">Closed</div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg text-center border-t-4 border-[#AA895F] kpi-card">
                                <div className="text-3xl font-bold text-[#AA895F]">{kpis.openSnags}</div>
                                <div className="text-xs text-gray-500 tracking-wide uppercase">Open / WIP</div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg text-center border-t-4 border-[#708F96] kpi-card">
                                <div className="text-3xl font-bold text-gray-800">{kpis.closureRate}%</div>
                                <div className="text-xs text-gray-500 tracking-wide uppercase">Closure Rate</div>
                            </div>
                        </div>

                        {/* Charts */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 h-auto min-h-[250px] charts-grid">
                            <div className="relative h-[260px] chart-container-print">
                                <canvas id="floorChart"></canvas>
                            </div>
                            <div className="relative h-[260px] chart-container-print">
                                <canvas id="deptChart"></canvas>
                            </div>
                        </div>
                        <p className="text-center text-xs text-[#AA895F] mt-3">
                            *click on any "floor" bar above to jump to that floor's report.
                        </p>
                    </div>

                    {/* Snag Cards by Floor */}
                    {Object.entries(ticketsByFloor).map(([floor, floorTickets]) => (
                        <div key={floor} id={`floor-${floor.replace(/\s+/g, '-').toLowerCase()}`}>
                            <div className="bg-gray-800 text-white px-5 py-3 rounded-lg mt-10 mb-5 text-lg tracking-wide">
                                {floor} snags ({floorTickets.length})
                            </div>

                            {floorTickets.map(ticket => (
                                <div
                                    key={ticket.id}
                                    className="print-break bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200 mb-8"
                                >
                                    {/* Snag Header */}
                                    <div
                                        className={`px-5 py-3 flex justify-between items-center ${ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'waitlist'
                                            ? 'bg-[#AA895F]'
                                            : 'bg-[#708F96]'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="bg-white/20 text-white px-2 py-1 rounded text-sm font-bold">
                                                {ticket.ticketNumberDisplay}
                                            </span>
                                            <span className="text-white/90">{ticket.category}</span>
                                        </div>
                                        <span
                                            className={`text-xs font-bold px-3 py-1 rounded-full ${ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'waitlist'
                                                ? 'bg-[#AA895F] text-white border border-white'
                                                : 'bg-white text-[#708F96]'
                                                }`}
                                        >
                                            {ticket.status.replace('_', ' ')}
                                        </span>
                                    </div>

                                    {/* Snag Body */}
                                    <div className="p-5">
                                        <h3 className="text-lg font-medium text-gray-800 mb-4">{ticket.title}</h3>

                                        {/* Meta Grid */}
                                        <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg mb-5">
                                            <div>
                                                <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">
                                                    SPOC (Admin)
                                                </span>
                                                <span className="text-gray-800 text-sm">{ticket.spocName}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">
                                                    Floor
                                                </span>
                                                <span className="text-gray-800 text-sm">
                                                    {ticket.floorLabel}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">
                                                    Location
                                                </span>
                                                <span className="text-gray-800 text-sm">
                                                    {ticket.location || '-'}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">
                                                    Reported Date
                                                </span>
                                                <span className="text-gray-800 text-sm">{formatDate(ticket.reportedDate)}</span>
                                            </div>
                                            <div>
                                                <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">
                                                    Closure Date
                                                </span>
                                                <span className="text-gray-800 text-sm">{formatDate(ticket.closedDate)}</span>
                                            </div>
                                        </div>

                                        {/* Evidence Photos */}
                                        <div className="flex gap-4">
                                            <div className="flex-1 relative">
                                                <div className="absolute top-2 left-2 bg-black/70 text-white px-3 py-1 text-xs rounded z-10">
                                                    before
                                                </div>
                                                {ticket.beforePhoto ? (
                                                    <img
                                                        src={ticket.beforePhoto}
                                                        alt="Before"
                                                        className="w-full h-[220px] object-cover rounded-lg border border-gray-200"
                                                    />
                                                ) : (
                                                    <div className="w-full h-[220px] bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm">
                                                        No Photo
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 relative">
                                                <div className="absolute top-2 left-2 bg-[#27AE60] text-white px-3 py-1 text-xs rounded z-10">
                                                    after
                                                </div>
                                                {ticket.afterPhoto ? (
                                                    <img
                                                        src={ticket.afterPhoto}
                                                        alt="After"
                                                        className="w-full h-[220px] object-cover rounded-lg border border-gray-200"
                                                    />
                                                ) : (
                                                    <div className="w-full h-[220px] bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm">
                                                        {ticket.status === 'closed' || ticket.status === 'resolved'
                                                            ? 'No Photo'
                                                            : 'Repair In Progress'}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}

                    {/* Footer */}
                    <div className="text-center text-sm text-gray-400 py-8 border-t border-gray-200 mt-10">
                        <p>Generated by Autopilot | {formatDate(new Date().toISOString())}</p>
                    </div>
                </div>
            </div>
        </>
    );
}
