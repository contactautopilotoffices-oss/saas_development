/**
 * SOPCompletionHistory
 * SOP completion history log with real-time tracking of due, missed, and upcoming tasks.
 * Supports frequency-based scheduling (daily, weekly, monthly, quarterly).
 * @remarks Client component using Supabase for data.
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/frontend/utils/supabase/client';
import Skeleton from '@/frontend/components/ui/Skeleton';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataCache } from '@/frontend/context/DataCacheContext';
import { History, User, Calendar, CheckCircle2, Clock, Trash2, Play, Eye, AlertTriangle, Square, LayoutGrid, Timer, XCircle, ChevronDown, ChevronUp, Download, FileText } from 'lucide-react';

interface SOPCompletionHistoryProps {
    propertyId?: string;
    propertyIds?: string[];
    onSelectTemplate: (id: string, propertyId: string, completionId?: string, completionDate?: string) => void;
    onViewDetail: (id: string, templateId: string, propertyId: string) => void;
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
        // Overnight ranges (endMins <= startMins) are not supported for hourly templates
        if (endMins <= startMins) return null;
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

/** Helper: determine if now is within a time window, correctly handling overnight ranges. */
function isWithinTimeWindow(nm: number, st: string, et: string): boolean {
    const [sh, sm] = st.slice(0, 5).split(':').map(Number);
    const [eh, em] = et.slice(0, 5).split(':').map(Number);
    const smins = sh * 60 + sm;
    const emins = eh * 60 + em;
    if (emins <= smins) {
        // Overnight window (e.g., 22:00 → 07:00): open past start OR before end
        return nm >= smins || nm < emins;
    }
    // Normal window: between start and end
    return nm >= smins && nm <= emins;
}

