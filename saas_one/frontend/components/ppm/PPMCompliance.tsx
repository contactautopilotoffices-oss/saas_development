/**
 * PPMCompliance
 * PPM compliance tracking showing done/pending/missed tasks.
 * @remarks Client component.
 */

'use client';
import { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';

interface Props {
    organizationId: string;
    propertyId?: string;
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
}

const PIE_COLORS = {
    done: '#10b981',
    pending: '#f59e0b',
    postponed: '#f43f5e',
    skipped: '#94a3b8',
};

const ALL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PPMCompliance({ organizationId, propertyId }: Props) {
    const currentYear = new Date().getFullYear();
    const [year, setYear] = useState(currentYear);
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchReport = useCallback(async () => {
        setIsLoading(true);
        try {
            const fromDate = `${year}-01-01`;
            const toDate = `${year}-12-31`;
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
    }, [organizationId, propertyId, year]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    const summary = reportData?.summary;

    // Build full 12-month chart data
    const chartData = ALL_MONTHS.map((monthName, idx) => {
        const label = `${monthName} ${year}`;
        const found = reportData?.by_month.find(m => m.month === label);
        return {
            month: monthName,
            done: found?.done || 0,
            pending: found?.pending || 0,
        };
    });

    // Donut chart data
    const pieData = summary ? [
        { name: 'Done', value: summary.done, color: PIE_COLORS.done },
        { name: 'Pending', value: summary.pending, color: PIE_COLORS.pending },
        { name: 'Postponed', value: summary.postponed, color: PIE_COLORS.postponed },
        { name: 'Skipped', value: summary.skipped, color: PIE_COLORS.skipped },
    ].filter(d => d.value > 0) : [];

    // Overall compliance ring (SVG)
    const pct = summary?.compliance_pct || 0;
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (pct / 100) * circumference;
    const ringColor = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#f43f5e';

    return (
        <div className="flex flex-col h-full overflow-auto bg-white p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900">PPM Compliance Dashboard</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Full-year compliance overview</p>
                </div>
                {/* Year selector */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setYear(y => y - 1)}
                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        <ChevronLeft className="w-4 h-4 text-slate-600" />
                    </button>
                    <span className="text-lg font-black text-slate-900 min-w-[60px] text-center">{year}</span>
                    <button
                        onClick={() => setYear(y => y + 1)}
                        disabled={year >= currentYear}
                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors disabled:opacity-30"
                    >
                        <ChevronRight className="w-4 h-4 text-slate-600" />
                    </button>
                </div>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            )}

            {!isLoading && summary && (
                <>
                    {/* KPI Row */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-start">
                        {/* Overall Compliance Ring */}
                        <div className="col-span-2 md:col-span-1 flex flex-col items-center justify-center bg-slate-50 border border-slate-100 rounded-2xl p-4">
                            <svg width="130" height="130" viewBox="0 0 130 130">
                                <circle cx="65" cy="65" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="10" />
                                <circle
                                    cx="65" cy="65" r={radius}
                                    fill="none"
                                    stroke={ringColor}
                                    strokeWidth="10"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={dashOffset}
                                    strokeLinecap="round"
                                    transform="rotate(-90 65 65)"
                                    style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                                />
                                <text x="65" y="60" textAnchor="middle" className="text-2xl font-black" style={{ fontSize: 22, fontWeight: 900, fill: ringColor }}>
                                    {pct}%
                                </text>
                                <text x="65" y="80" textAnchor="middle" style={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}>
                                    Compliance
                                </text>
                            </svg>
                        </div>

                        {/* KPI cards */}
                        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Tasks</p>
                            <p className="text-2xl font-black text-slate-900">{summary.total}</p>
                        </div>
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Completed</p>
                            <p className="text-2xl font-black text-emerald-700">{summary.done}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1">Pending</p>
                            <p className="text-2xl font-black text-amber-700">{summary.pending}</p>
                        </div>
                        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4">
                            <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Postponed + Skipped</p>
                            <p className="text-2xl font-black text-rose-600">{summary.postponed + summary.skipped}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Donut Chart */}
                        {pieData.length > 0 && (
                            <div className="border border-slate-100 rounded-2xl p-5">
                                <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Status Distribution</h3>
                                <ResponsiveContainer width="100%" height={220}>
                                    <PieChart>
                                        <Pie
                                            data={pieData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={55}
                                            outerRadius={85}
                                            paddingAngle={3}
                                            dataKey="value"
                                        >
                                            {pieData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }}
                                            formatter={(value, name) => [`${value} tasks`, name]}
                                        />
                                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        )}

                        {/* Monthly Trend */}
                        <div className="border border-slate-100 rounded-2xl p-5">
                            <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest mb-4">Monthly Trend {year}</h3>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={chartData} barSize={14}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10, fontWeight: 700 }} />
                                    <YAxis tick={{ fontSize: 10 }} />
                                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 11 }} />
                                    <Bar dataKey="done" name="Done" fill="#10b981" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="pending" name="Pending" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* System Compliance Table with progress bars */}
                    {(reportData?.by_system || []).length > 0 && (
                        <div className="border border-slate-100 rounded-2xl overflow-hidden">
                            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                                <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">System Compliance</h3>
                            </div>
                            <div className="divide-y divide-slate-50">
                                {(reportData?.by_system || []).map((row, idx) => {
                                    const color = row.compliance_pct >= 80 ? 'bg-emerald-500' :
                                        row.compliance_pct >= 50 ? 'bg-amber-400' : 'bg-rose-500';
                                    const textColor = row.compliance_pct >= 80 ? 'text-emerald-700' :
                                        row.compliance_pct >= 50 ? 'text-amber-700' : 'text-rose-700';
                                    const bgColor = row.compliance_pct >= 80 ? 'bg-emerald-50' :
                                        row.compliance_pct >= 50 ? 'bg-amber-50' : 'bg-rose-50';
                                    return (
                                        <div key={idx} className="px-5 py-3 hover:bg-slate-50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-sm font-bold text-slate-800 truncate">{row.system_name}</span>
                                                        <span className={`text-xs font-black px-2 py-0.5 rounded-lg ml-2 flex-shrink-0 ${bgColor} ${textColor}`}>
                                                            {row.compliance_pct}%
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full rounded-full transition-all ${color}`}
                                                                style={{ width: `${Math.min(100, row.compliance_pct)}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[11px] text-slate-400 font-semibold flex-shrink-0 w-16 text-right">
                                                            {row.done}/{row.total}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {summary.total === 0 && (
                        <div className="text-center py-20 text-slate-400">
                            <p className="text-sm font-semibold">No PPM tasks found for {year}</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
