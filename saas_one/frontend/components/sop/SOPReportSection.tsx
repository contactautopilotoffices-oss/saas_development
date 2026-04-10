/**
 * SOPReportSection
 * Daily compliance report for SOP completions at a property.
 * Fetches per-template completion data for a date, renders summary card grid.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Download, FileText, CheckCircle2, XCircle, Clock, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import Skeleton from '@/frontend/components/ui/Skeleton';

interface ReportSummary {
    templateId: string;
    title: string;
    category: string;
    status: 'done' | 'partial' | 'missed';
    completedSlots: number;
    totalSlots: number;
    lastUpdated?: string;
}

interface SOPReportSectionProps {
    propertyId: string;
    isAdmin: boolean;
}

const SOPReportSection: React.FC<SOPReportSectionProps> = ({ propertyId, isAdmin }) => {
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [isLoading, setIsLoading] = useState(true);
    const [summaries, setSummaries] = useState<ReportSummary[]>([]);
    const supabase = createClient();

    const fetchDailyData = async () => {
        try {
            setIsLoading(true);
            // 1. Fetch all active templates
            const { data: templates } = await supabase
                .from('sop_templates')
                .select('*')
                .eq('property_id', propertyId)
                .eq('is_active', true);

            if (!templates) return;

            // 2. Fetch completions for selected date
            const { data: completions } = await supabase
                .from('sop_completions')
                .select('*, items:sop_completion_items(id)')
                .eq('property_id', propertyId)
                .eq('completion_date', selectedDate);

            const allCompletions = completions || [];

            // 3. Process summaries
            const processed: ReportSummary[] = templates.map(t => {
                const templateCompletions = allCompletions.filter(c => c.template_id === t.id);
                const doneCount = templateCompletions.filter(c => c.status === 'completed').length;
                
                // Calculate expected slots
                let expectedSlots = 1;
                const hourlyMatch = t.frequency?.match(/^every_(\d+)_hours?$/);
                if (hourlyMatch && t.start_time && t.end_time) {
                    const intervalH = parseInt(hourlyMatch[1], 10);
                    const [sH, sM] = t.start_time.split(':').map(Number);
                    const [eH, eM] = t.end_time.split(':').map(Number);
                    const mins = (eH * 60 + eM) - (sH * 60 + sM);
                    expectedSlots = Math.floor(mins / (intervalH * 60));
                    if (expectedSlots < 1) expectedSlots = 1;
                }

                return {
                    templateId: t.id,
                    title: t.title,
                    category: t.category || 'General',
                    completedSlots: doneCount,
                    totalSlots: expectedSlots,
                    status: doneCount >= expectedSlots ? 'done' : doneCount > 0 ? 'partial' : 'missed',
                    lastUpdated: templateCompletions.sort((a,b) => b.id.localeCompare(a.id))[0]?.completed_at
                };
            });

            setSummaries(processed);
        } catch (err) {
            console.error('Error fetching report data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchDailyData();
    }, [selectedDate, propertyId]);

    const handleDownloadAll = () => {
        window.open(`/api/properties/${propertyId}/sop/report?date=${selectedDate}`, '_blank');
    };

    const handleDownloadSingle = (id: string) => {
        window.open(`/api/properties/${propertyId}/sop/report?templateId=${id}&date=${selectedDate}`, '_blank');
    };

    return (
        <div className="space-y-6">
            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-primary shadow-sm">
                        <FileText size={20} />
                    </div>
                    <div>
                        <h3 className="text-sm font-black text-slate-900 tracking-tight">Consolidated Daily Report</h3>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Audit Summary & Exports</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Calendar size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                        />
                    </div>
                    <button
                        onClick={handleDownloadAll}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-primary transition-all shadow-lg shadow-slate-900/10 font-black uppercase tracking-widest text-[10px]"
                    >
                        <Download size={14} />
                        Download All
                    </button>
                </div>
            </div>

            {/* Summaries List */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-2xl" />)}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {summaries.length > 0 ? summaries.map((s, idx) => (
                        <motion.div
                            key={s.templateId}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm hover:shadow-md hover:border-primary/20 transition-all group"
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className={`p-2 rounded-xl ${
                                    s.status === 'done' ? 'bg-emerald-50 text-emerald-600' :
                                    s.status === 'partial' ? 'bg-amber-50 text-amber-600' :
                                    'bg-rose-50 text-rose-600'
                                }`}>
                                    {s.status === 'done' ? <CheckCircle2 size={16} /> :
                                     s.status === 'partial' ? <Clock size={16} /> :
                                     <XCircle size={16} />}
                                </div>
                                <button
                                    onClick={() => handleDownloadSingle(s.templateId)}
                                    className="p-2 text-slate-300 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                    title="Download Single CSV"
                                >
                                    <Download size={14} />
                                </button>
                            </div>

                            <h4 className="text-sm font-black text-slate-900 truncate mb-1" title={s.title}>{s.title}</h4>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-3">{s.category}</p>

                            <div className="flex items-center justify-between border-t border-slate-50 pt-3 mt-auto">
                                <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Status</p>
                                    <p className={`text-[10px] font-black uppercase tracking-wider ${
                                        s.status === 'done' ? 'text-emerald-600' :
                                        s.status === 'partial' ? 'text-amber-600' :
                                        'text-rose-600'
                                    }`}>
                                        {s.completedSlots}/{s.totalSlots} Complete
                                    </p>
                                </div>
                                <ChevronRight size={14} className="text-slate-200 group-hover:text-primary transition-all" />
                            </div>
                        </motion.div>
                    )) : (
                        <div className="col-span-full py-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                             <FileText size={40} className="mx-auto text-slate-300 mb-3" />
                             <p className="text-slate-500 font-bold text-sm">No checklists active for this date</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SOPReportSection;