// Helper: check if a template is due based on frequency, time window, and last completion
export function isDue(
    frequency: string,
    lastCompletionDate: string | null,
    startTime?: string | null,
    endTime?: string | null,
    lastCompletedAt?: string | null,
    startedAt?: string | null,
    baseDate?: Date
): { due: boolean; label: string; status: 'due' | 'missed' | 'completed' | 'upcoming' | '' } {
    if (frequency === 'on_demand') return { due: false, label: '', status: '' };

    const now = baseDate || new Date();
    const intervalHours = parseHourlyInterval(frequency);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ── Global window pre-checks (for non-hourly) ───────────────────────────
    if (intervalHours === null && startTime && endTime) {
        const [sh, sm] = startTime.slice(0, 5).split(':').map(Number);
        const [eh, em] = endTime.slice(0, 5).split(':').map(Number);
        const smins = sh * 60 + sm;
        const emins = eh * 60 + em;
        const isOvernight = emins <= smins;

        if (!isWithinTimeWindow(nowMins, startTime, endTime)) {
            // If window is closed, check if it was COMPLETED in the most recent instance
            const last = lastCompletedAt ? new Date(lastCompletedAt) : lastCompletionDate ? new Date(lastCompletionDate) : null;
            
            let lastWindowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm, 0, 0);
            const isCurrentlyEarlyMorning = isOvernight && nowMins < emins;
            
            if (isCurrentlyEarlyMorning) {
                // We are in the morning part of an overnight window, so the "closed" window we care about
                // is actually the one happening right now (but we are outside of it? No, wait.)
                // Actually, if window is closed, it means we are in the gap.
            }

            // Logic for "Missed": If window is closed and no completion in THAT window
            // This is handled better inside the frequency blocks below.
        }
    }

    // ── Hourly + time window → daily-reset schedule logic ───────────────────
    if (intervalHours !== null && startTime && endTime) {
        const [sH, sM] = startTime.slice(0, 5).split(':').map(Number);
        const [eH, eM] = endTime.slice(0, 5).split(':').map(Number);
        const startMins = sH * 60 + sM;
        const endMins = eH * 60 + eM;

        const isOvernight = endMins <= startMins;
        let baselineDate = today;
        
        if (isOvernight && nowMins < endMins) {
            baselineDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        }

        const baselineStart = new Date(baselineDate.getFullYear(), baselineDate.getMonth(), baselineDate.getDate(), sH, sM, 0, 0);
        const windowDurationMins = isOvernight ? (1440 - startMins + endMins) : (endMins - startMins);
        
        const todaySlots: Date[] = [];
        let t = 0;
        while (t + intervalHours * 60 <= windowDurationMins) {
            const slotTime = new Date(baselineStart.getTime() + t * 60 * 1000);
            todaySlots.push(slotTime);
            t += intervalHours * 60;
        }

        const passedSlots = todaySlots.filter(s => s <= now);
        const currentSlot = passedSlots.length > 0 ? passedSlots[passedSlots.length - 1] : null;

        if (!currentSlot) {
            return { due: false, label: `Starts at ${fmt12h(startTime)}`, status: 'upcoming' };
        }

        const lastDone = lastCompletedAt ? new Date(lastCompletedAt) : null;
        const isDone = lastDone && lastDone >= currentSlot;

        if (isDone) {
            const nextSlot = todaySlots.find(s => s > now);
            if (!nextSlot) return { due: false, label: 'All done today', status: 'completed' };
            return { due: false, label: `Next in ${fmtRemaining(nextSlot.getTime() - now.getTime())}`, status: 'completed' };
        }

        // Within time window?
        if (isWithinTimeWindow(nowMins, startTime, endTime)) {
            const overdueMins = Math.floor((now.getTime() - currentSlot.getTime()) / 60000);
            if (overdueMins < 2) return { due: true, label: 'Due now', status: 'due' };
            const oh = Math.floor(overdueMins / 60), om = overdueMins % 60;
            const label = oh > 0 ? (om > 0 ? `Overdue ${oh}h ${om}m` : `Overdue ${oh}h`) : `Overdue ${overdueMins}m`;
            return { due: true, label, status: 'due' };
        }

        return { due: false, label: 'Missed slot', status: 'missed' };
    }

    // ── Hourly without time window ───────────────────────────────────────────
    if (intervalHours !== null) {
        const lastTs = lastCompletedAt ? new Date(lastCompletedAt) : lastCompletionDate ? new Date(lastCompletionDate) : null;
        if (!lastTs) return { due: true, label: 'Not started', status: 'due' };

        const diffMs = now.getTime() - lastTs.getTime();
        const intervalMs = intervalHours * 60 * 60 * 1000;
        const remainingMs = intervalMs - diffMs;
        if (remainingMs > 0) return { due: false, label: `Next in ${fmtRemaining(remainingMs)}`, status: 'upcoming' };
        const overdueMins = Math.floor((diffMs - intervalMs) / 60000);
        const oh = Math.floor(overdueMins / 60), om = overdueMins % 60;
        const label = oh > 0 ? (om > 0 ? `Overdue ${oh}h ${om}m` : `Overdue ${oh}h`) : `Overdue ${overdueMins}m`;
        return { due: true, label, status: 'due' };
    }

    // ── Daily / weekly / monthly ─────────────────────────────────────────────
    if (!lastCompletionDate) {
        if (frequency === 'daily' && startTime && endTime) {
            if (isWithinTimeWindow(nowMins, startTime, endTime)) return { due: true, label: 'Due now', status: 'due' };
            // If window hasn't started yet today
            const [sh] = startTime.slice(0, 5).split(':').map(Number);
            if (nowMins < sh * 60) return { due: false, label: `Starts at ${fmt12h(startTime)}`, status: 'upcoming' };
            return { due: true, label: 'Missed', status: 'missed' };
        }
        return { due: true, label: 'Not started', status: 'due' };
    }

    if (frequency === 'daily') {
        const last = lastCompletedAt ? new Date(lastCompletedAt) : new Date(lastCompletionDate);
        if (startTime && endTime) {
            const [sh, sm] = startTime.slice(0, 5).split(':').map(Number);
            const [eh, em] = endTime.slice(0, 5).split(':').map(Number);
            const smins = sh * 60 + sm;
            const emins = eh * 60 + em;
            const isOvernight = emins <= smins;

            let currentWindowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), sh, sm, 0, 0);
            if (isOvernight && nowMins < emins) {
                currentWindowStart = new Date(currentWindowStart.getTime() - 24 * 60 * 60 * 1000);
            }

            const logicalDate = currentWindowStart.toLocaleDateString('en-CA');
            const isDoneInCurrentWindow = lastCompletionDate === logicalDate && last.getTime() >= currentWindowStart.getTime();
            if (isDoneInCurrentWindow) return { due: false, label: 'Done today', status: 'completed' };
            
            if (isWithinTimeWindow(nowMins, startTime, endTime)) return { due: true, label: 'Due now', status: 'due' };
            
                        // If we haven't reached the start of the current logical window yet (e.g. 8 AM vs 10 PM)
            if (nowMins < smins) return { due: false, label: `Starts at ${fmt12h(startTime)}`, status: 'upcoming' };

            // If we are past the window and not done
            const isPastWindow = isOvernight ? (nowMins >= emins && nowMins < smins) : (nowMins >= emins);
            if (isPastWindow) return { due: true, label: 'Missed', status: 'missed' };
            
            return { due: false, label: `Starts at ${fmt12h(startTime)}`, status: 'upcoming' };
        }

        const lastDate = new Date(last.getFullYear(), last.getMonth(), last.getDate());
        const isSameDay = lastCompletionDate === today.toLocaleDateString('en-CA');
        if (isSameDay) return { due: false, label: 'Done today', status: 'completed' };
        return { due: true, label: 'Due today', status: 'due' };
    }

    const last = new Date(lastCompletionDate);
    const diffMs = now.getTime() - last.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (frequency === 'weekly') {
        if (diffDays < 7) return { due: false, label: `Due in ${7 - diffDays}d`, status: 'upcoming' };
        return { due: true, label: diffDays === 7 ? 'Due today' : `Overdue by ${diffDays - 7}d`, status: 'due' };
    }
    if (frequency === 'monthly') {
        if (diffDays < 30) return { due: false, label: `Due in ${30 - diffDays}d`, status: 'upcoming' };
        return { due: true, label: diffDays === 30 ? 'Due today' : `Overdue by ${diffDays - 30}d`, status: 'due' };
    }

    return { due: false, label: '', status: '' };
}

