'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/frontend/utils/supabase/client';
import Skeleton from '@/frontend/components/ui/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { History, User, Calendar, CheckCircle2, Clock, Trash2, Play, Eye, AlertTriangle, Square, LayoutGrid, Timer, XCircle, ChevronDown, ChevronUp, Download, FileText } from 'lucide-react';

interface SOPCompletionHistoryProps {
    propertyId?: string;
    propertyIds?: string[];
    onSelectTemplate: (templateId: string, completionId?: string) => void;
    onViewDetail: (completionId: string) => void;
    isAdmin?: boolean;
    userRole?: string;
    activeView?: 'list' | 'history' | 'reports';
    onViewChange?: (v: 'list' | 'history' | 'reports') => void;
}

/** Parse every_N_hour(s) frequency → interval in hours, or null */
function parseHourlyInterval(frequency: string): number | null {
    const m = frequency.match(/^every_(\d+)_hours?$/);
    return m ? parseInt(m[1]) : null;
}

/** Human-readable label for any frequency value */
export function frequencyLabel(frequency: string): string {
    const hourly = parseHourlyInterval(frequency);
    if (hourly) return hourly === 1 ? 'Every 1 hr' : `Every ${hourly} hrs`;
    const map: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', on_demand: 'On Demand' };
    return map[frequency] ?? frequency;
}

