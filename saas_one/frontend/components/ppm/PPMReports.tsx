/**
 * PPMReports
 * PPM report generation and analytics view.
 * @remarks Client component.
 */

'use client';
import { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Download, TrendingUp, CheckCircle2, Clock, AlertCircle, SkipForward, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
    organizationId: string;
    propertyId?: string;
    properties?: { id: string; name: string }[];
}

interface ReportSummary {
    total: number;
    done: number;
    pending: number;
    postponed: number;
    skipped: number;
    compliance_pct: number;
}

interface SystemRow {
    system_name: string;
    total: number;
    done: number;
    pending: number;
    postponed: number;
    skipped: number;
    compliance_pct: number;
}

interface MonthRow {
    month: string;
    total: number;
    done: number;
    pending: number;
}

interface ReportData {
    summary: ReportSummary;
    by_system: SystemRow[];
    by_month: MonthRow[];
    tasks: Record<string, unknown>[];
}

const currentYear = new Date().getFullYear();

function getDefaultFrom() {
    return `${currentYear}-01-01`;
}
function getDefaultTo() {
    const d = new Date();
    return d.toISOString().split('T')[0];
}

export default function PPMReports({ organizationId, propertyId, properties = [] }: Props) {
    const [fromDate, setFromDate] = useState(getDefaultFrom);
    const [toDate, setToDate] = useState(getDefaultTo);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchReport = useCallback(async () => {
        if (!fromDate || !toDate) return;
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                organization_id: organizationId,
                from_date: fromDate,
                to_date: toDate,
            });
            if (propertyId) params.set('property_id', propertyId);
            const res = await fetch(`/api/ppm/reports?${params}`);
            if (res.ok) {
                const data = await res.json();
                setReportData(data);
            }
        } finally {
            setIsLoading(false);
        }
    }, [organizationId, fromDate, toDate, propertyId]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    const exportExcel = () => {
        if (!reportData) return;
        const wb = XLSX.utils.book_new();

        // Sheet 1: Summary
        const summaryData = [
            ['Metric', 'Value'],
            ['Total Tasks', reportData.summary.total],
            ['Done', reportData.summary.done],
            ['Pending', reportData.summary.pending],
            ['Postponed', reportData.summary.postponed],
            ['Skipped', reportData.summary.skipped],
            ['Compliance %', `${reportData.summary.compliance_pct}%`],
            ['From Date', fromDate],
            ['To Date', toDate],
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryData), 'Summary');

        // Sheet 2: System Breakdown
        const sysHeaders = ['System Name', 'Total', 'Done', 'Pending', 'Postponed', 'Skipped', 'Compliance %'];
        const sysRows = reportData.by_system.map(s => [
            s.system_name, s.total, s.done, s.pending, s.postponed, s.skipped, `${s.compliance_pct}%`
        ]);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([sysHeaders, ...sysRows]), 'By System');

        // Sheet 3: All Raw Tasks
        const taskHeaders = ['SI No', 'System', 'Detail', 'Scope', 'Vendor', 'Location', 'Planned Date', 'Done Date', 'Status', 'Remark'];
        const taskRows = reportData.tasks.map((t: Record<string, unknown>, i: number) => [
            t.si_no || (i + 1),
            t.system_name,
            t.detail_name || '',
            t.scope_of_work || '',
            t.vendor_name || '',
            t.location || '',
            t.planned_date,
            t.done_date || '',
            t.status,
            t.remark || '',
        ]);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([taskHeaders, ...taskRows]), 'All Tasks');

        XLSX.writeFile(wb, `PPM_Report_${fromDate}_to_${toDate}.xlsx`);
    };

    const summary = reportData?.summary;

    return (
        <div className="flex flex-col h-full overflow-auto bg-white p-6 space-y-6">
            {/* Filter Bar */}
            <div className="flex flex-wrap items-end gap-3">
                <div>
                    <label className="text-xs font-black text-slate-600 uppercase tracking-widest block mb-1">From Date</label>
                    <input
                        type="date"
                        value={fromDate}
                        onChange={e => setFromDate(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                <div>
                    <label className="text-xs font-black text-slate-600 uppercase tracking-widest block mb-1">To Date</label>
                    <input
                        type="date"
                        value={toDate}
                        onChange={e => setToDate(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                </div>
                {/* Property selector removed — managed by global layout */}
                <button
                    onClick={fetchReport}
                    disabled={isLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all"
                >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />}
                    Generate Report
                </button>
                {reportData && (
                    <button
                        onClick={exportExcel}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all"
                    >
                        <Download className="w-4 h-4" />
                        Export Excel
                    </button>
                )}
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            )}

            {!isLoading && reportData && (
                <>
                    {/* KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Total Tasks</p>
                            <p className="text-3xl font-black text-slate-900">{summary!.total}</p>
                            <p className="text-xs text-slate-500 mt-1">In selected period</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                            <div className="flex items-center gap-1.5 mb-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <p className="text-xs font-black text-emerald-600 uppercase tracking-widest">Done</p>
                            </div>
                            <p className="text-3xl font-black text-emerald-700">{summary!.done}</p>
                            <p className="text-xs text-emerald-600 mt-1">Compliance: <span className="font-black">{summary!.compliance_pct}%</span></p>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                            <div className="flex items-center gap-1.5 mb-1">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                <p className="text-xs font-black text-amber-600 uppercase tracking-widest">Pending</p>
                            </div>
                            <p className="text-3xl font-black text-amber-700">{summary!.pending}</p>
                            <p className="text-xs text-amber-600 mt-1">Awaiting completion</p>
                        </div>
                        <div className="bg-slate-100 border border-slate-200 rounded-2xl p-4">
                            <div className="flex items-center gap-1.5 mb-1">
                                <SkipForward className="w-3.5 h-3.5 text-slate-500" />
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Skipped/Postponed</p>
                            </div>
                            <p className="text-3xl font-black text-slate-600">{summary!.skipped + summary!.postponed}</p>
                            <p className="text-xs text-slate-500 mt-1">{summary!.postponed} postponed · {summary!.skipped} skipped</p>
                        </div>
                    </div>

                    {/* Bar Chart */}
                    {reportData.by_month.length > 0 && (
                        <div className="border border-slate-100 rounded-2xl p-5">
                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Monthly Trend</h3>
                            <ResponsiveContainer width="100%" height={240}>
                                <BarChart data={reportData.by_month} barSize={20}>
                                    <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 700 }} />
                                    <YAxis tick={{ fontSize: 11 }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                                    />
                                    <Bar dataKey="done" name="Done" fill="#10b981" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* System Breakdown Table */}
                    {reportData.by_system.length > 0 && (
                        <div className="border border-slate-100 rounded-2xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                                <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">System Breakdown</h3>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-100">
                                            <th className="text-left px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">System</th>
                                            <th className="text-right px-3 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Total</th>
                                            <th className="text-right px-3 py-3 text-xs font-black text-emerald-600 uppercase tracking-widest">Done</th>
                                            <th className="text-right px-3 py-3 text-xs font-black text-amber-500 uppercase tracking-widest">Pending</th>
                                            <th className="text-right px-3 py-3 text-xs font-black text-rose-500 uppercase tracking-widest">Postponed</th>
                                            <th className="text-right px-3 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Skipped</th>
                                            <th className="text-right px-5 py-3 text-xs font-black text-slate-500 uppercase tracking-widest">Compliance</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reportData.by_system.map((row, idx) => (
                                            <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                                <td className="px-5 py-3 font-bold text-slate-800">{row.system_name}</td>
                                                <td className="text-right px-3 py-3 text-slate-600 font-semibold">{row.total}</td>
                                                <td className="text-right px-3 py-3 text-emerald-600 font-bold">{row.done}</td>
                                                <td className="text-right px-3 py-3 text-amber-600 font-bold">{row.pending}</td>
                                                <td className="text-right px-3 py-3 text-rose-600 font-bold">{row.postponed}</td>
                                                <td className="text-right px-3 py-3 text-slate-500 font-semibold">{row.skipped}</td>
                                                <td className="text-right px-5 py-3">
                                                    <span className={`text-xs font-black px-2 py-1 rounded-lg ${
                                                        row.compliance_pct >= 80 ? 'bg-emerald-50 text-emerald-700' :
                                                        row.compliance_pct >= 50 ? 'bg-amber-50 text-amber-700' :
                                                        'bg-rose-50 text-rose-700'
                                                    }`}>
                                                        {row.compliance_pct}%
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {reportData.summary.total === 0 && (
                        <div className="text-center py-20 text-slate-400">
                            <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-semibold">No PPM tasks found for this period</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
