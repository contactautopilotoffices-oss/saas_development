'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Play, Trash2, Edit3, ClipboardList, Square, Sparkles, QrCode, LayoutGrid, History, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import Skeleton from '@/frontend/components/ui/Skeleton';
import { Toast } from '@/frontend/components/ui/Toast';
import SOPTemplateFormModal from './SOPTemplateFormModal';
import SOPLayoutAnalyzerModal from './SOPLayoutAnalyzerModal';
import SOPQRModal from './SOPQRModal';
import { frequencyLabel, isDue, fmt12h } from './SOPCompletionHistory';

interface SOPTemplateManagerProps {
    propertyId?: string;
    propertyIds?: string[];
    isAdmin?: boolean;
    userRole?: string;
    onSelectTemplate: (templateId: string) => void;
    onRefresh?: () => void;
    activeView?: 'list' | 'history' | 'reports';
    onViewChange?: (v: 'list' | 'history' | 'reports') => void;
}

const SOPTemplateManager: React.FC<SOPTemplateManagerProps> = ({ propertyId, propertyIds, isAdmin = false, onSelectTemplate, onRefresh, activeView = 'list', onViewChange }) => {
    const isMultiProperty = !!propertyIds && propertyIds.length > 0;
    // In multi-property mode modals need a concrete propertyId — disable them
    const canCreate = isAdmin && !isMultiProperty && !!propertyId;
    const [templates, setTemplates] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showFormModal, setShowFormModal] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<any>(null);
    const [showLayoutAnalyzer, setShowLayoutAnalyzer] = useState(false);
    const [aiPrefill, setAiPrefill] = useState<any>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [qrTemplateId, setQrTemplateId] = useState<string | null>(null);
    const supabase = React.useMemo(() => createClient(), []);
    const [liveNow, setLiveNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setLiveNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    // Live due/upcoming status per template — recalculates every second
    const dueStatusMap = useMemo(() => {
        const map: Record<string, { due: boolean; label: string }> = {};
        for (const t of templates) {
            // Paused templates are never "due" — skip expensive calculation
            if (!t.is_running) {
                map[t.id] = { due: false, label: '' };
                continue;
            }
            const latestDone = (t.completions || [])
                .filter((c: any) => c.status === 'completed')
                .sort((a: any, b: any) => new Date(b.completed_at || b.completion_date).getTime() - new Date(a.completed_at || a.completion_date).getTime())[0];
            map[t.id] = isDue(
                t.frequency,
                latestDone?.completion_date ?? null,
                t.start_time,
                t.end_time,
                latestDone?.completed_at ?? null,
            );
        }
        return map;
    }, [templates, liveNow]);

    const fetchTemplates = async () => {
        try {
            setIsLoading(true);
            let query = supabase
                .from('sop_templates')
                .select(`
                    *,
                    property:properties(name, code),
                    items:sop_checklist_items(*),
                    completions:sop_completions(
                        id,
                        status,
                        completion_date,
                        completed_at,
                        items:sop_completion_items(is_checked, value)
                    )
                `)
                .eq('is_active', true);

            if (isMultiProperty) {
                query = (query as any).in('property_id', propertyIds);
            } else if (propertyId) {
                query = (query as any).eq('property_id', propertyId);
            }

            // Filter by user ID if not admin
            if (!isAdmin) {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                    // Show templates assigned to this user OR open templates (empty assigned_to)
                    query = (query as any).or(`assigned_to.cs.{${user.id}},assigned_to.eq.{}`);
                }

            }

            const { data, error } = await query.order('created_at', { ascending: false });

            if (error) throw error;

            // Process data to get latest completion only
            const processedTemplates = (data || []).map(t => {
                const sortedCompletions = (t.completions || []).sort((a: any, b: any) =>
                    new Date(b.completion_date).getTime() - new Date(a.completion_date).getTime()
                );
                return { ...t, latest_completion: sortedCompletions[0] };
            });

            setTemplates(processedTemplates);
        } catch (err) {
            setToast({ message: 'Error loading templates', type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, [propertyId, propertyIds]);

    const handleToggleRunning = async (templateId: string, newState: boolean) => {
        if (!newState && !confirm('Stop this checklist schedule? The template will remain saved but recurring will pause.')) return;

        try {
            const res = await fetch(`/api/properties/${propertyId}/sop/templates/${templateId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_running: newState }),
            });
            if (!res.ok) throw new Error('Failed to update');

            setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, is_running: newState } : t));
            setToast({ message: newState ? 'Schedule started' : 'Schedule paused', type: 'success' });
            onRefresh?.();
        } catch (err) {
            setToast({ message: 'Error updating schedule', type: 'error' });
        }
    };

    const handleDelete = async (templateId: string) => {
        if (!confirm('Permanently delete this template? This will also remove all historical audit logs for this template.')) return;

        try {
            const { error } = await supabase
                .from('sop_templates')
                .delete()
                .eq('id', templateId);

            if (error) throw error;

            setTemplates(templates.filter(t => t.id !== templateId));
            setToast({ message: 'Template deleted', type: 'success' });
        } catch (err) {
            setToast({ message: 'Error deleting template', type: 'error' });
        }
    };

    const handleFormSuccess = () => {
        setShowFormModal(false);
        setEditingTemplate(null);
        setAiPrefill(null);
        fetchTemplates();
        setToast({ message: editingTemplate ? 'Template updated' : 'Template created', type: 'success' });
        onRefresh?.();
    };

    const handleAITemplateSelect = (data: {
        title: string;
        description: string;
        category: string;
        frequency: string;
        items: { title: string; type: string }[];
    }) => {
        setAiPrefill(data);
        setEditingTemplate(null);
        setShowLayoutAnalyzer(false);
        setShowFormModal(true);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col gap-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
        );
    }

    return (
        <div className="space-y-2 md:space-y-3">
            {/* Action Bar */}
            <div className="flex justify-between items-center bg-slate-50 p-2.5 md:p-3 rounded-lg md:rounded-xl border border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm flex-shrink-0">
                        <ClipboardList size={14} />
                    </div>
                    <div>
                        <h3 className="text-xs md:text-sm font-black text-slate-900 tracking-tight">{isAdmin ? 'Active Templates' : 'My Checklists'}</h3>
                        <p className="text-[7px] md:text-[8px] text-slate-500 font-bold uppercase tracking-widest">{templates.length} {isAdmin ? 'Checklists' : 'Templates'}</p>
                    </div>
                    {onViewChange && (
                        <div className="ml-2 bg-white p-0.5 rounded-lg shadow-sm border border-slate-200 flex items-center gap-0.5">
                            <button
                                onClick={() => onViewChange('list')}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md font-black text-[8px] uppercase tracking-wider transition-all duration-200 ${activeView === 'list' ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                            >
                                <LayoutGrid size={9} />
                                Templates
                            </button>
                            <button
                                onClick={() => onViewChange('history')}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md font-black text-[8px] uppercase tracking-wider transition-all duration-200 ${activeView === 'history' ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                            >
                                <History size={9} />
                                History
                            </button>
                            <button
                                onClick={() => onViewChange('reports')}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md font-black text-[8px] uppercase tracking-wider transition-all duration-200 ${activeView === 'reports' ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'}`}
                            >
                                <FileText size={9} />
                                Reports
                            </button>
                        </div>
                    )}
                </div>

                {canCreate && (
                    <div className="flex items-center gap-1.5">
                        <button
                            onClick={() => setShowLayoutAnalyzer(true)}
                            className="flex items-center gap-1 px-2.5 md:px-3 py-1.5 bg-primary/10 text-primary rounded-lg hover:bg-primary/20 transition-all font-black uppercase tracking-widest text-[8px] md:text-[9px] flex-shrink-0"
                            title="Generate templates from building layout using AI"
                        >
                            <Sparkles size={11} />
                            AI Layout
                        </button>
                        <button
                            onClick={() => {
                                setEditingTemplate(null);
                                setAiPrefill(null);
                                setShowFormModal(true);
                            }}
                            className="flex items-center gap-1 px-2.5 md:px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all shadow-sm font-black uppercase tracking-widest text-[8px] md:text-[9px] flex-shrink-0"
                        >
                            <Plus size={11} />
                            New
                        </button>
                    </div>
                )}
            </div>

            {/* Templates List */}
            <AnimatePresence mode='wait'>
                {templates.length > 0 ? (
                    <div className="flex flex-col gap-2 md:gap-3">
                        {templates.map((template, index) => {
                            const latestComp = template.latest_completion;
                            const compItems = latestComp?.items || [];
                            const checkedCount = compItems.filter((i: any) => i.is_checked || i.value).length;
                            const totalPoints = template.items?.length || 0;
                            const progress = totalPoints > 0 ? (checkedCount / totalPoints) * 100 : 0;
                            const ds = dueStatusMap[template.id];
                            // Only show badge when actionable: overdue/due, countdown, or "starts at"
                            // Hide "Window closed", "All done today", "Not started" etc.
                            const showBadge = ds?.label && (
                                ds.due ||
                                ds.label.startsWith('Next in') ||
                                ds.label.startsWith('Due in') ||
                                ds.label.startsWith('Starts')
                            );
                            const dsBadge = showBadge ? (
                                <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest whitespace-nowrap ${
                                    ds.due
                                        ? 'bg-rose-50 text-rose-600'
                                        : ds.label.startsWith('Next in') || ds.label.startsWith('Due in')
                                            ? 'bg-blue-50 text-blue-600'
                                            : 'bg-amber-50 text-amber-600'
                                }`}>{ds.label}</span>
                            ) : null;

                            return (
                                <motion.div
                                    key={template.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    className={`group relative bg-white border rounded-xl transition-all duration-300 ${template.is_running ? 'border-slate-200 hover:border-primary/30' : 'border-slate-200 opacity-60 grayscale-[40%]'}`}
                                >
                                    {/* ── MOBILE LAYOUT ── */}
                                    <div className="md:hidden p-3">
                                        <div className="flex items-start gap-3">
                                            {/* Donut circle */}
                                            <div className="relative w-10 h-10 flex-shrink-0 mt-0.5">
                                                <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
                                                    <circle cx="20" cy="20" r="16" fill="transparent" stroke="#f1f5f9" strokeWidth="4" />
                                                    <motion.circle
                                                        cx="20" cy="20" r="16" fill="transparent"
                                                        stroke={progress === 100 ? '#10b981' : '#3b82f6'}
                                                        strokeWidth="4"
                                                        strokeDasharray={100.5}
                                                        initial={{ strokeDashoffset: 100.5 }}
                                                        animate={{ strokeDashoffset: 100.5 - (100.5 * progress) / 100 }}
                                                        transition={{ duration: 1, ease: "easeOut" }}
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-[8px] font-black text-slate-900">{Math.round(progress)}%</span>
                                                </div>
                                            </div>

                                            {/* Right column: title + meta + buttons + icons */}
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-black text-sm text-slate-900 leading-tight truncate mb-1">{template.title}</h4>
                                                <div className="flex flex-wrap items-center gap-1 mb-2">
                                                    {isMultiProperty && template.property?.name && (
                                                        <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-600">
                                                            {template.property.name}
                                                        </span>
                                                    )}
                                                    <span className="text-slate-400 font-bold text-[9px] uppercase tracking-widest">
                                                        {latestComp ? `Last: ${new Date(latestComp.completion_date).toLocaleDateString()}` : 'No audit'}
                                                    </span>
                                                    <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                                                        template.category?.toLowerCase() === 'security' ? 'bg-rose-50 text-rose-500' :
                                                        template.category?.toLowerCase() === 'cleaning' ? 'bg-emerald-50 text-emerald-500' :
                                                        'bg-blue-50 text-blue-500'
                                                    }`}>
                                                        {template.category || 'General'}
                                                    </span>
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                        {frequencyLabel(template.frequency)} 
                                                        {(template.start_time || template.end_time) && ` (${template.start_time ? fmt12h(template.start_time) : '—'} – ${template.end_time ? fmt12h(template.end_time) : '—'})`}
                                                        · {totalPoints} pts
                                                    </span>
                                                    {!template.is_running && (
                                                        <span className="px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-500">Paused</span>
                                                    )}
                                                    {template.is_running && dsBadge}
                                                </div>

                                                {/* START / STOP buttons — aligned under text */}
                                                <div className="flex gap-2 mb-2">
                                                    {template.is_running ? (
                                                        <>
                                                             {template.frequency === 'on_demand' && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); onSelectTemplate(template.id); }}
                                                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-primary transition-all"
                                                                >
                                                                    <Play size={10} />
                                                                    Run Now
                                                                </button>
                                                             )}
                                                            {isAdmin && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleToggleRunning(template.id, false); }}
                                                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-rose-500 text-white rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-rose-600 transition-all"
                                                                >
                                                                    <Square size={10} />
                                                                    Stop
                                                                </button>
                                                            )}
                                                        </>
                                                    ) : (
                                                        isAdmin && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleToggleRunning(template.id, true); }}
                                                                className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 text-white rounded-lg font-black uppercase tracking-widest text-[10px] hover:bg-emerald-700 transition-all"
                                                            >
                                                                <Play size={10} />
                                                                Start
                                                            </button>
                                                        )
                                                    )}
                                                </div>

                                                {/* Icon buttons */}
                                                {isAdmin && (
                                                    <div className="flex items-center gap-0.5 pt-1.5 border-t border-slate-100">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setEditingTemplate(template); setShowFormModal(true); }}
                                                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                                        >
                                                            <Edit3 size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setQrTemplateId(template.id); }}
                                                            className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                                        >
                                                            <QrCode size={14} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                                                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* ── DESKTOP LAYOUT ── */}
                                    <div
                                        className={`hidden md:flex items-center gap-4 px-4 py-3 ${isAdmin ? 'cursor-pointer' : ''}`}
                                        onClick={isAdmin ? () => { setEditingTemplate(template); setShowFormModal(true); } : undefined}
                                    >
                                        <div className="relative w-10 h-10 flex-shrink-0">
                                            <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
                                                <circle cx="20" cy="20" r="16" fill="transparent" stroke="#f1f5f9" strokeWidth="4" />
                                                <motion.circle
                                                    cx="20" cy="20" r="16" fill="transparent"
                                                    stroke={progress === 100 ? '#10b981' : '#3b82f6'}
                                                    strokeWidth="4"
                                                    strokeDasharray={100.5}
                                                    initial={{ strokeDashoffset: 100.5 }}
                                                    animate={{ strokeDashoffset: 100.5 - (100.5 * progress) / 100 }}
                                                    transition={{ duration: 1, ease: "easeOut" }}
                                                    strokeLinecap="round"
                                                />
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-[8px] font-black text-slate-900 leading-none">{Math.round(progress)}%</span>
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-black text-sm text-slate-900 leading-tight group-hover:text-primary transition-colors truncate">{template.title}</h4>
                                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                {isMultiProperty && template.property?.name && (
                                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-600">
                                                        {template.property.name}
                                                    </span>
                                                )}
                                                <p className="text-slate-400 font-bold text-[9px] uppercase tracking-widest">
                                                    {latestComp ? `Last: ${new Date(latestComp.completion_date).toLocaleDateString()}` : 'No audit'}
                                                </p>
                                                {isAdmin && (
                                                    <>
                                                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${template.category?.toLowerCase() === 'security' ? 'bg-rose-50 text-rose-500' :
                                                            template.category?.toLowerCase() === 'cleaning' ? 'bg-emerald-50 text-emerald-500' :
                                                                'bg-blue-50 text-blue-500'
                                                            }`}>
                                                            {template.category || 'General'}
                                                        </span>
                                                        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                                                            {frequencyLabel(template.frequency)}
                                                            {(template.start_time || template.end_time) && ` (${template.start_time ? fmt12h(template.start_time) : '—'} – ${template.end_time ? fmt12h(template.end_time) : '—'})`}
                                                            · {totalPoints} pts
                                                        </span>
                                                    </>
                                                )}
                                                {!template.is_running && (
                                                    <span className="px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest bg-slate-100 text-slate-500">Paused</span>
                                                )}
                                                {template.is_running && dsBadge}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {template.is_running ? (
                                                <>
                                                     {template.frequency === 'on_demand' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); onSelectTemplate(template.id); }}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-primary transition-all font-black uppercase tracking-widest text-[9px]"
                                                        >
                                                            <Play size={10} />
                                                            Run Now
                                                        </button>
                                                     )}
                                                    {isAdmin && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleToggleRunning(template.id, false); }}
                                                            className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-all font-black uppercase tracking-widest text-[9px]"
                                                        >
                                                            <Square size={10} />
                                                            Stop
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                isAdmin && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleToggleRunning(template.id, true); }}
                                                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all font-black uppercase tracking-widest text-[9px]"
                                                    >
                                                        <Play size={10} />
                                                        Start
                                                    </button>
                                                )
                                            )}
                                            {isAdmin && (
                                                <>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingTemplate(template); setShowFormModal(true); }}
                                                        className="p-1.5 text-slate-300 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                                    >
                                                        <Edit3 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setQrTemplateId(template.id); }}
                                                        className="p-1.5 text-slate-300 hover:text-primary hover:bg-primary/5 rounded-lg transition-all"
                                                        title="QR Code"
                                                    >
                                                        <QrCode size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}
                                                        className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-14 md:py-24 px-4 md:px-8 bg-slate-50 rounded-2xl md:rounded-[3rem] border-2 border-dashed border-slate-200"
                    >
                        <div className="w-16 h-16 md:w-24 md:h-24 bg-white rounded-2xl md:rounded-3xl border border-slate-100 shadow-sm flex items-center justify-center text-slate-300 mx-auto mb-4 md:mb-6">
                            <ClipboardList size={32} />
                        </div>
                        <h3 className="text-lg md:text-2xl font-black text-slate-900 tracking-tight mb-1.5 md:mb-2">
                            {isAdmin ? 'No Templates Found' : 'No Checklists Assigned'}
                        </h3>
                        <p className="text-slate-500 font-medium text-xs md:text-base max-w-sm mx-auto mb-6 md:mb-8">
                            {isAdmin ? 'Get started by creating your first standard operating procedure.' : 'No checklists have been assigned to your profile yet.'}
                        </p>
                        {isAdmin && (
                            <div className="flex items-center gap-3 justify-center flex-wrap">
                                <button
                                    onClick={() => setShowLayoutAnalyzer(true)}
                                    className="flex items-center gap-2 px-5 md:px-6 py-3 md:py-4 bg-primary/10 text-primary rounded-xl md:rounded-2xl hover:bg-primary/20 transition-all font-black uppercase tracking-widest text-[10px] md:text-xs"
                                >
                                    <Sparkles size={14} />
                                    AI from Layout
                                </button>
                                <button
                                    onClick={() => {
                                        setEditingTemplate(null);
                                        setAiPrefill(null);
                                        setShowFormModal(true);
                                    }}
                                    className="flex items-center gap-2 px-5 md:px-6 py-3 md:py-4 bg-primary text-white rounded-xl md:rounded-2xl hover:opacity-90 transition-all shadow-xl shadow-primary/20 font-black uppercase tracking-widest text-[10px] md:text-xs"
                                >
                                    <Plus size={14} />
                                    Create Manually
                                </button>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modals */}
            <SOPTemplateFormModal
                isOpen={showFormModal}
                onClose={() => {
                    setShowFormModal(false);
                    setEditingTemplate(null);
                    setAiPrefill(null);
                }}
                propertyId={propertyId!}
                template={editingTemplate}
                initialData={aiPrefill ?? undefined}
                onSuccess={handleFormSuccess}
            />

            <SOPLayoutAnalyzerModal
                isOpen={showLayoutAnalyzer}
                onClose={() => setShowLayoutAnalyzer(false)}
                propertyId={propertyId!}
                onSelectTemplate={handleAITemplateSelect}
            />

            {qrTemplateId && (
                <SOPQRModal
                    templateId={qrTemplateId}
                    templateTitle={templates.find(t => t.id === qrTemplateId)?.title || ''}
                    onClose={() => setQrTemplateId(null)}
                />
            )}

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

export default SOPTemplateManager;