/** Format milliseconds → "Xh Ym Zs" countdown string */
function fmtRemaining(ms: number): string {
    const totalSecs = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

/** Format HH:MM (24h) → "H:MM AM/PM" */
export function fmt12h(hhmm: string): string {
    const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Compute the slot window a completion belongs to, e.g. "09:00 – 12:00" */
function getCompletionSlot(
    timestampStr: string | null,
    frequency: string,
    startTime?: string | null,
): string | null {
    const intervalHours = parseHourlyInterval(frequency);
    if (!intervalHours || !startTime || !timestampStr) return null;

    const dt = new Date(timestampStr);
    const [sH, sM] = startTime.slice(0, 5).split(':').map(Number);
    const startMins = sH * 60 + sM;
    const dtMins = dt.getHours() * 60 + dt.getMinutes();
    const elapsed = dtMins - startMins;
    if (elapsed < 0) return null;

    const slotIndex = Math.floor(elapsed / (intervalHours * 60));
    const slotStartMins = startMins + slotIndex * intervalHours * 60;
    const slotEndMins = slotStartMins + intervalHours * 60;

    const fmt = (mins: number) => {
        const h = Math.floor(mins / 60) % 24;
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };
    return `${fmt(slotStartMins)} – ${fmt(slotEndMins)}`;
}

/** Returns the slot start as "HH:MM" for the current moment, or null for non-hourly templates.
 *  Respects endTime — if we're past the last valid slot, returns null. */
function computeCurrentSlotStart(frequency: string, startTime: string | null, now: Date, endTime?: string | null): string | null {
    const intervalH = parseHourlyInterval(frequency);
    if (!intervalH || !startTime) return null;
    const [sH, sM] = startTime.slice(0, 5).split(':').map(Number);
    const startMins = sH * 60 + sM;
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const elapsed = nowMins - startMins;
    if (elapsed < 0) return null;

    // Compute the raw slot start
    let slotStartMins = startMins + Math.floor(elapsed / (intervalH * 60)) * intervalH * 60;

    // Clamp to the last valid slot: a slot is valid only if its END fits within endTime
    if (endTime) {
        const [eH, eM] = endTime.slice(0, 5).split(':').map(Number);
        const endMins = eH * 60 + eM;
        // Find the last valid slot start (whose end <= endMins)
        const lastValidSlotStart = startMins + Math.floor((endMins - startMins - intervalH * 60) / (intervalH * 60)) * intervalH * 60;
        if (lastValidSlotStart < startMins) return null; // no valid slots at all
        if (slotStartMins > lastValidSlotStart) {
            // We're past the last valid slot — window is effectively closed
            return null;
        }
    }

    const h = Math.floor(slotStartMins / 60) % 24;
    const mn = slotStartMins % 60;
    return `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

// Helper: check if a template is due based on frequency, time window, and last completion
export function isDue(
    frequency: string,
    lastCompletionDate: string | null,
    startTime?: string | null,
    endTime?: string | null,
    lastCompletedAt?: string | null,   // actual TIMESTAMPTZ of last completed run
    startedAt?: string | null,         // when is_running was turned ON (for first-day slot offset)
): { due: boolean; label: string } {
    if (frequency === 'on_demand') return { due: false, label: '' };

    const now = new Date();
    const intervalHours = parseHourlyInterval(frequency);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ── Helper: is startedAt on today? ───────────────────────────────────────
    const startedToday = startedAt
        ? new Date(new Date(startedAt).getFullYear(), new Date(startedAt).getMonth(), new Date(startedAt).getDate()).getTime() === today.getTime()
        : false;
    const startedAtMins = startedAt && startedToday
        ? new Date(startedAt).getHours() * 60 + new Date(startedAt).getMinutes()
        : null;

    // ── Global window pre-checks (apply even if only one side is set) ────────
    if (startTime) {
        const [sH, sM] = startTime.slice(0, 5).split(':').map(Number);
        const startMinsT = sH * 60 + sM;
        // On the day template was started, if started AFTER start_time, use started_at as effective open
        const effectiveOpen = (startedAtMins !== null && startedAtMins > startMinsT) ? startedAtMins : startMinsT;
        if (nowMins < effectiveOpen)
            return { due: false, label: `Starts at ${fmt12h(startTime)}` };
    }
    if (endTime) {
        const [eH, eM] = endTime.slice(0, 5).split(':').map(Number);
        if (nowMins > eH * 60 + eM)
            return { due: false, label: `Window closed (${fmt12h(endTime)})` };
    }

    // ── Hourly + time window → daily-reset schedule logic ───────────────────
    if (intervalHours !== null && startTime && endTime) {
        const [sH, sM] = startTime.slice(0, 5).split(':').map(Number);
        const [eH, eM] = endTime.slice(0, 5).split(':').map(Number);
        const startMins = sH * 60 + sM;
        const endMins = eH * 60 + eM;

        // On the first day, first slot starts at max(start_time, started_at_time)
        const effectiveStartMins = (startedAtMins !== null && startedAtMins > startMins)
            ? startedAtMins
            : startMins;

        // Build today's scheduled slots from effective start
        // Only create slots whose window (start → start+interval) fits within end_time
        const todaySlots: Date[] = [];
        for (let t = effectiveStartMins; t + intervalHours * 60 <= endMins; t += intervalHours * 60) {
            todaySlots.push(new Date(now.getFullYear(), now.getMonth(), now.getDate(), Math.floor(t / 60), t % 60, 0, 0));
        }

        const passedSlots = todaySlots.filter(s => s <= now);
        if (passedSlots.length === 0) return { due: false, label: `Starts at ${fmt12h(startTime)}` };

        const currentSlot = passedSlots[passedSlots.length - 1];

        const lastDone = lastCompletedAt ? new Date(lastCompletedAt) : null;
        if (lastDone && lastDone >= currentSlot) {
            const nextSlot = todaySlots.find(s => s > now);
            if (!nextSlot) return { due: false, label: 'All done today' };
            return { due: false, label: `Next in ${fmtRemaining(nextSlot.getTime() - now.getTime())}` };
        }

        const overdueMins = Math.floor((now.getTime() - currentSlot.getTime()) / 60000);
        if (overdueMins < 2) return { due: true, label: 'Due now' };
        const oh = Math.floor(overdueMins / 60), om = overdueMins % 60;
        const label = oh > 0 ? (om > 0 ? `Overdue ${oh}h ${om}m` : `Overdue ${oh}h`) : `Overdue ${overdueMins}m`;
        return { due: true, label };
    }

    // ── Hourly without time window ───────────────────────────────────────────
    if (intervalHours !== null) {
        const lastTs = lastCompletedAt ? new Date(lastCompletedAt) : lastCompletionDate ? new Date(lastCompletionDate) : null;
        if (!lastTs) return { due: true, label: 'Not started' };

        const diffMs = now.getTime() - lastTs.getTime();
        const intervalMs = intervalHours * 60 * 60 * 1000;
        const remainingMs = intervalMs - diffMs;
        if (remainingMs > 0) return { due: false, label: `Next in ${fmtRemaining(remainingMs)}` };
        const overdueMins = Math.floor((diffMs - intervalMs) / 60000);
        const oh = Math.floor(overdueMins / 60), om = overdueMins % 60;
        return { due: true, label: oh > 0 ? (om > 0 ? `Overdue ${oh}h ${om}m` : `Overdue ${oh}h`) : `Overdue ${overdueMins}m` };
    }

    // ── Daily / weekly / monthly ─────────────────────────────────────────────
    if (!lastCompletionDate) return { due: true, label: 'Not started' };

    const last = new Date(lastCompletionDate);
    const diffMs = now.getTime() - last.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    const isSameDay = today.getTime() === lastDay.getTime();

    if (frequency === 'daily') {
        if (isSameDay) return { due: false, label: 'Done today' };
        return { due: true, label: 'Due today' };
    }
    if (frequency === 'weekly') {
        if (diffDays < 7) return { due: false, label: `Due in ${7 - diffDays}d` };
        if (diffDays === 7) return { due: true, label: 'Due today' };
        return { due: true, label: `Overdue by ${diffDays - 7}d` };
    }
    if (frequency === 'monthly') {
        if (diffDays < 30) return { due: false, label: `Due in ${30 - diffDays}d` };
        if (diffDays === 30) return { due: true, label: 'Due today' };
        return { due: true, label: `Overdue by ${diffDays - 30}d` };
    }

    return { due: false, label: '' };
}

const SOPCompletionHistory: React.FC<SOPCompletionHistoryProps> = ({ propertyId, propertyIds, onSelectTemplate, onViewDetail, isAdmin = false, userRole, activeView = 'history', onViewChange }) => {
    const isMultiProperty = !!propertyIds && propertyIds.length > 0;
    const [completions, setCompletions] = useState<any[]>([]);
    const [rawTemplateData, setRawTemplateData] = useState<Array<{ template: any; latestCompletion: any; lastDate: string | null }>>([]);
    const [missedAlerts, setMissedAlerts] = useState<any[]>([]);
    const [showMissed, setShowMissed] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [liveNow, setLiveNow] = useState(() => new Date());
    const supabase = React.useMemo(() => createClient(), []);

    // Tick every second so ring + label update live
    useEffect(() => {
        const id = setInterval(() => setLiveNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const fetchData = useMemo(() => async () => {
        try {
                setIsLoading(true);

                const { data: { user } } = await supabase.auth.getUser();

                // Fetch completions
                let completionQuery = supabase
                    .from('sop_completions')
                    .select(`
                        *,
                        template:sop_templates(title, frequency, category, start_time, end_time),
                        user:users(full_name),
                        items:sop_completion_items(is_checked, value)
                    `)
                    .order('completion_date', { ascending: false })
                    .limit(50);

                if (isMultiProperty) {
                    completionQuery = (completionQuery as any).in('property_id', propertyIds);
                } else if (propertyId) {
                    completionQuery = (completionQuery as any).eq('property_id', propertyId);
                }

                // No per-user filter — all staff see shared completions for their applicable templates
                const { data: completionData, error: completionError } = await completionQuery;


                if (completionError) throw completionError;
                const results = completionData || [];
                setCompletions(results);

                // Fetch all active + running templates to determine due SOPs
                let templateQuery = supabase
                    .from('sop_templates')
                    .select('id, title, frequency, category, assigned_to, start_time, end_time, started_at')
                    .eq('is_active', true)
                    .eq('is_running', true)
                    .neq('frequency', 'on_demand');

                if (isMultiProperty) {
                    templateQuery = (templateQuery as any).in('property_id', propertyIds);
                } else if (propertyId) {
                    templateQuery = (templateQuery as any).eq('property_id', propertyId);
                }

                const { data: templates, error: templateError } = await templateQuery;
                if (templateError) throw templateError;

                let applicableTemplates = templates || [];
                if (!isAdmin) {
                    const { data: { user } } = await supabase.auth.getUser();
                    if (user) {
                        // Empty assigned_to = open to all staff; otherwise check if user is in list
                        applicableTemplates = applicableTemplates.filter(t =>
                            !t.assigned_to || t.assigned_to.length === 0 || t.assigned_to.includes(user.id)
                        );
                    } else {
                        applicableTemplates = [];
                    }
                }


                // Store raw rows — live due/upcoming computed in useMemo every second
                const rows = applicableTemplates.map(template => {
                    const templateCompletions = results.filter(
                        (c: any) => c.template_id === template.id && c.status === 'completed'
                    );
                    // Sort by completed_at DESC to get the TRUE latest completion
                    const sorted = [...templateCompletions].sort((a, b) => {
                        const tA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
                        const tB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
                        return tB - tA;
                    });
                    const latestCompletion = sorted[0] ?? null;
                    return { template, latestCompletion, lastDate: latestCompletion?.completion_date ?? null };
                });
                setRawTemplateData(rows);

                // Fetch missed alerts for applicable templates (last 30 days)
                const applicableIds = applicableTemplates.map(t => t.id);
                if (applicableIds.length > 0) {
                    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
                    const { data: missed } = await supabase
                        .from('sop_missed_alerts')
                        .select('id, slot_time, template_id, template:sop_templates(title, frequency)')
                        .in('template_id', applicableIds)
                        .gte('created_at', since)
                        .order('slot_time', { ascending: false })
                        .limit(100);
                    setMissedAlerts(missed || []);
                }
            } catch (err: any) {
                console.error('Error loading data:', err?.message ?? err?.error_description ?? JSON.stringify(err) ?? err);
            } finally {
                setIsLoading(false);
            }
    }, [propertyId, propertyIds, supabase, isAdmin, userRole]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 60_000);
        const onVisible = () => { if (document.visibilityState === 'visible') fetchData(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [fetchData]);

    const handleCancelSession = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to stop/cancel this active session? Information entered will be lost.')) return;

        try {
            const { error } = await supabase
                .from('sop_completions')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setCompletions(prev => prev.filter(c => c.id !== id));
        } catch (err) {
            console.error('Error canceling session:', err);
            alert('Failed to stop the session.');
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this audit record? This cannot be undone.')) return;

        try {
            const { error } = await supabase
                .from('sop_completions')
                .delete()
                .eq('id', id);

            if (error) throw error;

            setCompletions(prev => prev.filter(c => c.id !== id));
        } catch (err) {
            console.error('Error deleting completion:', err);
            alert('Failed to delete the audit record.');
        }
    };

    // ── Live-computed values (recalculate every second via liveNow) ──────────
    const { dueTemplates, upcomingTemplates, stats, clientMissedCount } = useMemo(() => {
        const due: any[] = [];
        const upcoming: any[] = [];

        for (const { template, latestCompletion, lastDate } of rawTemplateData) {
            const dueStatus = isDue(
                template.frequency, lastDate,
                template.start_time, template.end_time,
                latestCompletion?.completed_at,
                template.started_at
            );
            if (dueStatus.due) {
                const isHourly = /^every_\d+_hours?$/.test(template.frequency);
                const currentSlot = computeCurrentSlotStart(template.frequency, template.start_time, liveNow, template.end_time);

                const slotMatch = (c: any) => {
                    if (c.template_id !== template.id) return false;
                    if (!isHourly) {
                        // Daily/weekly: match any completion for today's date
                        const today = liveNow.toISOString().slice(0, 10);
                        return c.completion_date === today;
                    }
                    if (!currentSlot) return false; // hourly but can't compute slot (no start_time)
                    if (c.slot_time) return c.slot_time.slice(0, 5) === currentSlot;
                    return getCompletionSlot(c.created_at, template.frequency, template.start_time)?.startsWith(currentSlot) ?? false;
                };

                const inProgress = completions.find((c: any) => c.status === 'in_progress' && slotMatch(c));
                const slotCompleted = completions.find((c: any) => c.status === 'completed' && slotMatch(c));

                // Current slot already done — don't show in DUE list
                if (slotCompleted && !inProgress) continue;

                due.push({ ...template, dueLabel: dueStatus.label, inProgressId: inProgress?.id || null, slotCompletedId: slotCompleted?.id || null });
            } else if (
                dueStatus.label &&
                !dueStatus.label.startsWith('Done') &&
                !dueStatus.label.startsWith('All done') &&
                !dueStatus.label.startsWith('Window closed')
            ) {
                const intervalHours = parseHourlyInterval(template.frequency);
                let progressPct = 0;
                if (intervalHours !== null) {
                    const lastTs = latestCompletion?.completed_at
                        ? new Date(latestCompletion.completed_at)
                        : lastDate ? new Date(lastDate) : null;
                    if (lastTs) {
                        const elapsedMs = liveNow.getTime() - lastTs.getTime();
                        progressPct = Math.min(100, Math.max(0, (elapsedMs / (intervalHours * 3600000)) * 100));
                    }
                }
                upcoming.push({ ...template, upcomingLabel: dueStatus.label, progressPct });
            }
        }

        // Count in-progress completions whose time window has already closed (overdue)
        const overdueCount = completions.filter((c: any) => {
            if (c.status !== 'in_progress') return false;
            const tmpl = c.template;
            if (!tmpl) return false;
            const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
            if (tmpl.end_time) {
                const [eH, eM] = tmpl.end_time.slice(0, 5).split(':').map(Number);
                if (nowMins > eH * 60 + eM) return true;
            }
            const intervalH = parseHourlyInterval(tmpl.frequency);
            if (intervalH && c.created_at) {
                const elapsed = liveNow.getTime() - new Date(c.created_at).getTime();
                if (elapsed > intervalH * 3_600_000) return true;
            }
            return false;
        }).length;

        // ── Client-side missed slot computation (supplements cron-based sop_missed_alerts) ──
        let clientMissedCount = 0;
        const todayStr = liveNow.toISOString().slice(0, 10);
        for (const { template } of rawTemplateData) {
            const intervalH = parseHourlyInterval(template.frequency);
            if (!intervalH || !template.start_time || !template.end_time) continue;

            const [sH, sM] = template.start_time.slice(0, 5).split(':').map(Number);
            const [eH, eM] = template.end_time.slice(0, 5).split(':').map(Number);
            const startMins = sH * 60 + sM;
            const endMins = eH * 60 + eM;

            for (let t = startMins; t + intervalH * 60 <= endMins; t += intervalH * 60) {
                const slotDate = new Date(liveNow.getFullYear(), liveNow.getMonth(), liveNow.getDate(), Math.floor(t / 60), t % 60, 0, 0);
                // Skip slots whose window hasn't closed yet
                const slotEnd = new Date(slotDate.getTime() + intervalH * 3_600_000);
                if (slotEnd > liveNow) continue;
                // Skip slots before template was started
                if (template.started_at && slotDate < new Date(template.started_at)) continue;

                const slotTimeStr = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
                const done = completions.some((c: any) =>
                    c.template_id === template.id &&
                    c.status === 'completed' &&
                    c.slot_time?.startsWith(slotTimeStr) &&
                    c.completion_date === todayStr
                );
                if (!done) clientMissedCount++;
            }
        }

        return {
            dueTemplates: due,
            upcomingTemplates: upcoming,
            stats: {
                total: completions.length,
                completed: completions.filter((c: any) => c.status === 'completed').length,
                pending: completions.filter((c: any) => c.status === 'in_progress').length,
                due: due.length,
                overdue: overdueCount,
            },
            clientMissedCount,
        };
    }, [rawTemplateData, completions, liveNow]);

    if (isLoading) {
        return (
            <div className="space-y-4">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-3xl" />)}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Tab switcher — only shown when admin passes onViewChange */}
            {onViewChange && (
                <div className="flex items-center">
                    <div className="bg-slate-50 p-0.5 rounded-lg border border-slate-200 flex items-center gap-0.5">
                        <button
                            onClick={() => onViewChange('list')}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md font-black text-[8px] uppercase tracking-wider transition-all duration-200 ${activeView === 'list' ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'text-slate-400 hover:text-slate-600 hover:bg-white'}`}
                        >
                            <LayoutGrid size={9} />
                            Templates
                        </button>
                        <button
                            onClick={() => onViewChange('history')}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md font-black text-[8px] uppercase tracking-wider transition-all duration-200 ${activeView === 'history' ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'text-slate-400 hover:text-slate-600 hover:bg-white'}`}
                        >
                            <History size={9} />
                            History
                        </button>
                        <button
                            onClick={() => onViewChange('reports')}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md font-black text-[8px] uppercase tracking-wider transition-all duration-200 ${activeView === 'reports' ? 'bg-primary text-white shadow-sm shadow-primary/20' : 'text-slate-400 hover:text-slate-600 hover:bg-white'}`}
                        >
                            <FileText size={9} />
                            Reports
                        </button>
                    </div>
                </div>
            )}
            {/* Stats — 2×2 grid */}
            <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total</p>
                        <History size={14} className="text-slate-200" />
                    </div>
                    <p className="text-3xl font-black text-slate-900">{stats.total}</p>
                </div>
                <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-100 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Done</p>
                        <CheckCircle2 size={14} className="text-emerald-400" />
                    </div>
                    <p className="text-3xl font-black text-emerald-600">{stats.completed}</p>
                </div>
                <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-100 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Active</p>
                        <Clock size={14} className="text-amber-400" />
                    </div>
                    <p className="text-3xl font-black text-amber-600">{stats.pending}</p>
                </div>
                <button
                    onClick={() => setShowMissed(v => !v)}
                    className={`text-left p-3.5 rounded-2xl border shadow-sm transition-all ${(Math.max(clientMissedCount, missedAlerts.length) + stats.overdue) > 0 ? 'bg-rose-50 border-rose-200' : 'bg-slate-50 border-slate-100'}`}
                >
                    <div className="flex items-start justify-between mb-2">
                        <p className={`text-[9px] font-black uppercase tracking-widest ${(Math.max(clientMissedCount, missedAlerts.length) + stats.overdue) > 0 ? 'text-rose-400' : 'text-slate-400'}`}>Missed</p>
                        {(Math.max(clientMissedCount, missedAlerts.length) + stats.overdue) > 0
                            ? (showMissed ? <ChevronUp size={14} className="text-rose-400" /> : <ChevronDown size={14} className="text-rose-400" />)
                            : <XCircle size={14} className="text-slate-200" />
                        }
                    </div>
                    <p className={`text-3xl font-black ${(Math.max(clientMissedCount, missedAlerts.length) + stats.overdue) > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{Math.max(clientMissedCount, missedAlerts.length) + stats.overdue}</p>
                </button>
            </div>

            {/* Missed drilldown list */}
            <AnimatePresence>
                {showMissed && missedAlerts.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2 overflow-hidden"
                    >
                        <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Missed Slots</h3>
                        {missedAlerts.map((alert, index) => {
                            const slotDate = new Date(alert.slot_time);
                            const dateLabel = slotDate.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
                            const timeLabel = slotDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
                            return (
                                <motion.div
                                    key={alert.id}
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex"
                                >
                                    <div className="w-1.5 bg-rose-500 flex-shrink-0" />
                                    <div className="flex items-center gap-3 px-3 py-3 flex-1">
                                        <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                                            <XCircle size={16} className="text-rose-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-black text-sm text-white tracking-tight truncate">{alert.template?.title || 'Unknown'}</h4>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <span className="text-[9px] font-black text-rose-400 uppercase tracking-wider">{timeLabel}</span>
                                                <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{dateLabel}</span>
                                                {alert.template?.frequency && (
                                                    <span className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">{alert.template.frequency.replace(/_/g, ' ')}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Due Checklists Section */}
            {dueTemplates.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Due Checklists</h3>
                    {dueTemplates.map((template, index) => (
                        <motion.div
                            key={`due-${template.id}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className="bg-rose-50 border border-rose-200 rounded-2xl overflow-hidden flex"
                        >
                            <div className="w-1.5 bg-rose-500 flex-shrink-0" />
                            <div className="flex items-center gap-3 px-3 py-3 flex-1">
                                <div className="w-9 h-9 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                                    <AlertTriangle size={16} className="text-rose-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-black text-sm text-slate-900 tracking-tight truncate">{template.title}</h4>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider">{template.dueLabel}</span>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{frequencyLabel(template.frequency)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const dateStr = new Date().toISOString().split('T')[0];
                                            window.open(`/api/properties/${propertyId}/sop/report?templateId=${template.id}&date=${dateStr}`, '_blank');
                                        }}
                                        title="Download Report"
                                        className="w-9 h-9 flex items-center justify-center bg-slate-50 text-slate-400 rounded-xl hover:bg-white hover:text-primary border border-slate-100 transition-all"
                                    >
                                         <Download size={14} />
                                    </button>
                                    {template.slotCompletedId ? (
                                        <button
                                            onClick={() => onSelectTemplate(template.id, template.slotCompletedId)}
                                            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 transition-all"
                                        >
                                            <CheckCircle2 size={9} />
                                            Done · View
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => onSelectTemplate(template.id, template.inProgressId || undefined)}
                                            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-primary transition-all"
                                        >
                                            <Play size={9} />
                                            {template.inProgressId ? 'Resume' : 'Start'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* Upcoming Checklists — horizontal scrollable chips */}
            {upcomingTemplates.length > 0 && (
                <div>
                    <h3 className="text-[9px] font-black text-blue-500 uppercase tracking-widest mb-2">Upcoming</h3>
                    <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                        {upcomingTemplates.map((template, index) => {
                            // SVG ring constants
                            const r = 22;
                            const circ = 2 * Math.PI * r; // ≈ 138.2
                            const offset = circ - ((template.progressPct ?? 0) / 100) * circ;
                            return (
                                <motion.div
                                    key={`upcoming-${template.id}`}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.04 }}
                                    className="flex-shrink-0 w-36 bg-white border border-blue-100 rounded-2xl p-3 flex flex-col items-center gap-1.5 shadow-sm"
                                >
                                    {/* Circular progress ring */}
                                    <div className="relative w-14 h-14 flex items-center justify-center">
                                        <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90 absolute inset-0">
                                            {/* Track */}
                                            <circle cx="28" cy="28" r={r} fill="none" stroke="#dbeafe" strokeWidth="4" />
                                            {/* Progress */}
                                            <motion.circle
                                                cx="28" cy="28" r={r}
                                                fill="none"
                                                stroke="url(#blueGrad)"
                                                strokeWidth="4"
                                                strokeLinecap="round"
                                                strokeDasharray={circ}
                                                initial={{ strokeDashoffset: circ }}
                                                animate={{ strokeDashoffset: offset }}
                                                transition={{ duration: 1.1, ease: 'linear' }}
                                            />
                                            <defs>
                                                <linearGradient id="blueGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                    <stop offset="0%" stopColor="#60a5fa" />
                                                    <stop offset="100%" stopColor="#3b82f6" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                        <Timer size={18} className="text-blue-500 relative z-10" />
                                    </div>
                                    {/* Title */}
                                    <p className="text-[11px] font-black text-slate-900 tracking-tight text-center leading-tight line-clamp-2 w-full">{template.title}</p>
                                    {/* Time label */}
                                    <span className="text-[9px] font-black text-blue-500 uppercase tracking-wider text-center">{template.upcomingLabel}</span>
                                    {/* Frequency badge */}
                                    <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{frequencyLabel(template.frequency)}</span>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* History List */}
            <div className="space-y-2">
                {(completions.length > 0 || missedAlerts.length > 0) && (
                    <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">History</h3>
                )}
                <AnimatePresence>
                    {/* Merge completions + missed alerts, sorted newest first */}
                    {[
                        ...completions.map((c: any) => ({ type: 'completion' as const, data: c, sortTs: c.completed_at || c.created_at || c.completion_date })),
                        ...missedAlerts.map((m: any) => ({ type: 'missed' as const, data: m, sortTs: m.slot_time })),
                    ]
                        .sort((a, b) => new Date(b.sortTs).getTime() - new Date(a.sortTs).getTime())
                        .map((entry, index) => {
                        if (entry.type === 'missed') {
                            const alert = entry.data;
                            const slotDate = new Date(alert.slot_time);
                            const dateLabel = slotDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                            const intervalH = alert.template?.frequency ? parseHourlyInterval(alert.template.frequency) : null;
                            const slotH = slotDate.getHours(), slotM = slotDate.getMinutes();
                            const to12 = (h: number, m: number) => {
                                const ampm = h >= 12 ? 'PM' : 'AM';
                                const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                                return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
                            };
                            const slotLabel = intervalH
                                ? `${to12(slotH, slotM)} – ${to12((slotH + intervalH) % 24, slotM)}`
                                : to12(slotH, slotM);
                            return (
                                <motion.div
                                    key={`missed-${alert.id}`}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    className="bg-rose-50 border border-rose-200 rounded-2xl p-3 shadow-sm"
                                >
                                    <div className="flex items-start gap-3">
                                        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-rose-100">
                                            <XCircle size={18} className="text-rose-500" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-black text-sm text-rose-900 tracking-tight truncate">
                                                {alert.template?.title || 'Unknown Checklist'}
                                            </h4>
                                             <div className="flex items-center flex-wrap gap-2 mt-0.5">
                                                 <div className="flex items-center gap-1 text-rose-400">
                                                     <Calendar size={9} />
                                                     <span className="text-[9px] font-bold uppercase tracking-wider">{dateLabel}</span>
                                                 </div>
                                                 <div className="flex items-center gap-1 bg-rose-100 px-1.5 py-0.5 rounded-md">
                                                     <Clock size={9} className="text-rose-500" />
                                                     <span className="text-[9px] font-black text-rose-600 tracking-wider">{slotLabel}</span>
                                                 </div>
                                                 <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-200 text-rose-700">Missed</span>
                                                 <button
                                                     onClick={(e) => {
                                                         e.stopPropagation();
                                                         const dateStr = slotDate.toISOString().split('T')[0];
                                                         window.open(`/api/properties/${propertyId}/sop/report?templateId=${alert.template_id}&date=${dateStr}`, '_blank');
                                                     }}
                                                     className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-white text-rose-400 border border-rose-100 hover:bg-rose-100 transition-all"
                                                 >
                                                     <Download size={9} />
                                                     Report
                                                 </button>
                                             </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        }

                        const completion = entry.data;
                        const items = completion.items || [];
                        const checkedItems = items.filter((i: any) => i.is_checked || i.value).length;
                        const totalItems = items.length;
                        const progress = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0;
                        const isCompleted = completion.status === 'completed';
                        const isInProgress = completion.status === 'in_progress';

                        // Compute time slot label (e.g. "9:00 AM – 12:00 PM")
                        const slot = (() => {
                            const tmpl = completion.template;
                            // Use created_at (when session was opened = within the correct slot)
                            // NOT completed_at — a late submission can fall into the next slot's time range
                            const ts = completion.created_at || completion.completed_at;
                            const to12 = (hhmm: string) => {
                                const [h, m] = hhmm.slice(0, 5).split(':').map(Number);
                                const ampm = h >= 12 ? 'PM' : 'AM';
                                const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                                return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
                            };
                            // 1. Hourly + start_time → compute exact slot window
                            const computed = getCompletionSlot(ts, tmpl?.frequency, tmpl?.start_time);
                            if (computed) {
                                const [s, e] = computed.split(' – ');
                                return `${to12(s)} – ${to12(e)}`;
                            }
                            // 2. Hourly without start_time → round created_at down to slot boundary
                            const intervalH = tmpl?.frequency ? parseHourlyInterval(tmpl.frequency) : null;
                            if (intervalH && ts) {
                                const d = new Date(ts);
                                const totalMins = d.getHours() * 60 + d.getMinutes();
                                const slotStartMins = Math.floor(totalMins / (intervalH * 60)) * (intervalH * 60);
                                const slotEndMins = slotStartMins + intervalH * 60;
                                const fmt = (mins: number) => {
                                    const h = Math.floor(mins / 60) % 24, m = mins % 60;
                                    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                                };
                                return `${to12(fmt(slotStartMins))} – ${to12(fmt(slotEndMins))}`;
                            }
                            // 3. Fixed window on template → show window
                            if (tmpl?.start_time && tmpl?.end_time)
                                return `${to12(tmpl.start_time)} – ${to12(tmpl.end_time)}`;
                            // 4. Fallback → show actual logged time
                            if (ts) {
                                const d = new Date(ts);
                                const h = d.getHours(), mi = d.getMinutes();
                                const ampm = h >= 12 ? 'PM' : 'AM';
                                const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                                return `${h12}:${String(mi).padStart(2, '0')} ${ampm}`;
                            }
                            return null;
                        })();

                        // Overdue = in-progress but time window already closed
                        const isOverdue = isInProgress && (() => {
                            const tmpl = completion.template;
                            if (!tmpl) return false;
                            const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
                            if (tmpl.end_time) {
                                const [eH, eM] = tmpl.end_time.slice(0, 5).split(':').map(Number);
                                if (nowMins > eH * 60 + eM) return true;
                            }
                            const intervalH = parseHourlyInterval(tmpl.frequency);
                            if (intervalH && completion.created_at) {
                                const elapsed = liveNow.getTime() - new Date(completion.created_at).getTime();
                                if (elapsed > intervalH * 3_600_000) return true;
                            }
                            return false;
                        })();

                        return (
                            <motion.div
                                key={completion.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03 }}
                                className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm"
                            >
                                {/* Top row: icon + title + meta */}
                                <div className="flex items-start gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isCompleted ? 'bg-emerald-100' : 'bg-amber-100'}`}>
                                        {isCompleted
                                            ? <CheckCircle2 size={18} className="text-emerald-500" />
                                            : <Clock size={18} className="text-amber-500" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="font-black text-sm text-slate-900 tracking-tight truncate">
                                            {completion.template?.title || 'Unknown Checklist'}
                                        </h4>
                                        <div className="flex items-center flex-wrap gap-2 mt-0.5">
                                            <div className="flex items-center gap-1 text-slate-400">
                                                <Calendar size={9} />
                                                <span className="text-[9px] font-bold uppercase tracking-wider">
                                                    {new Date(completion.completion_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </span>
                                            </div>
                                            {slot && (
                                                <div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded-md">
                                                    <Clock size={9} className="text-amber-500" />
                                                    <span className="text-[9px] font-black text-amber-600 tracking-wider">
                                                        {slot.includes('–') ? slot : `@ ${slot}`}
                                                    </span>
                                                </div>
                                            )}
                                            {isOverdue && (
                                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-600">Overdue</span>
                                            )}
                                            <div className="flex items-center gap-1 text-slate-400">
                                                <User size={9} />
                                                <span className="text-[9px] font-bold uppercase tracking-wider truncate max-w-[70px]">
                                                    {completion.user?.full_name || 'System'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {isAdmin && (
                                        <button
                                            onClick={(e) => handleDelete(completion.id, e)}
                                            className="p-1.5 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all flex-shrink-0"
                                            title="Delete"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    )}
                                </div>

                                {/* Completion row */}
                                <div className="flex items-center justify-between mt-2.5">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Completion</span>
                                    <span className="text-[9px] font-black text-primary uppercase tracking-widest">{checkedItems}/{totalItems} Points</span>
                                </div>
                                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        className={`h-full ${progress === 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                                    />
                                </div>

                                {/* Action buttons */}
                                 <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                                     <button
                                         onClick={(e) => {
                                             e.stopPropagation();
                                             const dateStr = new Date(completion.completion_date).toISOString().split('T')[0];
                                             window.open(`/api/properties/${propertyId}/sop/report?templateId=${completion.template_id}&date=${dateStr}`, '_blank');
                                         }}
                                         className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-white hover:text-primary border border-slate-100 transition-all"
                                     >
                                         <Download size={9} />
                                         Report
                                     </button>
                                     <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${isCompleted ? 'bg-emerald-100 text-emerald-700' : isOverdue ? 'bg-rose-100 text-rose-700' : isInProgress ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700'}`}>
                                         {isOverdue ? 'Overdue' : completion.status.replace('_', ' ')}
                                     </span>
                                     {!isCompleted && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onSelectTemplate(completion.template_id, completion.id); }}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-primary transition-all"
                                        >
                                            <Play size={8} />
                                            {isInProgress ? 'Resume' : 'Start'}
                                        </button>
                                    )}
                                    {isInProgress && (
                                        <button
                                            onClick={(e) => handleCancelSession(completion.id, e)}
                                            className="flex items-center gap-1 px-2.5 py-1 bg-rose-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all"
                                        >
                                            <Square size={8} />
                                            Stop
                                        </button>
                                    )}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onViewDetail(completion.id); }}
                                        className="flex items-center gap-1 px-2.5 py-1 bg-white text-slate-600 border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest hover:border-primary hover:text-primary transition-all"
                                    >
                                        <Eye size={8} />
                                        Details
                                    </button>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>

                {completions.length === 0 && missedAlerts.length === 0 && dueTemplates.length === 0 && (
                    <div className="text-center py-16 px-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                        <div className="w-14 h-14 bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center text-slate-300 mx-auto mb-4">
                            <History size={24} />
                        </div>
                        <h3 className="text-base font-black text-slate-900 tracking-tight mb-1">No History Record Found</h3>
                        <p className="text-slate-500 text-xs font-medium max-w-sm mx-auto">Completing checklist items will populate this history log with audit records.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SOPCompletionHistory;