const SOPCompletionHistory: React.FC<SOPCompletionHistoryProps> = ({ propertyId, propertyIds, onSelectTemplate, onViewDetail, isAdmin = false, userRole, activeView = 'history', onViewChange }) => {
    const isMultiProperty = !!propertyIds && propertyIds.length > 0;
    const [completions, setCompletions] = useState<any[]>([]);
    const [rawTemplateData, setRawTemplateData] = useState<Array<{ template: any; latestCompletion: any; lastDate: string | null }>>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [liveNow, setLiveNow] = useState(() => new Date());
    const supabase = React.useMemo(() => createClient(), []);
    const { getCachedData, setCachedData, invalidateCache } = useDataCache();
    const [activeFilter, setActiveFilter] = useState<'due' | 'missed' | 'completed' | 'all'>('all');
    const [selectedDate, setSelectedDate] = useState(liveNow.toLocaleDateString('en-CA'));
    const isToday = selectedDate === liveNow.toLocaleDateString('en-CA');

    // Tick every few seconds to reduce recalculation overhead while keeping 
    // real-time labels (Due In, etc.) reasonably accurate.
    useEffect(() => {
        const id = setInterval(() => setLiveNow(new Date()), 5000);
        return () => clearInterval(id);
    }, []);

    const fetchData = useMemo(() => async () => {
        const cacheKey = `sop-history-${propertyId || (propertyIds?.join(','))}-${isAdmin}`;
        const cached = getCachedData(cacheKey);

        if (cached) {
            setCompletions(cached.completions);
            setRawTemplateData(cached.rawTemplateData);
            setIsLoading(false);
        } else {
            setIsLoading(true);
        }

        try {
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
                    .select('id, title, frequency, category, assigned_to, start_time, end_time, started_at, property_id')
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

                // Update Cache
                setCachedData(cacheKey, {
                    completions: results,
                    rawTemplateData: rows
                });
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
    const { dueTemplates, upcomingTemplates, missedTemplates, completedToday, stats } = useMemo(() => {
        const due: any[] = [];
        const upcoming: any[] = [];
        const missed: any[] = [];
        const completed: any[] = [];

        const [y, m, d] = selectedDate.split('-').map(Number);
        const refDate = isToday ? liveNow : new Date(y, m - 1, d, 23, 59, 59);

        for (const { template, latestCompletion, lastDate } of rawTemplateData) {
            const dueStatus = isDue(
                template.frequency, lastDate,
                template.start_time, template.end_time,
                latestCompletion?.completed_at,
                template.started_at,
                refDate
            );

            const nowMins = refDate.getHours() * 60 + refDate.getMinutes();
            const [sh, sm] = (template.start_time || '00:00').slice(0, 5).split(':').map(Number);
            const [eh, em] = (template.end_time || '23:59').slice(0, 5).split(':').map(Number);
            const isOvernight = (eh * 60 + em) <= (sh * 60 + sm);

            let currentShiftStart = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), sh, sm, 0, 0);
            if (isOvernight && nowMins < (eh * 60 + em)) {
                currentShiftStart = new Date(currentShiftStart.getTime() - 24 * 3600000);
            }
            const actualLogicalDate = currentShiftStart.toLocaleDateString('en-CA');

            const isHourly = /^every_\d+_hours?$/.test(template.frequency);
            const currentSlot = computeCurrentSlotStart(template.frequency, template.start_time, refDate, template.end_time);
            
            const slotMatch = (c: any) => {
                if (c.template_id !== template.id) return false;
                if (!isHourly) {
                    if (template.frequency === 'daily' && template.start_time && template.end_time) {
                        return c.completion_date === actualLogicalDate;
                    }
                    return c.completion_date === actualLogicalDate;
                }
                return c.completion_date === actualLogicalDate && (c.slot_time || '').startsWith(currentSlot || '00:00');
            };

            const slotCompleted = completions.find((c: any) => c.status === 'completed' && slotMatch(c));
            const inProgress = isToday ? completions.find((c: any) => c.status === 'in_progress' && slotMatch(c)) : null;

            const templateWithMeta = { 
                ...template, 
                dueLabel: dueStatus.label, 
                inProgressId: inProgress?.id || null, 
                slotCompletedId: slotCompleted?.id || null 
            };

            if (slotCompleted) {
                completed.push({ 
                    ...templateWithMeta, 
                    dueStatus: (slotCompleted.completion_date !== actualLogicalDate) ? 'late' : 'on-time',
                    completedAt: slotCompleted.completed_at 
                });
            } else if (isToday && (inProgress || dueStatus.status === 'due')) {
                due.push(templateWithMeta);
            } else if (isToday && dueStatus.status === 'upcoming') {
                upcoming.push({ ...templateWithMeta, upcomingLabel: dueStatus.label, progressPct: 0 });
            } else if (actualLogicalDate === selectedDate) {
                missed.push({ ...templateWithMeta, historicalDate: actualLogicalDate });
            }

            if (isToday && template.frequency === 'daily' && template.start_time && template.end_time) {
                const yShiftStart = new Date(currentShiftStart.getTime() - 24 * 3600000);
                const yLogicalDate = yShiftStart.toLocaleDateString('en-CA');
                const yDone = completions.find(c => c.template_id === template.id && c.completion_date === yLogicalDate && c.status === 'completed');
                if (!yDone) {
                    missed.push({ ...template, dueLabel: 'Missed Yesterday', historicalDate: yLogicalDate, isHistorical: true });
                }
            }
        }

        return {
            dueTemplates: due,
            upcomingTemplates: upcoming,
            missedTemplates: missed,
            completedToday: completed,
            stats: {
                total: completions.length,
                completed: completed.length,
                pending: due.length,
                due: due.length,
                overdue: 0
            }
        };
    }, [rawTemplateData, completions, liveNow, selectedDate]); 

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
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total History</p>
                        <History size={14} className="text-slate-200" />
                    </div>
                    <p className="text-3xl font-black text-slate-900">{stats.total}</p>
                </div>
                <div className="bg-emerald-50 p-3.5 rounded-2xl border border-emerald-100 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                        <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Shift Done</p>
                        <CheckCircle2 size={14} className="text-emerald-400" />
                    </div>
                    <p className="text-3xl font-black text-emerald-600">{completedToday.length}</p>
                </div>
                <div className="bg-amber-50 p-3.5 rounded-2xl border border-amber-100 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                        <p className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Due Now</p>
                        <Clock size={14} className="text-amber-400" />
                    </div>
                    <p className="text-3xl font-black text-amber-600">{dueTemplates.length}</p>
                </div>
                <div className="bg-rose-50 p-3.5 rounded-2xl border border-rose-100 shadow-sm">
                    <div className="flex items-start justify-between mb-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-rose-400">Missed</p>
                        <XCircle size={14} className="text-rose-200" />
                    </div>
                    <p className="text-3xl font-black text-rose-600">{missedTemplates.length}</p>
                </div>
            </div>

            {/* Status Segmented Toggle */}
            <div className="flex items-center gap-3 px-1 mb-2">
                <div className="flex-1 bg-slate-50 p-1 rounded-2xl border border-slate-200 flex items-center gap-2 px-3">
                    <Calendar size={14} className="text-slate-400" />
                    <input
                        type="date"
                        value={selectedDate}
                        onChange={(e) => setSelectedDate(e.target.value)}
                        className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-slate-600 focus:outline-none w-full"
                    />
                </div>
                {selectedDate !== liveNow.toLocaleDateString('en-CA') && (
                    <button
                        onClick={() => setSelectedDate(liveNow.toLocaleDateString('en-CA'))}
                        className="p-2 bg-slate-900 text-white rounded-xl shadow-sm hover:bg-primary transition-all"
                    >
                        <History size={14} />
                    </button>
                )}
            </div>
            <div className="flex items-center justify-center py-2">
                <div className="bg-slate-50 p-0.5 rounded-xl border border-slate-200 flex items-center gap-0.5 w-full">
                    <button
                        onClick={() => setActiveFilter('all')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all duration-200 ${activeFilter === 'all' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <LayoutGrid size={10} />
                        All
                    </button>
                    <button
                        onClick={() => setActiveFilter('due')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all duration-200 ${activeFilter === 'due' ? 'bg-amber-500 text-white shadow-sm shadow-amber-200' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <Clock size={10} />
                        Due {dueTemplates.length > 0 && `(${dueTemplates.length})`}
                    </button>
                    <button
                        onClick={() => setActiveFilter('missed')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all duration-200 ${activeFilter === 'missed' ? 'bg-rose-500 text-white shadow-sm shadow-rose-200' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <XCircle size={10} />
                        Missed {missedTemplates.length > 0 && `(${missedTemplates.length})`}
                    </button>
                    <button
                        onClick={() => setActiveFilter('completed')}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-black text-[9px] uppercase tracking-wider transition-all duration-200 ${activeFilter === 'completed' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-200' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <CheckCircle2 size={10} />
                        Done {completedToday.length > 0 && `(${completedToday.length})`}
                    </button>
                </div>
            </div>


            {/* 1. Due Checklists Section */}
            {(activeFilter === 'all' || activeFilter === 'due') && dueTemplates.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Due Checklists</h3>
                    {dueTemplates.map((template, index) => (
                        <motion.div
                            key={`due-${template.id}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className="bg-rose-50 border border-rose-200 rounded-2xl overflow-hidden flex shadow-sm"
                        >
                            <div className="w-1.5 bg-rose-500 flex-shrink-0" />
                            <div className="flex items-center gap-3 px-3 py-3 flex-1">
                                <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center flex-shrink-0">
                                    <AlertTriangle size={16} className="text-rose-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-black text-sm text-slate-900 tracking-tight truncate">{template.title}</h4>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[9px] font-black text-rose-600 uppercase tracking-wider">{template.dueLabel}</span>
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{frequencyLabel(template.frequency)}</span>
                                         {template.isHistorical && template.historicalDate && (
                                             <>
                                                 <span className="w-1 h-1 rounded-full bg-slate-200" />
                                                 <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                                     {new Date(template.historicalDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                 </span>
                                             </>
                                         )}
                                        {template.completedAt && (
                                            <>
                                                <span className="w-1 h-1 rounded-full bg-emerald-200" />
                                                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">
                                                    {new Date(template.completedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
                                                </span>
                                            </>
                                        )}</div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                        onClick={() => onSelectTemplate(template.id, template.property_id, template.inProgressId || undefined, template.historicalDate)}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-primary transition-all shadow-sm"
                                    >
                                        <Play size={9} />
                                        {template.inProgressId ? 'Resume' : template.isHistorical ? 'Resume Late' : 'Start'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* 2. Missed Checklists Section */}
            {(activeFilter === 'all' || activeFilter === 'missed') && missedTemplates.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-[9px] font-black text-rose-500 uppercase tracking-widest">Missed Shifts</h3>
                    {missedTemplates.map((template, index) => (
                        <motion.div
                            key={`missed-${template.id}-${template.historicalDate}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className="bg-white border border-rose-100 rounded-2xl overflow-hidden flex shadow-sm border-l-4 border-l-rose-500"
                        >
                            <div className="flex items-center gap-3 px-3 py-3 flex-1">
                                <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                                    <XCircle size={16} className="text-rose-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-black text-sm text-slate-900 tracking-tight truncate">{template.title}</h4>
                                        <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[7px] font-black uppercase tracking-widest rounded-md mt-0.5">Missed</span>
                                        {template.historicalDate && (
                                            <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[7px] font-black uppercase tracking-widest rounded-md mt-0.5">
                                                {new Date(template.historicalDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider">
                                            {template.start_time && template.end_time ? `${fmt12h(template.start_time)} - ${fmt12h(template.end_time)}` : 'No window set'}
                                        </span>
                                        <span className="text-[9px] font-black text-slate-300 uppercase tracking-wider">· {frequencyLabel(template.frequency)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <button
                                        onClick={() => onSelectTemplate(template.id, template.property_id, template.inProgressId || undefined, template.historicalDate)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-sm"
                                    >
                                        <Play size={9} />
                                        {template.inProgressId ? 'Resume' : 'Resume Late'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

            {/* 3. Completed Today Section */}
            {(activeFilter === 'all' || activeFilter === 'completed') && completedToday.length > 0 && (
                <div className="space-y-2">
                    <h3 className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Completed Today</h3>
                    {completedToday.map((template, index) => (
                        <motion.div
                            key={`completed-${template.id}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            className="bg-emerald-50 border border-emerald-100 rounded-2xl overflow-hidden flex shadow-sm"
                        >
                            <div className="w-1.5 bg-emerald-500 flex-shrink-0" />
                            <div className="flex items-center gap-3 px-3 py-3 flex-1">
                                <div className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center flex-shrink-0">
                                    <CheckCircle2 size={16} className="text-emerald-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-black text-sm text-slate-900 tracking-tight truncate">{template.title}</h4>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        {template.historicalDate || (template.completion_date && template.completion_date !== new Date(liveNow).toLocaleDateString('en-CA')) ? (
                                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">Completed Late</span>
                                        ) : (
                                            <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wider">Completed</span>
                                        )}
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">{frequencyLabel(template.frequency)}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    {template.slotCompletedId ? (
                                        <button
                                            onClick={() => onViewDetail(template.slotCompletedId, template.id, template.property_id)}
                                            className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-emerald-200 transition-all shadow-sm"
                                        >
                                            View Report
                                        </button>
                                    ) : (
                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest px-2">Done</span>
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
                {completions.length > 0 && (
                    <h3 className="text-[9px] font-black text-slate-400 uppercase tracking-widest">History</h3>
                )}
                <AnimatePresence>
                    {/* Merge completions + missed alerts, sorted newest first */}
                    {[
                        ...completions.map((c: any) => ({ type: 'completion' as const, data: c, sortTs: c.completed_at || c.created_at || c.completion_date })),
                    ]
                        .sort((a, b) => new Date(b.sortTs).getTime() - new Date(a.sortTs).getTime())
                        .map((entry, index) => {

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

                        // Overdue = in-progress but time window has passed or it's from a previous day
                        const isExpired = isInProgress && (() => {
                            // 1. Check if it's from a previous date
                            const todayStr = liveNow.toISOString().slice(0, 10);
                            if (completion.completion_date < todayStr) return true;

                            // 2. Check if window has passed today (considering overnight)
                            const tmpl = completion.template;
                            if (!tmpl || !tmpl.end_time) return false;
                            
                            const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
                            const [sH, sM] = (tmpl.start_time ?? '00:00').slice(0, 5).split(':').map(Number);
                            const [eH, eM] = tmpl.end_time.slice(0, 5).split(':').map(Number);
                            
                            const startMins = sH * 60 + sM;
                            const endMins = eH * 60 + eM;
                            const isOvernight = endMins <= startMins;

                            const withinWindow = isOvernight
                                ? (nowMins >= startMins || nowMins < endMins)
                                : (nowMins >= startMins && nowMins <= endMins);
                            
                            // If we are currently NOT in the window, and we've already passed the window today
                            // For overnight, "past window" means we are between endMins and startMins
                            if (isOvernight) {
                                return nowMins >= endMins && nowMins < startMins;
                            }
                            // For normal day, past window means nowMins > endMins
                            return nowMins > endMins;
                        })();

                        return (
                            <motion.div
                                key={completion.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.03 }}
                                onClick={() => {
                                    if (isInProgress) onSelectTemplate(completion.template_id, completion.property_id, completion.id);
                                    else onViewDetail(completion.id, completion.template_id, completion.property_id);
                                }}
                                className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm cursor-pointer hover:border-primary/20 transition-all hover:bg-slate-50/50"
                            >
                                {/* Top row: icon + title + meta */}
                                <div className="flex items-start gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isCompleted ? 'bg-emerald-100' : isExpired ? 'bg-rose-100' : 'bg-amber-100'}`}>
                                        {isCompleted
                                            ? <CheckCircle2 size={18} className="text-emerald-500" />
                                            : isExpired 
                                                ? <XCircle size={18} className="text-rose-500" />
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
                                                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md ${isExpired ? 'bg-rose-50' : 'bg-amber-50'}`}>
                                                    <Clock size={9} className={isExpired ? 'text-rose-400' : 'text-amber-500'} />
                                                    <span className={`text-[9px] font-black tracking-wider ${isExpired ? 'text-rose-500' : 'text-amber-600'}`}>
                                                        {slot.includes('–') ? slot : `@ ${slot}`}
                                                    </span>
                                                </div>
                                            )}
                                            {/* (Removed top-row status badge for simplicity) */}
                                            <div className="flex items-center gap-1 text-slate-400">
                                                <User size={9} />
                                                <span className="text-[9px] font-bold uppercase tracking-wider truncate max-w-[70px]">
                                                    {completion.user?.full_name || 'System'}
                                                </span>
                                            </div>
                                            {isCompleted && completion.completed_at && (
                                                <div className="flex items-center gap-1 text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-md">
                                                    <CheckCircle2 size={9} />
                                                    <span className="text-[9px] font-black uppercase tracking-wider">
                                                        Done: {new Date(completion.completed_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} @ {new Date(completion.completed_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}
                                                    </span>
                                                </div>
                                            )}
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
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${isExpired ? 'text-rose-500' : 'text-primary'}`}>{checkedItems}/{totalItems} Points</span>
                                </div>
                                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${progress}%` }}
                                        className={`h-full ${isExpired ? 'bg-rose-400' : progress === 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                                    />
                                </div>

                                {/* Simplified Action Row */}
                                 <div className="flex items-center justify-between mt-3 px-1">
                                     <div className="flex items-center gap-2">
                                         {!isCompleted && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onSelectTemplate(completion.template_id, completion.property_id, completion.id); }}
                                                className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-primary transition-all shadow-sm"
                                            >
                                                <Play size={10} />
                                                {isExpired ? 'Resume Late' : isInProgress ? 'Resume' : 'Start'}
                                            </button>
                                         )}
                                         {isCompleted && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const dateStr = new Date(completion.completion_date).toISOString().split('T')[0];
                                                    window.open(`/api/properties/${propertyId}/sop/report?templateId=${completion.template_id}&date=${dateStr}`, '_blank');
                                                }}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-white hover:text-primary border border-slate-100 transition-all font-inter"
                                            >
                                                <Download size={10} />
                                                Report
                                            </button>
                                         )}
                                     </div>
                                     <div className="flex items-center gap-2">
                                         <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest shadow-sm ${isExpired ? 'bg-rose-500 text-white' : completion.is_late ? 'bg-amber-100 text-amber-700' : isCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                                            {isExpired ? 'Missed' : completion.is_late ? 'Completed Late' : isCompleted ? 'Done' : 'In Progress'}
                                         </span>
                                     </div>
                                 </div>
                                 </motion.div>
                        );
                    })}
                </AnimatePresence>

                {completions.length === 0 && dueTemplates.length === 0 && (
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
