'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, Upload, X, CheckCircle2, Clock, AlertCircle, SkipForward, Loader2, FileSpreadsheet, CalendarDays, Camera, FileText, Receipt, Building2, LayoutDashboard } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/frontend/context/AuthContext';

interface PPMSchedule {
    id: string;
    si_no: string | null;
    system_name: string;
    detail_name: string | null;
    scope_of_work: string | null;
    frequency: string;
    vendor_name: string | null;
    vendor_id?: string | null;
    maintenance_vendors?: { id: string; company_name: string; contact_person: string; phone: string } | null;
    location: string | null;
    maker: string | null;
    checker: string | null;
    planned_date: string;
    done_date: string | null;
    remark: string | null;
    status: 'pending' | 'done' | 'postponed' | 'skipped';
    completion_photos: string[] | null;
    completion_doc_url: string | null;
    invoice_url: string | null;
    verification_status?: 'pending' | 'submitted' | 'verified' | 'rejected';
    attachments?: Record<string, any> | null;
}

interface Props {
    organizationId: string;
    propertyId?: string;
    properties?: { id: string; name: string }[];
}

const STATUS_CONFIG = {
    pending: { label: 'Pending', color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', icon: Clock },
    done: { label: 'Done', color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
    postponed: { label: 'Postponed', color: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', icon: AlertCircle },
    skipped: { label: 'Skipped', color: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-200', icon: SkipForward },
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

export default function PPMCalendar({ organizationId, propertyId, properties = [] }: Props) {
    const { membership } = useAuth();
    const today = new Date();

    const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
    const [viewYear, setViewYear] = useState(today.getFullYear());
    const [schedules, setSchedules] = useState<PPMSchedule[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedTask, setSelectedTask] = useState<PPMSchedule | null>(null);
    const [isUpdating, setIsUpdating] = useState(false);

    // Upload state
    // Active property filter — can be overridden locally when viewing as org admin
    const [activePropertyId, setActivePropertyId] = useState(propertyId || '');
    const [showPropDropdown, setShowPropDropdown] = useState(false);

    const [showUpload, setShowUpload] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadPropertyId, setUploadPropertyId] = useState(propertyId || '');
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResult, setUploadResult] = useState<{ success?: boolean; message?: string } | null>(null);
    const [isClearing, setIsClearing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);

    // Task update form
    const [editStatus, setEditStatus] = useState<PPMSchedule['status']>('pending');
    const [editDoneDate, setEditDoneDate] = useState('');
    const [editRemark, setEditRemark] = useState('');
    const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);

    const fetchSchedules = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                organization_id: organizationId,
                month: String(viewMonth),
                year: String(viewYear),
            });
            if (activePropertyId) params.set('property_id', activePropertyId);
            const res = await fetch(`/api/ppm/schedules?${params}`);
            if (res.ok) {
                const data = await res.json();
                setSchedules(data.schedules || []);
            }
        } finally {
            setIsLoading(false);
        }
    }, [organizationId, activePropertyId, viewMonth, viewYear]);

    useEffect(() => { fetchSchedules(); }, [fetchSchedules]);

    // Group schedules by date
    const byDate = schedules.reduce<Record<string, PPMSchedule[]>>((acc, s) => {
        const d = s.planned_date;
        if (!acc[d]) acc[d] = [];
        acc[d].push(s);
        return acc;
    }, {});

    // Calendar grid
    const firstDay = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    const calendarCells: (number | null)[] = [
        ...Array(firstDay).fill(null),
        ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (calendarCells.length % 7 !== 0) calendarCells.push(null);

    const prevMonth = () => {
        if (viewMonth === 1) { setViewMonth(12); setViewYear(y => y - 1); }
        else setViewMonth(m => m - 1);
        setSelectedDate(null);
    };
    const nextMonth = () => {
        if (viewMonth === 12) { setViewMonth(1); setViewYear(y => y + 1); }
        else setViewMonth(m => m + 1);
        setSelectedDate(null);
    };

    const dateStr = (day: number) =>
        `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const handleDayClick = (day: number) => {
        const d = dateStr(day);
        setSelectedDate(d);
        setSelectedTask(null);
    };

    const handleTaskClick = (task: PPMSchedule) => {
        setSelectedTask(task);
        setEditStatus(task.status);
        setEditDoneDate(task.done_date || '');
        setEditRemark(task.remark || '');
    };

    const handleUpdateTask = async () => {
        if (!selectedTask) return;
        setIsUpdating(true);
        try {
            const res = await fetch(`/api/ppm/schedules/${selectedTask.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: editStatus,
                    done_date: editStatus === 'done' ? (editDoneDate || new Date().toISOString().split('T')[0]) : null,
                    remark: editRemark || null,
                }),
            });
            if (res.ok) {
                await fetchSchedules();
                setSelectedTask(null);
            }
        } finally {
            setIsUpdating(false);
        }
    };

    const handleAttachmentUpload = async (file: File, attachType: 'photo' | 'doc' | 'invoice') => {
        if (!selectedTask) return;
        setIsUploadingAttachment(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('attach_type', attachType);
            const res = await fetch(`/api/ppm/schedules/${selectedTask.id}/attachments`, { method: 'POST', body: fd });
            const data = await res.json();
            if (res.ok) {
                if (attachType === 'photo') {
                    setSelectedTask(prev => prev ? { ...prev, completion_photos: [...(prev.completion_photos || []), data.url] } : null);
                } else if (attachType === 'doc') {
                    setSelectedTask(prev => prev ? { ...prev, completion_doc_url: data.url } : null);
                } else {
                    setSelectedTask(prev => prev ? { ...prev, invoice_url: data.url } : null);
                }
                await fetchSchedules();
            }
        } finally {
            setIsUploadingAttachment(false);
        }
    };

    const handleAttachmentDelete = async (url: string, attachType: 'photo' | 'doc' | 'invoice') => {
        if (!selectedTask) return;
        const res = await fetch(`/api/ppm/schedules/${selectedTask.id}/attachments?url=${encodeURIComponent(url)}&attach_type=${attachType}`, { method: 'DELETE' });
        if (res.ok) {
            if (attachType === 'photo') {
                setSelectedTask(prev => prev ? { ...prev, completion_photos: (prev.completion_photos || []).filter(p => p !== url) } : null);
            } else if (attachType === 'doc') {
                setSelectedTask(prev => prev ? { ...prev, completion_doc_url: null } : null);
            } else {
                setSelectedTask(prev => prev ? { ...prev, invoice_url: null } : null);
            }
            await fetchSchedules();
        }
    };

    const handleUpload = async () => {
        if (!uploadFile) return;
        setIsUploading(true);
        setUploadResult(null);
        try {
            const fd = new FormData();
            fd.append('file', uploadFile);
            fd.append('organization_id', organizationId);
            if (uploadPropertyId) fd.append('property_id', uploadPropertyId);
            const res = await fetch('/api/ppm/upload', { method: 'POST', body: fd });
            const data = await res.json();
            if (res.ok) {
                setUploadResult({ success: true, message: `${data.inserted} tasks imported successfully.` });
                await fetchSchedules();
                setTimeout(() => { setShowUpload(false); setUploadFile(null); setUploadResult(null); }, 2000);
            } else {
                setUploadResult({ success: false, message: data.error || 'Upload failed' });
            }
        } finally {
            setIsUploading(false);
        }
    };

    // Determine if this user is a property-scoped admin (not org-level)
    const isPropertyAdmin = membership?.org_role === 'property_admin' ||
        (!['org_super_admin', 'org_admin', 'admin', 'owner'].includes(membership?.org_role || '') && !!propertyId);

    // For property admins: always use their property. For org admins: use the selected property in the upload modal.
    const clearPropertyId = isPropertyAdmin ? propertyId : (uploadPropertyId || undefined);

    const handleClearData = async () => {
        // Org-level admins must select a property before clearing
        if (!isPropertyAdmin && !clearPropertyId) {
            setUploadResult({ success: false, message: 'Please select a property to clear PPM data for.' });
            return;
        }
        setIsClearing(true);
        try {
            const res = await fetch('/api/ppm/clear', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: organizationId,
                    property_id: clearPropertyId,
                }),
            });
            if (res.ok) {
                setShowClearConfirm(false);
                setUploadResult({ success: true, message: 'PPM data cleared successfully.' });
                await fetchSchedules();
            } else {
                const d = await res.json();
                setUploadResult({ success: false, message: d.error || 'Clear failed' });
            }
        } finally {
            setIsClearing(false);
        }
    };

    const dayTasks = selectedDate ? (byDate[selectedDate] || []) : [];

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                <div className="flex items-center gap-4">
                    <button onClick={prevMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <ChevronLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <h2 className="text-xl font-black text-slate-900 min-w-[180px] text-center">
                        {MONTH_NAMES[viewMonth - 1]} {viewYear}
                    </h2>
                    <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <ChevronRight className="w-5 h-5 text-slate-600" />
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    {/* Property selector — shown only when org admin (no locked propertyId) */}
                    {!propertyId && properties.length > 0 && (
                        <div className="relative">
                            <button
                                onClick={() => setShowPropDropdown(v => !v)}
                                className="flex items-center gap-3 bg-surface-elevated border border-border rounded-xl px-4 py-2.5 hover:border-primary transition-all min-w-[180px]"
                            >
                                <div className="w-6 h-6 rounded-lg bg-background flex items-center justify-center">
                                    <Building2 className="w-3.5 h-3.5 text-text-tertiary" />
                                </div>
                                <span className="text-sm font-medium text-text-primary flex-1 text-left truncate">
                                    {activePropertyId ? properties.find(p => p.id === activePropertyId)?.name : 'All Properties'}
                                </span>
                                <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${showPropDropdown ? 'rotate-180' : ''}`} />
                            </button>

                            <AnimatePresence>
                                {showPropDropdown && (
                                    <>
                                        <div className="fixed inset-0 z-[60]" onClick={() => setShowPropDropdown(false)} />
                                        <motion.div
                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                            className="absolute right-0 mt-2 w-72 bg-surface-elevated rounded-2xl shadow-2xl border border-border z-[70] overflow-hidden"
                                        >
                                            <div className="p-2 border-b border-border">
                                                <button
                                                    onClick={() => { setActivePropertyId(''); setUploadPropertyId(''); setSelectedDate(null); setShowPropDropdown(false); }}
                                                    className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${!activePropertyId ? 'bg-primary text-text-inverse' : 'text-text-secondary hover:bg-background'}`}
                                                >
                                                    <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                                                        <LayoutDashboard className="w-4 h-4" />
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-xs font-black uppercase tracking-tight">All Properties</p>
                                                        <p className="text-[10px] text-text-tertiary font-medium">{properties.length} Locations</p>
                                                    </div>
                                                </button>
                                            </div>
                                            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                                                {properties.map(p => (
                                                    <button
                                                        key={p.id}
                                                        onClick={() => { setActivePropertyId(p.id); setUploadPropertyId(p.id); setSelectedDate(null); setShowPropDropdown(false); }}
                                                        className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${activePropertyId === p.id ? 'bg-primary text-text-inverse' : 'text-text-secondary hover:bg-background'}`}
                                                    >
                                                        <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                                                            <Building2 className="w-4 h-4 text-slate-400" />
                                                        </div>
                                                        <p className="text-xs font-black uppercase tracking-tight truncate text-left">{p.name}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                    {/* Legend */}
                    <div className="hidden md:flex items-center gap-3 text-xs font-semibold">
                        {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                            <span key={key} className="flex items-center gap-1.5">
                                <span className={`w-2.5 h-2.5 rounded-full ${cfg.color}`} />
                                {cfg.label}
                            </span>
                        ))}
                    </div>
                    <button
                        onClick={() => setShowUpload(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all"
                    >
                        <Upload className="w-4 h-4" />
                        Upload Excel
                    </button>
                </div>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Calendar Grid */}
                <div className="flex-1 overflow-auto p-4">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        </div>
                    ) : (
                        <>
                            {/* Day headers */}
                            <div className="grid grid-cols-7 mb-2">
                                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                                    <div key={d} className="text-center text-xs font-black text-slate-400 uppercase tracking-widest py-2">{d}</div>
                                ))}
                            </div>
                            {/* Cells */}
                            <div className="grid grid-cols-7 gap-1">
                                {calendarCells.map((day, idx) => {
                                    if (!day) return <div key={idx} />;
                                    const d = dateStr(day);
                                    const tasks = byDate[d] || [];
                                    const isToday = d === today.toISOString().split('T')[0];
                                    const isSelected = d === selectedDate;
                                    const doneCnt = tasks.filter(t => t.status === 'done').length;
                                    const pendingCnt = tasks.filter(t => t.status === 'pending').length;
                                    const postponedCnt = tasks.filter(t => t.status === 'postponed').length;

                                    return (
                                        <div
                                            key={d}
                                            onClick={() => handleDayClick(day)}
                                            className={`min-h-[90px] rounded-xl border p-2 cursor-pointer transition-all
                                                ${isSelected ? 'border-primary bg-primary/5 shadow-sm' : 'border-slate-100 hover:border-primary/40 hover:bg-slate-50'}
                                                ${isToday ? 'ring-2 ring-primary' : ''}
                                            `}
                                        >
                                            <div className={`text-sm font-black mb-1.5 w-7 h-7 flex items-center justify-center rounded-full
                                                ${isToday ? 'bg-primary text-white' : 'text-slate-700'}`}>
                                                {day}
                                            </div>
                                            {tasks.length > 0 && (
                                                <div className="space-y-0.5">
                                                    {/* Status dots */}
                                                    <div className="flex flex-wrap gap-1 mb-1">
                                                        {pendingCnt > 0 && <span className="w-2 h-2 rounded-full bg-amber-500" title="Pending" />}
                                                        {doneCnt > 0 && <span className="w-2 h-2 rounded-full bg-emerald-500" title="Done" />}
                                                        {postponedCnt > 0 && <span className="w-2 h-2 rounded-full bg-rose-500" title="Postponed" />}
                                                    </div>
                                                    {/* Task pills — show up to 2 */}
                                                    {tasks.slice(0, 2).map(t => (
                                                        <div
                                                            key={t.id}
                                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate ${STATUS_CONFIG[t.status].bg} ${STATUS_CONFIG[t.status].text}`}
                                                        >
                                                            {t.system_name}
                                                        </div>
                                                    ))}
                                                    {tasks.length > 2 && (
                                                        <div className="text-[10px] font-black text-slate-400">+{tasks.length - 2} more</div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Side Panel — Day Detail */}
                {selectedDate && (
                    <div className="w-80 border-l border-slate-100 flex flex-col" style={{ maxHeight: 'calc(100vh - 64px)', position: 'sticky', top: 0 }}>
                        <div className="flex items-center justify-between p-4 border-b border-slate-100 flex-shrink-0">
                            <div>
                                <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Tasks for</p>
                                <p className="text-lg font-black text-slate-900">
                                    {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </p>
                            </div>
                            <button onClick={() => setSelectedDate(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-2">
                            {dayTasks.length === 0 ? (
                                <div className="text-center py-10 text-slate-400">
                                    <CalendarDays className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                    <p className="text-sm font-semibold">No tasks scheduled</p>
                                </div>
                            ) : dayTasks.map(task => {
                                const cfg = STATUS_CONFIG[task.status];
                                const Icon = cfg.icon;
                                return (
                                    <div
                                        key={task.id}
                                        onClick={() => handleTaskClick(task)}
                                        className={`p-3 rounded-xl border cursor-pointer hover:shadow-sm transition-all ${cfg.bg} ${cfg.border}`}
                                    >
                                        <div className="flex items-start gap-2">
                                            <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.text}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-xs font-black ${cfg.text}`}>{task.system_name}</p>
                                                {task.detail_name && <p className="text-[10px] text-slate-600 truncate">{task.detail_name}</p>}
                                                {task.vendor_name && <p className="text-[10px] text-slate-500 mt-0.5">Vendor: {task.vendor_name}</p>}
                                                {task.location && <p className="text-[10px] text-slate-500">📍 {task.location}</p>}
                                                {task.remark && <p className="text-[10px] text-slate-500 italic mt-1">"{task.remark}"</p>}
                                                {task.verification_status === 'submitted' && (
                                                    <span className="inline-block mt-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-bold rounded-md">
                                                        PROOF SUBMITTED — REVIEW
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Task Update Modal */}
            {selectedTask && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setSelectedTask(null)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 flex-shrink-0">
                            <div>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Update Task</p>
                                <h3 className="text-lg font-black text-slate-900">{selectedTask.system_name}</h3>
                            </div>
                            <button onClick={() => setSelectedTask(null)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4 overflow-y-auto flex-1">
                            {/* Info */}
                            <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1 text-slate-600">
                                {selectedTask.detail_name && <p><span className="font-bold">Equipment:</span> {selectedTask.detail_name}</p>}
                                {selectedTask.scope_of_work && <p><span className="font-bold">Scope:</span> {selectedTask.scope_of_work}</p>}
                                {(selectedTask.vendor_name || selectedTask.maintenance_vendors) && (
                                    <div className="flex items-start gap-1">
                                        <span className="font-bold shrink-0">Vendor:</span>
                                        {selectedTask.maintenance_vendors ? (
                                            <span className="flex flex-col gap-0.5">
                                                <span className="font-semibold text-primary">{selectedTask.maintenance_vendors.company_name}</span>
                                                <span className="text-slate-500">{selectedTask.maintenance_vendors.contact_person} · {selectedTask.maintenance_vendors.phone}</span>
                                            </span>
                                        ) : (
                                            <span>{selectedTask.vendor_name}</span>
                                        )}
                                    </div>
                                )}
                                {selectedTask.location && <p><span className="font-bold">Location:</span> {selectedTask.location}</p>}
                                {selectedTask.maker && <p><span className="font-bold">Maker:</span> {selectedTask.maker} {selectedTask.checker ? `· Checker: ${selectedTask.checker}` : ''}</p>}
                                <p><span className="font-bold">Planned:</span> {new Date(selectedTask.planned_date + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                            </div>

                            {/* Status */}
                            <div>
                                <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-2 block">Status</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {(Object.entries(STATUS_CONFIG) as [PPMSchedule['status'], typeof STATUS_CONFIG['pending']][]).map(([key, cfg]) => {
                                        const Icon = cfg.icon;
                                        return (
                                            <button
                                                key={key}
                                                onClick={() => setEditStatus(key)}
                                                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all
                                                    ${editStatus === key ? `${cfg.bg} ${cfg.border} ${cfg.text}` : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                                {cfg.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Done Date */}
                            {editStatus === 'done' && (
                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Completion Date</label>
                                    <input
                                        type="date"
                                        value={editDoneDate}
                                        onChange={e => setEditDoneDate(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                            )}

                            {/* Remark */}
                            <div>
                                <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Remark / Notes</label>
                                <textarea
                                    value={editRemark}
                                    onChange={e => setEditRemark(e.target.value)}
                                    placeholder="Add notes or closure remarks..."
                                    className="w-full h-20 px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                />
                            </div>

                            {/* Completion Proof — hidden when vendor has submitted/verified proof */}
                            {editStatus === 'done' && !['submitted', 'verified'].includes(selectedTask.verification_status || '') && (
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest block">Completion Proof</label>

                                    {/* Photos */}
                                    <div className="border border-slate-200 rounded-xl p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Camera className="w-3.5 h-3.5 text-slate-500" />
                                            <span className="text-xs font-bold text-slate-600">Photos</span>
                                            <label className="ml-auto cursor-pointer">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    multiple
                                                    className="hidden"
                                                    disabled={isUploadingAttachment}
                                                    onChange={async e => {
                                                        const files = Array.from(e.target.files || []);
                                                        for (const f of files) await handleAttachmentUpload(f, 'photo');
                                                        e.target.value = '';
                                                    }}
                                                />
                                                <span className="text-xs font-bold text-primary px-2 py-1 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                                                    {isUploadingAttachment ? '...' : '+ Add'}
                                                </span>
                                            </label>
                                        </div>
                                        {(selectedTask.completion_photos || []).length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {(selectedTask.completion_photos || []).map((photoUrl, idx) => (
                                                    <div key={idx} className="relative group">
                                                        <img src={photoUrl} alt={`Photo ${idx + 1}`} className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                                                        <button
                                                            onClick={() => handleAttachmentDelete(photoUrl, 'photo')}
                                                            className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <X className="w-2.5 h-2.5" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[11px] text-slate-400">No photos uploaded yet</p>
                                        )}
                                    </div>

                                    {/* Completion Certificate */}
                                    <div className="border border-slate-200 rounded-xl p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <FileText className="w-3.5 h-3.5 text-slate-500" />
                                            <span className="text-xs font-bold text-slate-600">Completion Certificate</span>
                                        </div>
                                        {selectedTask.completion_doc_url ? (
                                            <div className="flex items-center gap-2">
                                                <a href={selectedTask.completion_doc_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary underline">View Certificate</a>
                                                <button
                                                    onClick={() => handleAttachmentDelete(selectedTask.completion_doc_url!, 'doc')}
                                                    className="text-rose-500 hover:text-rose-700 transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="cursor-pointer">
                                                <input
                                                    type="file"
                                                    accept=".pdf,.doc,.docx"
                                                    className="hidden"
                                                    disabled={isUploadingAttachment}
                                                    onChange={async e => {
                                                        const f = e.target.files?.[0];
                                                        if (f) await handleAttachmentUpload(f, 'doc');
                                                        e.target.value = '';
                                                    }}
                                                />
                                                <span className="text-xs font-bold text-primary px-2 py-1 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                                                    {isUploadingAttachment ? 'Uploading...' : 'Upload PDF'}
                                                </span>
                                            </label>
                                        )}
                                    </div>

                                    {/* Invoice */}
                                    <div className="border border-slate-200 rounded-xl p-3">
                                        <div className="flex items-center gap-2 mb-2">
                                            <Receipt className="w-3.5 h-3.5 text-slate-500" />
                                            <span className="text-xs font-bold text-slate-600">Invoice</span>
                                        </div>
                                        {selectedTask.invoice_url ? (
                                            <div className="flex items-center gap-2">
                                                <a href={selectedTask.invoice_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-primary underline">View Invoice</a>
                                                <button
                                                    onClick={() => handleAttachmentDelete(selectedTask.invoice_url!, 'invoice')}
                                                    className="text-rose-500 hover:text-rose-700 transition-colors"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="cursor-pointer">
                                                <input
                                                    type="file"
                                                    accept=".pdf,.doc,.docx"
                                                    className="hidden"
                                                    disabled={isUploadingAttachment}
                                                    onChange={async e => {
                                                        const f = e.target.files?.[0];
                                                        if (f) await handleAttachmentUpload(f, 'invoice');
                                                        e.target.value = '';
                                                    }}
                                                />
                                                <span className="text-xs font-bold text-primary px-2 py-1 border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
                                                    {isUploadingAttachment ? 'Uploading...' : 'Upload PDF'}
                                                </span>
                                            </label>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Vendor Proof Verification Panel */}
                            {selectedTask.verification_status === 'submitted' && (
                                <div className="border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
                                    <p className="text-xs font-bold text-blue-800 uppercase tracking-wide">Vendor Submitted Proof — Review Required</p>
                                    {/* Show attachments from new jsonb column */}
                                    {selectedTask.attachments && Object.keys(selectedTask.attachments).length > 0 && (
                                        <div className="space-y-2">
                                            {Array.isArray(selectedTask.attachments.photos) && selectedTask.attachments.photos.map((url: string, i: number) => (
                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-2 text-xs text-blue-700 underline">
                                                    <Camera className="w-3.5 h-3.5" /> Photo {i + 1}
                                                </a>
                                            ))}
                                            {selectedTask.attachments.certificate && (
                                                <a href={selectedTask.attachments.certificate} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-2 text-xs text-blue-700 underline">
                                                    <FileText className="w-3.5 h-3.5" /> Completion Certificate
                                                </a>
                                            )}
                                            {selectedTask.attachments.invoice && (
                                                <a href={selectedTask.attachments.invoice} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-2 text-xs text-blue-700 underline">
                                                    <Receipt className="w-3.5 h-3.5" /> Invoice
                                                </a>
                                            )}
                                        </div>
                                    )}
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            onClick={async () => {
                                                setIsUpdating(true);
                                                await fetch(`/api/ppm/schedules/${selectedTask.id}`, {
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ verification_status: 'verified' }),
                                                });
                                                setSchedules(prev => prev.map(s => s.id === selectedTask.id ? { ...s, verification_status: 'verified' } : s));
                                                setSelectedTask(t => t ? { ...t, verification_status: 'verified' } : t);
                                                setIsUpdating(false);
                                            }}
                                            disabled={isUpdating}
                                            className="flex-1 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-60 flex items-center justify-center gap-1"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                                        </button>
                                        <button
                                            onClick={async () => {
                                                setIsUpdating(true);
                                                await fetch(`/api/ppm/schedules/${selectedTask.id}`, {
                                                    method: 'PATCH',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ verification_status: 'rejected', status: 'pending' }),
                                                });
                                                setSchedules(prev => prev.map(s => s.id === selectedTask.id ? { ...s, verification_status: 'rejected', status: 'pending' } : s));
                                                setSelectedTask(t => t ? { ...t, verification_status: 'rejected', status: 'pending' } : t);
                                                setIsUpdating(false);
                                            }}
                                            disabled={isUpdating}
                                            className="flex-1 py-2 bg-red-50 text-red-600 border border-red-200 text-xs font-bold rounded-xl hover:bg-red-100 disabled:opacity-60 flex items-center justify-center gap-1"
                                        >
                                            <X className="w-3.5 h-3.5" /> Reject
                                        </button>
                                    </div>
                                </div>
                            )}

                            {selectedTask.verification_status === 'verified' && (
                                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                                    <div className="flex items-center gap-2 text-emerald-700 text-xs font-bold">
                                        <CheckCircle2 className="w-4 h-4" /> Vendor proof verified
                                    </div>
                                    {/* Always show uploaded docs for reference */}
                                    {selectedTask.attachments && (
                                        <div className="space-y-1.5 pt-1 border-t border-emerald-100">
                                            <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Uploaded Documents</p>
                                            {Array.isArray(selectedTask.attachments.photos) && selectedTask.attachments.photos.map((url: string, i: number) => (
                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-2 text-xs text-emerald-700 hover:underline">
                                                    <Camera className="w-3.5 h-3.5 flex-shrink-0" /> Photo {i + 1}
                                                </a>
                                            ))}
                                            {selectedTask.attachments.certificate && (
                                                <a href={selectedTask.attachments.certificate} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-2 text-xs text-emerald-700 hover:underline">
                                                    <FileText className="w-3.5 h-3.5 flex-shrink-0" /> Completion Certificate
                                                </a>
                                            )}
                                            {selectedTask.attachments.invoice && (
                                                <a href={selectedTask.attachments.invoice} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-2 text-xs text-emerald-700 hover:underline">
                                                    <Receipt className="w-3.5 h-3.5 flex-shrink-0" /> Invoice
                                                </a>
                                            )}
                                            {!selectedTask.attachments.photos?.length && !selectedTask.attachments.certificate && !selectedTask.attachments.invoice && (
                                                <p className="text-[10px] text-emerald-500 italic">No documents attached</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={handleUpdateTask}
                                disabled={isUpdating}
                                className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                            >
                                {isUpdating ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : 'Save Update'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Upload Modal */}
            {showUpload && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowUpload(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-slate-100">
                            <div>
                                <h3 className="text-lg font-black text-slate-900">Upload 52-Week PPM</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Excel format: SI No · System · Details · Scope · Frequency · Vendor · Location · Maker · Checker · [Month triplets]</p>
                            </div>
                            <button onClick={() => setShowUpload(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            {/* Property selector */}
                            {properties.length > 0 && (
                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Property</label>
                                    <select
                                        value={uploadPropertyId}
                                        onChange={e => setUploadPropertyId(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="">All Properties (Org-level)</option>
                                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {/* File drop zone */}
                            <label className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-2xl cursor-pointer transition-all
                                ${uploadFile ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 hover:border-primary/50 hover:bg-slate-50'}`}>
                                <input
                                    type="file"
                                    accept=".xlsx,.xls,.csv"
                                    className="hidden"
                                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                                />
                                {uploadFile ? (
                                    <>
                                        <FileSpreadsheet className="w-8 h-8 text-emerald-500 mb-2" />
                                        <p className="text-sm font-bold text-emerald-700">{uploadFile.name}</p>
                                        <p className="text-xs text-emerald-500">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                                    </>
                                ) : (
                                    <>
                                        <Upload className="w-8 h-8 text-slate-300 mb-2" />
                                        <p className="text-sm font-bold text-slate-500">Click to select Excel file</p>
                                        <p className="text-xs text-slate-400">.xlsx or .xls</p>
                                    </>
                                )}
                            </label>

                            {uploadResult && (
                                <div className={`px-4 py-3 rounded-xl text-sm font-bold ${uploadResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                    {uploadResult.message}
                                </div>
                            )}

                            <button
                                onClick={handleUpload}
                                disabled={!uploadFile || isUploading}
                                className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                            >
                                {isUploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : 'Import PPM Schedule'}
                            </button>

                            <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                                Re-uploading will replace all existing PPM data for this property. Data starts from row 4. Columns after Checker should be month triplets (Planned Date · Done Date · Remark).
                            </p>

                            {/* Danger zone — clear all data */}
                            <div className="border-t border-slate-100 pt-3 mt-1">
                                {!showClearConfirm ? (
                                    <button
                                        onClick={() => setShowClearConfirm(true)}
                                        className="w-full py-2 text-xs font-bold text-rose-500 hover:bg-rose-50 rounded-lg transition-all border border-rose-200"
                                    >
                                        🗑️ Clear All PPM Data
                                    </button>
                                ) : (
                                    <div className="bg-rose-50 rounded-xl p-3 space-y-2">
                                        {isPropertyAdmin ? (
                                            <p className="text-xs font-bold text-rose-700 text-center">
                                                This will permanently delete all PPM records for <span className="underline">{properties.find(p => p.id === propertyId)?.name || 'this property'}</span>. Are you sure?
                                            </p>
                                        ) : (
                                            <>
                                                <p className="text-xs font-bold text-rose-700 text-center">Select a property to clear its PPM data:</p>
                                                <select
                                                    value={uploadPropertyId}
                                                    onChange={e => setUploadPropertyId(e.target.value)}
                                                    className="w-full px-3 py-2 border border-rose-300 rounded-lg text-xs bg-white text-slate-700"
                                                >
                                                    <option value="">— Select property —</option>
                                                    {properties.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                                {uploadPropertyId && (
                                                    <p className="text-xs text-rose-600 text-center">
                                                        Will delete all PPM records for <strong>{properties.find(p => p.id === uploadPropertyId)?.name}</strong>.
                                                    </p>
                                                )}
                                            </>
                                        )}
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setShowClearConfirm(false)}
                                                className="flex-1 py-2 text-xs font-bold border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleClearData}
                                                disabled={isClearing || (!isPropertyAdmin && !uploadPropertyId)}
                                                className="flex-1 py-2 text-xs font-bold bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-60 flex items-center justify-center gap-1"
                                            >
                                                {isClearing ? <><Loader2 className="w-3 h-3 animate-spin" /> Clearing...</> : 'Yes, Delete All'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
