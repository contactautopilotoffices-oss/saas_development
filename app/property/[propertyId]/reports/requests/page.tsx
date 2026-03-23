'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, ArrowLeft, Download, ChevronLeft, ChevronRight, FileDown, FileText, X } from 'lucide-react';
import { jsPDF } from 'jspdf';


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
    internal: boolean;
}

interface ReportData {
    month: { value: string; label: string };
    property: { name: string; code: string; address?: string };
    kpis: {
        totalSnags: number;
        closedSnags: number;
        openSnags: number;
        closureRate: number;
        pendingValidationCount: number;
        isValidationEnabled: boolean;
    };
    charts: {
        floor: { labels: string[]; data: number[] };
        department: { labels: string[]; open: number[]; closed: number[] };
    };
    floorGroups: Record<string, TicketData[]>;
    tickets: TicketData[];
}

function getCurrentMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function changeMonth(month: string, delta: number) {
    const [year, m] = month.split('-').map(Number);
    const d = new Date(year, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function RequestsReportPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const propertyId = params?.propertyId as string;

    const [month, setMonth] = useState(() => searchParams.get('month') || getCurrentMonth());
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [chartInstances, setChartInstances] = useState<any[]>([]);
    const [displayLimit, setDisplayLimit] = useState(15);
    const [isDownloading, setIsDownloading] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [reportFilter, setReportFilter] = useState<'all' | 'open' | 'pending_validation' | 'internal'>('all');
    const isCancelledRef = useRef(false);
    const [selectedTicketIds, setSelectedTicketIds] = useState<string[]>([]);
    const [isDownloadingSelected, setIsDownloadingSelected] = useState(false);
    const [downloadSelectedProgress, setDownloadSelectedProgress] = useState(0);
    const isCancelledSelectedRef = useRef(false);

    const toggleTicket = (id: string) => {
        setSelectedTicketIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    useEffect(() => {
        fetchReportData();
    }, [month, propertyId]);

    useEffect(() => {
        if (reportData) {
            chartInstances.forEach(c => c.destroy());
            setChartInstances([]);
            initCharts();
        }
    }, [reportData, reportFilter]);

    // Resize charts to their print dimensions just before the print dialog renders
    useEffect(() => {
        const handleBeforePrint = () => {
            chartInstances.forEach(chart => chart.resize());
        };
        window.addEventListener('beforeprint', handleBeforePrint);
        return () => window.removeEventListener('beforeprint', handleBeforePrint);
    }, [chartInstances]);

    const fetchReportData = async () => {
        setIsLoading(true);
        setError(null);
        setReportData(null);
        try {
            const response = await fetch(`/api/reports/requests-report?propertyId=${propertyId}&month=${month}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to fetch report');
            setReportData(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load report');
        } finally {
            setIsLoading(false);
        }
    };

    const initCharts = async () => {
        if (!reportData || typeof window === 'undefined') return;
        const Chart = (await import('chart.js/auto')).default;

        // Compute floor data from currently filtered tickets
        const currentFiltered = reportData.tickets.filter(t => {
            if (reportFilter === 'open') return ['open', 'in_progress', 'assigned', 'paused'].includes(t.status);
            if (reportFilter === 'pending_validation') return t.status === 'pending_validation';
            if (reportFilter === 'internal') return t.internal === true;
            return true;
        });
        const floorCountMap: Record<string, number> = {};
        currentFiltered.forEach(t => {
            const fl = t.floorLabel || 'Unspecified';
            floorCountMap[fl] = (floorCountMap[fl] || 0) + 1;
        });
        const floorLabels = Object.keys(floorCountMap).sort((a, b) => {
            if (a === 'Unspecified') return 1;
            if (b === 'Unspecified') return -1;
            return a.localeCompare(b);
        });
        const floorData = floorLabels.map(l => floorCountMap[l]);

        const floorCanvas = document.getElementById('floorChartReq') as HTMLCanvasElement;
        if (floorCanvas) {
            Chart.getChart(floorCanvas)?.destroy();
            const floorDataLabelPlugin = {
                id: 'floorDataLabels',
                afterDatasetsDraw(chart: any) {
                    const { ctx } = chart;
                    chart.data.datasets[0].data.forEach((value: number, index: number) => {
                        const meta = chart.getDatasetMeta(0);
                        const bar = meta.data[index];
                        ctx.save();
                        ctx.fillStyle = '#1f2937';
                        ctx.font = 'bold 12px sans-serif';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(value, bar.x + 6, bar.y);
                        ctx.restore();
                    });
                }
            };
            const instance = new Chart(floorCanvas, {
                type: 'bar',
                data: {
                    labels: floorLabels,
                    datasets: [{
                        label: 'total tickets',
                        data: floorData,
                        backgroundColor: '#708F96',
                        borderRadius: 4,
                    }],
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 0 },
                    layout: { padding: { right: 32 } },
                    scales: {
                        x: { ticks: { display: false }, grid: { display: false }, border: { display: false } },
                    },
                    onClick: (_e: any, elements: any[]) => {
                        if (elements.length > 0) {
                            const label = floorLabels[elements[0].index];
                            const el = document.getElementById(`floor-${label.replace(/\s+/g, '-').toLowerCase()}`);
                            if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }
                    },
                    plugins: {
                        legend: { display: false },
                        title: { display: true, text: 'Tickets by Floor (click to navigate)' },
                    },
                },
                plugins: [floorDataLabelPlugin],
            });
            setChartInstances(prev => [...prev, instance]);
        }

    };

    const formatDate = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const formatTime = (dateString: string | null) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true });
    };

    const handleExportCSV = () => {
        if (!reportData) return;
        const headers = ['ticket id', 'title', 'description', 'category', 'floor', 'location', 'status', 'priority', 'spoc', 'assignee', 'reported date', 'closure date'];
        const rows = filteredTickets.map(t => [
            t.ticketNumberDisplay, t.title, t.description?.replace(/,/g, ';') || '',
            t.category, t.floorLabel, t.location || '-', t.status, t.priority,
            t.spocName, t.assigneeName, formatDate(t.reportedDate), formatDate(t.closedDate),
        ]);
        const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `requests_${reportFilter}_${reportData.property.code || 'property'}_${month}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };



    const handleDirectDownloadPDF = async () => {
        if (!reportData) return;
        setIsDownloading(true);
        setDownloadProgress(0);
        isCancelledRef.current = false;

        const doc = new jsPDF('p', 'mm', 'a4');
        const tickets = filteredTickets;
        const total = tickets.length;

        // --- Page 1: Dashboard Summary ---
        // KPIs computed from filteredTickets (matches the active filter)
        const filtClosed = tickets.filter(t => t.status === 'closed' || t.status === 'resolved').length;
        const filtOpen = tickets.filter(t => !['closed', 'resolved', 'pending_validation'].includes(t.status)).length;
        const filtPending = tickets.filter(t => t.status === 'pending_validation').length;
        const filtRate = tickets.length > 0 ? ((filtClosed / tickets.length) * 100).toFixed(1) : '0';

        // Header Bar & Title
        doc.setFillColor(170, 137, 95);
        doc.rect(15, 15, 2, 12, 'F');
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(112, 143, 150);
        doc.text(`${reportData.property.name || 'Property'} - ${filterLabel} report`, 22, 25);

        // Subheader
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        const generatedDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        doc.text(`Period: ${reportData.month.label} | Generated: ${generatedDate}`, 15, 35);

        // KPI Cards Row
        const yHeader = 30;
        const kpiX = [15, 60, 105, 150];
        const kpiTitles = [
            'TOTAL TICKETS', 'CLOSED', 'OPEN / WIP',
            reportData.kpis.isValidationEnabled ? 'PENDING VALIDATION' : 'CLOSURE RATE',
        ];
        const kpiValues = [
            tickets.length, filtClosed, filtOpen,
            reportData.kpis.isValidationEnabled ? filtPending : `${filtRate}%`,
        ];
        const kpiColors = [
            [30, 30, 30], [34, 197, 94], [234, 179, 8],
            reportData.kpis.isValidationEnabled ? [170, 137, 95] : [30, 30, 30],
        ];

        kpiX.forEach((x, i) => {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(240, 240, 240);
            doc.roundedRect(x, yHeader + 15, 42, 22, 2, 2, 'FD');
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(150, 150, 150);
            doc.text(kpiTitles[i], x + 21, yHeader + 32, { align: 'center' });
            doc.setFontSize(16);
            doc.setTextColor(kpiColors[i][0], kpiColors[i][1], kpiColors[i][2]);
            doc.text(String(kpiValues[i]), x + 21, yHeader + 26, { align: 'center' });
        });

        // --- Side-by-Side Charts Row ---
        const yCharts = 95;
        const chartW = 87;
        const chartH = 75;

        // 1. Floor Chart (Left) — canvas already reflects active filter
        const floorCanvas = document.getElementById('floorChartReq') as HTMLCanvasElement;
        if (floorCanvas) {
            try {
                const imgData = floorCanvas.toDataURL('image/png', 1.0);
                doc.addImage(imgData, 'PNG', 15, yCharts, chartW, chartH);
            } catch (e) {
                console.error('Floor chart fail:', e);
                doc.setDrawColor(200, 200, 200);
                doc.rect(15, yCharts, chartW, chartH);
                doc.setTextColor(150, 150, 150);
                doc.text('Floor Chart Data Empty', 15 + chartW / 2, yCharts + chartH / 2, { align: 'center' });
            }
        }

        // 2. Category Breakdown (Right) — computed from filteredTickets
        const catX = 110;
        let catY = yCharts;
        const catW = 85;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(112, 143, 150);
        doc.text('TICKETS BY CATEGORY', catX, catY);
        catY += 8;

        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(52, 211, 153); doc.roundedRect(catX, catY - 2.5, 3, 3, 0.5, 0.5, 'F');
        doc.setTextColor(100, 100, 100); doc.text('Closed', catX + 5, catY);
        doc.setFillColor(248, 113, 113); doc.roundedRect(catX + 20, catY - 2.5, 3, 3, 0.5, 0.5, 'F');
        doc.text('Open', catX + 25, catY);
        catY += 8;

        // Build category rows from filteredTickets
        const catMap: Record<string, { open: number; closed: number }> = {};
        tickets.forEach(t => {
            const cat = t.category || 'Other';
            if (!catMap[cat]) catMap[cat] = { open: 0, closed: 0 };
            if (['closed', 'resolved'].includes(t.status)) catMap[cat].closed++;
            else catMap[cat].open++;
        });
        const catRows = Object.entries(catMap)
            .map(([label, v]) => ({ label, open: v.open, closed: v.closed, total: v.open + v.closed }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 15);
        const catMax = catRows[0]?.total || 1;

        catRows.forEach(row => {
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(50, 50, 50);
            const shortLabel = row.label.length > 30 ? row.label.slice(0, 28) + '…' : row.label;
            doc.text(shortLabel, catX, catY);
            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.text(`${row.closed} closed · ${row.open} open`, catX + catW - 15, catY, { align: 'right' });
            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(40, 40, 40);
            doc.text(String(row.total), catX + catW - 1, catY, { align: 'right' });
            catY += 4;

            const barW = catW - 5;
            doc.setFillColor(240, 240, 240);
            doc.roundedRect(catX, catY, barW, 3, 1, 1, 'F');
            const closedW = (row.closed / catMax) * barW;
            if (closedW > 0) { doc.setFillColor(52, 211, 153); doc.roundedRect(catX, catY, closedW, 3, 1, 1, 'F'); }
            const openW = (row.open / catMax) * barW;
            if (openW > 0) {
                doc.setFillColor(248, 113, 113);
                if (closedW > 0) doc.rect(catX + closedW, catY, openW, 3, 'F');
                else doc.roundedRect(catX, catY, openW, 3, 1, 1, 'F');
            }
            catY += 7;
        });

        // --- Subsequent Pages: Tickets ---

        // Helper to load and compress image
        const loadImage = (url: string): Promise<string | null> => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const maxDim = 1200; // Increased resolution
                    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8)); // Increased quality
                };
                img.onerror = () => resolve(null);
                img.src = url;
            });
        };

        for (let i = 0; i < tickets.length; i++) {
            // Check for cancellation
            if (isCancelledRef.current) {
                setIsDownloading(false);
                setDownloadProgress(0);
                return;
            }

            const ticket = tickets[i];
            setDownloadProgress(Math.round(((i + 1) / total) * 100));

            doc.addPage();

            // Header bar
            const isOpen = ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'waitlist';
            if (isOpen) doc.setFillColor(170, 137, 95); else doc.setFillColor(112, 143, 150);
            doc.rect(0, 0, 210, 15, 'F');

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            const categoryText = ticket.category || 'Other';
            doc.text(`${ticket.ticketNumberDisplay} | ${categoryText}`, 15, 10);
            doc.text(ticket.status.toUpperCase().replace('_', ' '), 180, 10, { align: 'right' });

            // Title — wrapped to fit page width
            doc.setTextColor(30, 30, 30);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            const titleLines: string[] = doc.splitTextToSize(ticket.title, 180);
            const clampedTitleLines = titleLines.slice(0, 4); // max 4 lines
            const titleLineHeight = 9;
            const yTitle = 28;
            doc.text(clampedTitleLines, 15, yTitle);

            // Dynamic y — push details grid down if title is multi-line
            const yDetails = yTitle + (clampedTitleLines.length * titleLineHeight) + 4;

            // Details Grid (Expanded Spacing)
            doc.setFillColor(248, 250, 252);
            doc.rect(15, yDetails, 180, 64, 'F');

            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(170, 137, 95);
            doc.text('SPOC', 20, yDetails + 10); doc.text('ASSIGNED TO', 110, yDetails + 10);
            doc.text('FLOOR', 20, yDetails + 22); doc.text('LOCATION', 110, yDetails + 22);
            doc.text('REPORTED DATE', 20, yDetails + 34); doc.text('CLOSURE DATE', 110, yDetails + 34);
            doc.text('REPORTED TIME', 20, yDetails + 46); doc.text('CLOSURE TIME', 110, yDetails + 46);

            doc.setFontSize(10.5);
            doc.setTextColor(50, 50, 50);
            doc.setFont('helvetica', 'normal');
            doc.text(ticket.spocName || '-', 20, yDetails + 16); doc.text(ticket.assigneeName || '-', 110, yDetails + 16);
            doc.text(ticket.floorLabel || '-', 20, yDetails + 28); doc.text((ticket.location || '-').slice(0, 38), 110, yDetails + 28);
            doc.text(formatDate(ticket.reportedDate), 20, yDetails + 40); doc.text(formatDate(ticket.closedDate), 110, yDetails + 40);
            doc.text(formatTime(ticket.reportedDate), 20, yDetails + 52); doc.text(formatTime(ticket.closedDate), 110, yDetails + 52);

            // Photos — expanded below details grid
            const photoWidth = 87;
            const photoHeight = 65;
            const yPhotos = yDetails + 75;

            if (ticket.beforePhoto) {
                const b64 = await loadImage(ticket.beforePhoto);
                if (b64) doc.addImage(b64, 'JPEG', 15, yPhotos, photoWidth, photoHeight);
                else doc.rect(15, yPhotos, photoWidth, photoHeight);
            } else {
                doc.setDrawColor(200, 200, 200);
                doc.rect(15, yPhotos, photoWidth, photoHeight);
                doc.text('No Photo', 57, yPhotos + 32, { align: 'center' });
            }
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.setFillColor(0, 0, 0, 0.5);
            doc.rect(15, yPhotos, 20, 6, 'F');
            doc.text('BEFORE', 17, yPhotos + 4.5);

            if (ticket.afterPhoto) {
                const b64 = await loadImage(ticket.afterPhoto);
                if (b64) doc.addImage(b64, 'JPEG', 110, yPhotos, photoWidth, photoHeight, undefined, 'FAST');
                else doc.rect(110, yPhotos, photoWidth, photoHeight);
            } else {
                doc.setDrawColor(200, 200, 200);
                doc.rect(110, yPhotos, photoWidth, photoHeight);
                doc.setFontSize(9);
                doc.setTextColor(150, 150, 150);
                doc.text(ticket.status === 'closed' || ticket.status === 'resolved' ? 'No Photo' : 'In Progress', 152, yPhotos + 32, { align: 'center' });
            }
            doc.setFontSize(8);
            doc.setTextColor(255, 255, 255);
            doc.setFillColor(39, 174, 96, 0.7);
            doc.rect(110, yPhotos, 20, 6, 'F');
            doc.text('AFTER', 113, yPhotos + 4.5);
        }

        // Final check before saving
        if (isCancelledRef.current) {
            setIsDownloading(false);
            setDownloadProgress(0);
            return;
        }

        doc.save(`monthly_report_${month}_${reportData.property.code}.pdf`);
        setIsDownloading(false);
        setDownloadProgress(0);
    };

    // Download PDF for only the selected tickets
    const handleDownloadSelectedPDF = async () => {
        if (!reportData) return;
        const tickets = filteredTickets.filter(t => selectedTicketIds.includes(t.id));
        if (tickets.length === 0) return;
        setIsDownloadingSelected(true);
        setDownloadSelectedProgress(0);
        isCancelledSelectedRef.current = false;

        const doc = new jsPDF('p', 'mm', 'a4');
        const total = tickets.length;

        // --- Page 1: Summary ---
        doc.setFillColor(170, 137, 95);
        doc.rect(15, 15, 2, 12, 'F');
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(112, 143, 150);
        doc.text(`${reportData.property.name || 'Property'} — Selected Tickets`, 22, 25);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        const generatedDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        doc.text(`Period: ${reportData.month.label} | Generated: ${generatedDate} | ${tickets.length} ticket(s) selected`, 15, 35);

        // KPI row for selected tickets
        const yHeader = 30;
        const kpiX = [15, 60, 105, 150];
        const kpiTitles = ['SELECTED', 'CLOSED', 'OPEN / WIP', reportData.kpis.isValidationEnabled ? 'PENDING VALIDATION' : 'CLOSURE RATE'];
        const selClosed = tickets.filter(t => t.status === 'closed' || t.status === 'resolved').length;
        const selOpen = tickets.filter(t => ['open', 'in_progress', 'assigned', 'paused', 'waitlist'].includes(t.status)).length;
        const selPending = tickets.filter(t => t.status === 'pending_validation').length;
        const selRate = tickets.length > 0 ? Math.round((selClosed / tickets.length) * 100) : 0;
        const kpiValues = [tickets.length, selClosed, selOpen, reportData.kpis.isValidationEnabled ? selPending : `${selRate}%`];
        const kpiColors = [[30,30,30],[34,197,94],[234,179,8], reportData.kpis.isValidationEnabled ? [170,137,95] : [30,30,30]];

        kpiX.forEach((x, i) => {
            doc.setFillColor(255, 255, 255);
            doc.setDrawColor(240, 240, 240);
            doc.roundedRect(x, yHeader + 15, 42, 22, 2, 2, 'FD');
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(150, 150, 150);
            doc.text(kpiTitles[i], x + 21, yHeader + 32, { align: 'center' });
            doc.setFontSize(16);
            doc.setTextColor(kpiColors[i][0], kpiColors[i][1], kpiColors[i][2]);
            doc.text(String(kpiValues[i]), x + 21, yHeader + 26, { align: 'center' });
        });

        // --- Side-by-Side Charts Row ---
        const yCharts = 95;
        const chartW = 87;
        const chartH = 75;

        // 1. Floor Chart (Left) — computed from selected tickets only
        {
            const floorMap: Record<string, number> = {};
            tickets.forEach(t => {
                const fl = t.floorLabel || 'Unspecified';
                floorMap[fl] = (floorMap[fl] || 0) + 1;
            });
            const floorRows = Object.entries(floorMap)
                .map(([label, count]) => ({ label, count }))
                .sort((a, b) => b.count - a.count);
            const floorMax = floorRows[0]?.count || 1;

            const fX = 15;
            let fY = yCharts;
            const fW = chartW;

            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(112, 143, 150);
            doc.text('Tickets by Floor', fX + fW / 2, fY, { align: 'center' });
            fY += 7;

            const rowH = 7;
            const labelW = 22;
            const barAreaW = fW - labelW - 12;

            floorRows.slice(0, 10).forEach(row => {
                // Label
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(80, 80, 80);
                const shortLabel = row.label.length > 14 ? row.label.slice(0, 12) + '…' : row.label;
                doc.text(shortLabel, fX + labelW, fY + rowH / 2 + 1.5, { align: 'right' });

                // Bar
                const bX = fX + labelW + 2;
                const barW2 = Math.max(1, (row.count / floorMax) * barAreaW);
                doc.setFillColor(112, 143, 150);
                doc.roundedRect(bX, fY + 1, barW2, rowH - 3, 1, 1, 'F');

                // Count
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(50, 50, 50);
                doc.text(String(row.count), bX + barW2 + 2, fY + rowH / 2 + 1.5);

                fY += rowH;
            });
        }

        // 2. Category Breakdown for selected tickets (Right)
        const catX = 110;
        let catY = yCharts;
        const catW = 85;

        // Build category counts from selected tickets only
        const selCatMap: Record<string, { open: number; closed: number }> = {};
        tickets.forEach(t => {
            const cat = t.category || 'Other';
            if (!selCatMap[cat]) selCatMap[cat] = { open: 0, closed: 0 };
            const isClosedStatus = t.status === 'closed' || t.status === 'resolved';
            if (isClosedStatus) selCatMap[cat].closed++;
            else selCatMap[cat].open++;
        });
        const selCatRows = Object.entries(selCatMap)
            .map(([label, v]) => ({ label, open: v.open, closed: v.closed, total: v.open + v.closed }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 15);
        const selCatMax = selCatRows[0]?.total || 1;

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(112, 143, 150);
        doc.text('TICKETS BY CATEGORY', catX, catY);
        catY += 8;

        // Legend
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setFillColor(52, 211, 153); doc.roundedRect(catX, catY - 2.5, 3, 3, 0.5, 0.5, 'F');
        doc.setTextColor(100, 100, 100); doc.text('Closed', catX + 5, catY);
        doc.setFillColor(248, 113, 113); doc.roundedRect(catX + 20, catY - 2.5, 3, 3, 0.5, 0.5, 'F');
        doc.text('Open', catX + 25, catY);
        catY += 8;

        selCatRows.forEach((row) => {
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(50, 50, 50);
            const shortLabel = row.label.length > 30 ? row.label.slice(0, 28) + '…' : row.label;
            doc.text(shortLabel, catX, catY);

            doc.setTextColor(150, 150, 150);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.text(`${row.closed} closed · ${row.open} open`, catX + catW - 15, catY, { align: 'right' });

            doc.setFontSize(8);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(40, 40, 40);
            doc.text(String(row.total), catX + catW - 1, catY, { align: 'right' });
            catY += 4;

            const barW = catW - 5;
            doc.setFillColor(240, 240, 240);
            doc.roundedRect(catX, catY, barW, 3, 1, 1, 'F');
            const closedW = (row.closed / selCatMax) * barW;
            if (closedW > 0) { doc.setFillColor(52, 211, 153); doc.roundedRect(catX, catY, closedW, 3, 1, 1, 'F'); }
            const openW = (row.open / selCatMax) * barW;
            if (openW > 0) {
                doc.setFillColor(248, 113, 113);
                if (closedW > 0) doc.rect(catX + closedW, catY, openW, 3, 'F');
                else doc.roundedRect(catX, catY, openW, 3, 1, 1, 'F');
            }
            catY += 7;
        });

        // Helper to load image
        const loadImage = (url: string): Promise<string | null> => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'Anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const maxDim = 1200;
                    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = () => resolve(null);
                img.src = url;
            });
        };

        for (let i = 0; i < tickets.length; i++) {
            if (isCancelledSelectedRef.current) {
                setIsDownloadingSelected(false);
                setDownloadSelectedProgress(0);
                return;
            }
            const ticket = tickets[i];
            setDownloadSelectedProgress(Math.round(((i + 1) / total) * 100));
            doc.addPage();

            const isOpen = ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'waitlist';
            if (isOpen) doc.setFillColor(170, 137, 95); else doc.setFillColor(112, 143, 150);
            doc.rect(0, 0, 210, 15, 'F');

            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text(`${ticket.ticketNumberDisplay} | ${ticket.category || 'Other'}`, 15, 10);
            doc.text(ticket.status.toUpperCase().replace('_', ' '), 180, 10, { align: 'right' });

            doc.setTextColor(30, 30, 30);
            doc.setFontSize(16);
            doc.setFont('helvetica', 'bold');
            const titleLines: string[] = doc.splitTextToSize(ticket.title, 180);
            const clampedTitleLines = titleLines.slice(0, 4);
            const yTitle = 28;
            doc.text(clampedTitleLines, 15, yTitle);

            const yDetails = yTitle + (clampedTitleLines.length * 9) + 4;
            doc.setFillColor(248, 250, 252);
            doc.rect(15, yDetails, 180, 64, 'F');

            doc.setFontSize(8.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(170, 137, 95);
            doc.text('SPOC', 20, yDetails + 10); doc.text('ASSIGNED TO', 110, yDetails + 10);
            doc.text('FLOOR', 20, yDetails + 22); doc.text('LOCATION', 110, yDetails + 22);
            doc.text('REPORTED DATE', 20, yDetails + 34); doc.text('CLOSURE DATE', 110, yDetails + 34);
            doc.text('REPORTED TIME', 20, yDetails + 46); doc.text('CLOSURE TIME', 110, yDetails + 46);

            doc.setFontSize(10.5);
            doc.setTextColor(50, 50, 50);
            doc.setFont('helvetica', 'normal');
            doc.text(ticket.spocName || '-', 20, yDetails + 16); doc.text(ticket.assigneeName || '-', 110, yDetails + 16);
            doc.text(ticket.floorLabel || '-', 20, yDetails + 28); doc.text((ticket.location || '-').slice(0, 38), 110, yDetails + 28);
            doc.text(formatDate(ticket.reportedDate), 20, yDetails + 40); doc.text(formatDate(ticket.closedDate), 110, yDetails + 40);
            doc.text(formatTime(ticket.reportedDate), 20, yDetails + 52); doc.text(formatTime(ticket.closedDate), 110, yDetails + 52);

            const photoWidth = 87;
            const photoHeight = 65;
            const yPhotos = yDetails + 75;

            if (ticket.beforePhoto) {
                const b64 = await loadImage(ticket.beforePhoto);
                if (b64) doc.addImage(b64, 'JPEG', 15, yPhotos, photoWidth, photoHeight);
                else doc.rect(15, yPhotos, photoWidth, photoHeight);
            } else {
                doc.setDrawColor(200, 200, 200);
                doc.rect(15, yPhotos, photoWidth, photoHeight);
                doc.setFontSize(9); doc.setTextColor(150, 150, 150);
                doc.text('No Photo', 57, yPhotos + 32, { align: 'center' });
            }
            doc.setFontSize(8); doc.setTextColor(255, 255, 255);
            doc.setFillColor(0, 0, 0, 0.5);
            doc.rect(15, yPhotos, 20, 6, 'F');
            doc.text('BEFORE', 17, yPhotos + 4.5);

            if (ticket.afterPhoto) {
                const b64 = await loadImage(ticket.afterPhoto);
                if (b64) doc.addImage(b64, 'JPEG', 110, yPhotos, photoWidth, photoHeight, undefined, 'FAST');
                else doc.rect(110, yPhotos, photoWidth, photoHeight);
            } else {
                doc.setDrawColor(200, 200, 200);
                doc.rect(110, yPhotos, photoWidth, photoHeight);
                doc.setFontSize(9); doc.setTextColor(150, 150, 150);
                doc.text(ticket.status === 'closed' || ticket.status === 'resolved' ? 'No Photo' : 'In Progress', 152, yPhotos + 32, { align: 'center' });
            }
            doc.setFontSize(8); doc.setTextColor(255, 255, 255);
            doc.setFillColor(39, 174, 96, 0.7);
            doc.rect(110, yPhotos, 20, 6, 'F');
            doc.text('AFTER', 113, yPhotos + 4.5);
        }

        if (isCancelledSelectedRef.current) {
            setIsDownloadingSelected(false);
            setDownloadSelectedProgress(0);
            return;
        }

        doc.save(`selected_tickets_${month}_${reportData.property.code}.pdf`);
        setIsDownloadingSelected(false);
        setDownloadSelectedProgress(0);
    };

    // Determine if property has any pending_validation tickets
    const hasPendingValidation = reportData?.tickets.some(t => t.status === 'pending_validation') ?? false;

    // Filter tickets based on selected report filter
    const filteredTickets = reportData ? reportData.tickets.filter(t => {
        if (reportFilter === 'open') return ['open', 'in_progress', 'assigned', 'paused'].includes(t.status);
        if (reportFilter === 'pending_validation') return t.status === 'pending_validation';
        if (reportFilter === 'internal') return t.internal === true;
        return true; // 'all'
    }) : [];

    const filterLabel = reportFilter === 'open' ? 'Open & In Progress' : reportFilter === 'pending_validation' ? 'Pending Validation' : reportFilter === 'internal' ? 'Internal Tickets' : 'All Tickets';

    // Group filtered tickets by floor for display
    const ticketsByFloor: Record<string, TicketData[]> = {};
    filteredTickets.forEach(ticket => {
        const floor = ticket.floorLabel;
        if (!ticketsByFloor[floor]) ticketsByFloor[floor] = [];
        ticketsByFloor[floor].push(ticket);
    });

    return (
        <>
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }

                    body {
                        -webkit-print-color-adjust: exact;
                        print-color-adjust: exact;
                        background: white !important;
                        margin: 0 !important;
                    }

                    /* Dashboard summary - force to Page 1 */
                    .dashboard-section {
                        break-after: page !important;
                        padding: 16px !important;
                        margin: 0 !important;
                        box-shadow: none !important;
                    }

                    /* Every ticket wrapper starts on a fresh page */
                    .ticket-wrapper {
                        break-before: page !important;
                        break-inside: avoid !important;
                        margin-bottom: 0 !important;
                    }

                    /* Floor label shown at top of first ticket of each floor */
                    .ticket-floor-label {
                        margin-top: 0 !important;
                        margin-bottom: 12px !important;
                    }

                    .ticket-card-inner {
                        margin-bottom: 0 !important;
                        box-shadow: none !important;
                    }

                    /* Charts grid */
                    .charts-grid {
                        display: grid !important;
                        grid-template-columns: 1fr 1fr !important;
                        gap: 16px !important;
                        min-height: 280px !important;
                    }
                    .chart-container-print {
                        position: relative !important;
                        height: 260px !important;
                        width: 100% !important;
                        overflow: hidden;
                        page-break-inside: avoid;
                    }
                    .chart-container-print canvas {
                        max-width: 100% !important;
                        height: 260px !important;
                    }

                    .kpi-grid { gap: 10px !important; margin-bottom: 20px !important; }
                    .kpi-card { padding: 10px !important; }

                    /* Footer stays with last ticket, no trailing blank page */
                    .report-footer {
                        break-before: avoid !important;
                        margin-top: 16px !important;
                    }

                    .no-print-force { display: none !important; }
                }

                .preparing-overlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(255,255,255,0.8);
                    z-index: 9999;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    backdrop-filter: blur(4px);
                }
            `}</style>

            <div className="min-h-screen bg-[#F5F7FA] p-5 print:p-0 print:bg-white" style={{ fontFamily: "'Roboto', sans-serif" }}>
                <div className="max-w-[1100px] mx-auto">

                    {/* Header Controls — hidden in print */}
                    <div className="no-print flex flex-wrap justify-between items-center gap-3 mb-5">
                        <button
                            onClick={() => router.back()}
                            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                        >
                            <ArrowLeft className="w-5 h-5" />
                            Back to Reports
                        </button>

                        {/* Month Picker */}
                        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2">
                            <button
                                onClick={() => setMonth(prev => changeMonth(prev, -1))}
                                className="p-1 hover:bg-gray-100 rounded transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4 text-gray-600" />
                            </button>
                            <input
                                type="month"
                                value={month}
                                onChange={(e) => setMonth(e.target.value)}
                                className="text-sm font-medium text-gray-700 bg-transparent outline-none"
                                max={getCurrentMonth()}
                            />
                            <button
                                onClick={() => setMonth(prev => changeMonth(prev, 1))}
                                disabled={month >= getCurrentMonth()}
                                className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-40"
                            >
                                <ChevronRight className="w-4 h-4 text-gray-600" />
                            </button>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Report Filter Selector */}
                            <div className="flex items-center bg-gray-100 rounded-lg p-1 gap-1">
                                <button
                                    onClick={() => setReportFilter('all')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${reportFilter === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    All Tickets
                                </button>
                                <button
                                    onClick={() => setReportFilter('open')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${reportFilter === 'open' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Open / In Progress
                                </button>
                                {hasPendingValidation && (
                                    <button
                                        onClick={() => setReportFilter('pending_validation')}
                                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${reportFilter === 'pending_validation' ? 'bg-white text-violet-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        Pending Validation
                                    </button>
                                )}
                                <button
                                    onClick={() => setReportFilter('internal')}
                                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${reportFilter === 'internal' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    Internal
                                </button>
                            </div>

                            <button
                                onClick={handleExportCSV}
                                disabled={!reportData || filteredTickets.length === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                <Download className="w-4 h-4" />
                                export csv
                            </button>
                            {isDownloading ? (
                                <div className="flex items-center bg-[#D4C3B0] text-white px-4 py-2 rounded-full text-sm font-semibold shadow-sm gap-3">
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Downloading {downloadProgress}%</span>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            isCancelledRef.current = true;
                                        }}
                                        className="hover:bg-black/10 rounded-full p-1 transition-colors"
                                        title="Stop downloading"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleDirectDownloadPDF}
                                    className="flex items-center gap-2 bg-[#D4C3B0] text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-[#C4B3A0] transition-colors shadow-sm disabled:opacity-50"
                                    disabled={!reportData || filteredTickets.length === 0}
                                >
                                    <Download className="w-4 h-4" />
                                    Download Report PDF
                                    {isDownloading && <span className="ml-1">({downloadProgress}%)</span>}
                                </button>
                            )}
                            {/* Download Selected PDF button */}
                            {isDownloadingSelected ? (
                                <div className="flex items-center bg-[#708F96] text-white px-4 py-2 rounded-full text-sm font-semibold shadow-sm gap-3">
                                    <div className="flex items-center gap-2">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>Exporting {downloadSelectedProgress}%</span>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); isCancelledSelectedRef.current = true; }}
                                        className="hover:bg-black/10 rounded-full p-1 transition-colors"
                                        title="Cancel"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleDownloadSelectedPDF}
                                    disabled={selectedTicketIds.length === 0 || !reportData}
                                    className="flex items-center gap-2 bg-[#708F96] text-white px-4 py-2 rounded-full text-sm font-semibold hover:bg-[#5a7a80] transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                    title={selectedTicketIds.length === 0 ? 'Select tickets below to enable' : `Download ${selectedTicketIds.length} selected ticket(s)`}
                                >
                                    <FileText className="w-4 h-4" />
                                    Download Selected{selectedTicketIds.length > 0 ? ` (${selectedTicketIds.length})` : ''}
                                </button>
                            )}

                        </div>
                    </div>

                    {/* Loading State */}
                    {isLoading && (
                        <div className="min-h-[400px] flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4">
                                <Loader2 className="w-12 h-12 text-[#708F96] animate-spin" />
                                <p className="text-gray-500 font-medium">Generating Report...</p>
                            </div>
                        </div>
                    )}

                    {/* Error State */}
                    {!isLoading && error && (
                        <div className="min-h-[400px] flex items-center justify-center">
                            <div className="text-center">
                                <p className="text-red-500 font-medium mb-4">{error}</p>
                                <button onClick={fetchReportData} className="px-4 py-2 bg-[#708F96] text-white rounded-lg">
                                    Retry
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Report Content */}
                    {!isLoading && reportData && (
                        <div>
                            {/* Dashboard Section — printed as page 1 */}
                            <div className="bg-white p-5 rounded-xl shadow-sm mb-8 dashboard-section">
                                <h1 className="text-[#708F96] font-light text-2xl border-l-4 border-[#AA895F] pl-4 mb-2">
                                    {reportData.property.name} — {filterLabel}
                                </h1>
                                <p className="text-gray-500 text-sm mb-4">
                                    Period: {reportData.month.label} | Generated: {formatDate(new Date().toISOString())} | Showing {filteredTickets.length} of {reportData.tickets.length} tickets
                                </p>

                                {reportData.tickets.length === 0 ? (
                                    <div className="text-center py-12 text-gray-400">
                                        <p className="text-lg font-medium">No tickets found</p>
                                        <p className="text-sm mt-1">No requests were raised in {reportData.month.label}</p>
                                    </div>
                                ) : (
                                    <>
                                        {/* KPI Cards */}
                                        <div className="grid grid-cols-4 gap-4 mb-6 kpi-grid">
                                            <div className="flex flex-col items-center justify-center p-6 text-center bg-white rounded-xl border-2 border-slate-300 kpi-card">
                                                <span className="text-3xl font-black text-[#1e293b] mb-1">{reportData.kpis.totalSnags}</span>
                                                <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">Total Tickets</span>
                                            </div>
                                            <div className="flex flex-col items-center justify-center p-6 text-center bg-white rounded-xl border-2 border-emerald-400 kpi-card">
                                                <span className="text-3xl font-black text-emerald-600 mb-1">{reportData.kpis.closedSnags}</span>
                                                <span className="text-[10px] uppercase tracking-widest font-black text-emerald-600/70">Closed</span>
                                            </div>
                                            <div className="flex flex-col items-center justify-center p-6 text-center bg-white rounded-xl border-2 border-amber-400 kpi-card">
                                                <span className="text-3xl font-black text-amber-600 mb-1">{reportData.kpis.openSnags}</span>
                                                <span className="text-[10px] uppercase tracking-widest font-black text-amber-600/70">Open / WIP</span>
                                            </div>
                                            <div className="flex flex-col items-center justify-center p-6 text-center bg-white rounded-xl border-2 border-slate-300 kpi-card">
                                                {reportData.kpis.isValidationEnabled ? (
                                                    <>
                                                        <span className="text-3xl font-black text-[#AA895F] mb-1">{reportData.kpis.pendingValidationCount}</span>
                                                        <span className="text-[10px] uppercase tracking-widest font-black text-[#AA895F]/70">Pending Validation</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="text-3xl font-black text-[#1e293b] mb-1">{reportData.kpis.closureRate}%</span>
                                                        <span className="text-[10px] uppercase tracking-widest font-black text-slate-400">Closure Rate</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>

                                        {/* Charts */}
                                        <div className="grid grid-cols-2 gap-5 charts-grid items-start mb-4">
                                            {/* Floor Chart — updates with active filter */}
                                            <div className="relative bg-white border border-gray-100 rounded-xl p-4 shadow-sm h-[280px] chart-container-print">
                                                {filteredTickets.length > 0 ? (
                                                    <canvas id="floorChartReq"></canvas>
                                                ) : (
                                                    <div className="h-full flex flex-col items-center justify-center text-gray-400">
                                                        <p className="text-sm font-medium">No floor data available</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Category Breakdown Table — derived from filteredTickets */}
                                            <div className="bg-gray-50 rounded-xl p-4 min-h-[280px]">
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3">Tickets by Category</p>
                                                <div className="space-y-2">
                                                    {(() => {
                                                        const catMap: Record<string, { open: number; closed: number }> = {};
                                                        filteredTickets.forEach(t => {
                                                            const cat = t.category || 'Other';
                                                            if (!catMap[cat]) catMap[cat] = { open: 0, closed: 0 };
                                                            if (['closed', 'resolved'].includes(t.status)) catMap[cat].closed++;
                                                            else catMap[cat].open++;
                                                        });
                                                        const rows = Object.entries(catMap).map(([label, v]) => ({
                                                            label,
                                                            open: v.open,
                                                            closed: v.closed,
                                                            total: v.open + v.closed,
                                                        })).sort((a, b) => b.total - a.total);
                                                        if (rows.length === 0) return (
                                                            <p className="text-sm text-gray-400 text-center mt-8">No tickets in this filter</p>
                                                        );
                                                        const max = rows[0]?.total || 1;
                                                        return rows.map((row, i) => (
                                                            <div key={i} className="group">
                                                                <div className="flex items-center justify-between mb-0.5">
                                                                    <span className="text-xs font-semibold text-gray-700 truncate max-w-[60%]">{row.label}</span>
                                                                    <div className="flex items-center gap-2 text-[10px] font-bold shrink-0">
                                                                        <span className="text-red-500">{row.open} open</span>
                                                                        <span className="text-gray-300">·</span>
                                                                        <span className="text-emerald-600">{row.closed} closed</span>
                                                                        <span className="bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded ml-1">{row.total}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="h-2 bg-gray-200 rounded-full overflow-hidden flex">
                                                                    <div className="h-full bg-emerald-400 rounded-l-full" style={{ width: `${(row.closed / max) * 100}%` }} />
                                                                    <div className="h-full bg-red-400" style={{ width: `${(row.open / max) * 100}%` }} />
                                                                </div>
                                                            </div>
                                                        ));
                                                    })()}
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-center text-xs text-[#AA895F] mt-3 no-print">
                                            *click on any "floor" bar above to jump to that floor's tickets.
                                        </p>
                                    </>
                                )}
                            </div>

                            {/*
                             * Ticket cards — one per page when printed.
                             * We flatten all floors into a single list. The floor label appears
                             * at the top of the first ticket in each floor group.
                             * CSS: .ticket-wrapper { break-before: page }
                             */}
                            {/* Sticky selection toolbar */}
                            <div className="no-print sticky top-0 z-10 bg-white border border-gray-200 rounded-xl shadow-sm px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <button
                                        onClick={() => {
                                            if (selectedTicketIds.length === filteredTickets.length) {
                                                setSelectedTicketIds([]);
                                            } else {
                                                setSelectedTicketIds(filteredTickets.map(t => t.id));
                                            }
                                        }}
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                                    >
                                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                            selectedTicketIds.length === filteredTickets.length && filteredTickets.length > 0
                                                ? 'bg-[#708F96] border-[#708F96]'
                                                : selectedTicketIds.length > 0
                                                ? 'bg-[#708F96]/40 border-[#708F96]'
                                                : 'border-gray-300'
                                        }`}>
                                            {(selectedTicketIds.length > 0) && <span className="text-white text-[10px] leading-none">✓</span>}
                                        </span>
                                        {selectedTicketIds.length === filteredTickets.length && filteredTickets.length > 0 ? 'Deselect All' : 'Select All'}
                                    </button>
                                    <span className="text-xs text-gray-400 font-medium">
                                        {selectedTicketIds.length > 0
                                            ? <span className="text-[#708F96] font-bold">{selectedTicketIds.length} of {filteredTickets.length} selected</span>
                                            : `${filteredTickets.length} tickets — select to export specific ones`
                                        }
                                    </span>
                                </div>
                                {selectedTicketIds.length > 0 && (
                                    <button
                                        onClick={() => setSelectedTicketIds([])}
                                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                                    >
                                        Clear selection
                                    </button>
                                )}
                            </div>

                            {(() => {
                                const flattenedTickets: { ticket: TicketData; floor: string; isFirstOfFloor: boolean }[] = [];
                                Object.entries(ticketsByFloor).forEach(([floor, floorTickets]) => {
                                    floorTickets.forEach((ticket, idx) => {
                                        flattenedTickets.push({ ticket, floor, isFirstOfFloor: idx === 0 });
                                    });
                                });

                                const ticketsToDisplay = flattenedTickets.slice(0, displayLimit);

                                return (
                                    <>
                                        {ticketsToDisplay.map(({ ticket, floor, isFirstOfFloor }) => {
                                            const isOpen = ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'waitlist';
                                            return (
                                                <div
                                                    key={ticket.id}
                                                    id={isFirstOfFloor ? `floor-${floor.replace(/\s+/g, '-').toLowerCase()}` : undefined}
                                                    className="ticket-wrapper pt-8 first:pt-0"
                                                >
                                                    {isFirstOfFloor && (
                                                        <div className="ticket-floor-label bg-gray-800 text-white px-5 py-3 rounded-lg mb-5 text-lg tracking-wide print:mt-0">
                                                            {floor} tickets ({ticketsByFloor[floor].length})
                                                        </div>
                                                    )}

                                                    <div
                                                        className={`ticket-card-inner bg-white rounded-xl overflow-hidden shadow-sm border mb-6 transition-all cursor-pointer ${
                                                            selectedTicketIds.includes(ticket.id)
                                                                ? 'border-[#708F96] ring-2 ring-[#708F96]/30'
                                                                : 'border-gray-200'
                                                        }`}
                                                        onClick={() => toggleTicket(ticket.id)}
                                                    >
                                                        <div className={`px-5 py-3 flex justify-between items-center ${isOpen ? 'bg-[#AA895F]' : 'bg-[#708F96]'}`}>
                                                            <div className="flex items-center gap-3">
                                                                {/* Checkbox */}
                                                                <span
                                                                    className={`no-print w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                                                                        selectedTicketIds.includes(ticket.id)
                                                                            ? 'bg-white border-white'
                                                                            : 'border-white/60 bg-white/10'
                                                                    }`}
                                                                    onClick={e => { e.stopPropagation(); toggleTicket(ticket.id); }}
                                                                >
                                                                    {selectedTicketIds.includes(ticket.id) && (
                                                                        <span className={`text-[10px] font-black leading-none ${isOpen ? 'text-[#AA895F]' : 'text-[#708F96]'}`}>✓</span>
                                                                    )}
                                                                </span>
                                                                <span className="bg-white/20 text-white px-2 py-1 rounded text-sm font-bold">
                                                                    {ticket.ticketNumberDisplay}
                                                                </span>
                                                                <span className="text-white/90">{ticket.category}</span>
                                                            </div>
                                                            <span className={`text-xs font-bold px-3 py-1 rounded-full ${isOpen
                                                                ? 'bg-[#AA895F] text-white border border-white'
                                                                : 'bg-white text-[#708F96]'
                                                                }`}>
                                                                {ticket.status.replace('_', ' ')}
                                                            </span>
                                                        </div>

                                                        <div className="p-5">
                                                            <h3 className="text-lg font-medium text-gray-800 mb-4">{ticket.title}</h3>
                                                            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg mb-5">
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">SPOC</span>
                                                                    <span className="text-gray-800 text-sm">{ticket.spocName}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Assigned To</span>
                                                                    <span className="text-gray-800 text-sm">{ticket.assigneeName}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Floor</span>
                                                                    <span className="text-gray-800 text-sm">{ticket.floorLabel}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Location</span>
                                                                    <span className="text-gray-800 text-sm">{ticket.location || '-'}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Reported Date</span>
                                                                    <span className="text-gray-800 text-sm">{formatDate(ticket.reportedDate)}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Closure Date</span>
                                                                    <span className="text-gray-800 text-sm">{formatDate(ticket.closedDate)}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Reported Time</span>
                                                                    <span className="text-gray-800 text-sm">{formatTime(ticket.reportedDate)}</span>
                                                                </div>
                                                                <div>
                                                                    <span className="block text-[#AA895F] font-bold text-[10px] uppercase tracking-wider mb-1">Closure Time</span>
                                                                    <span className="text-gray-800 text-sm">{formatTime(ticket.closedDate)}</span>
                                                                </div>
                                                            </div>

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
                                                                            loading="lazy"
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
                                                                            loading="lazy"
                                                                        />
                                                                    ) : (
                                                                        <div className="w-full h-[220px] bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-sm">
                                                                            {ticket.status === 'closed' || ticket.status === 'resolved' ? 'No Photo' : 'In Progress'}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}

                                        {!isDownloading && flattenedTickets.length > displayLimit && (
                                            <div className="no-print flex justify-center py-10">
                                                <button
                                                    onClick={() => setDisplayLimit(prev => prev + 30)}
                                                    className="px-8 py-3 bg-white border-2 border-[#708F96] text-[#708F96] font-bold rounded-xl hover:bg-[#708F96] hover:text-white transition-all transform hover:scale-105 active:scale-95 shadow-sm"
                                                >
                                                    Load More Tickets ({flattenedTickets.length - displayLimit} remaining)
                                                </button>
                                            </div>
                                        )}
                                    </>
                                );
                            })()}


                            {/* Footer */}
                            <div className="report-footer text-center text-sm text-gray-400 py-8 border-t border-gray-200 mt-10">
                                <p>Generated by Autopilot | {reportData.month.label} | {formatDate(new Date().toISOString())}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}
