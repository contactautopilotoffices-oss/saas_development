/**
 * SOPDueAlerts
 * Collapsible banner showing overdue or approaching SOP deadlines.
 * Queries templates with due or missed deadlines, renders dismissible alert list.
 * @remarks Client component.
 */

'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import { isDue } from '@/frontend/components/sop/SOPCompletionHistory';
import { AlertCircle, Clock, X } from 'lucide-react';

// Extract propertyId from URL patterns like /property/[uuid]/... or /(dashboard)/[orgId]/...
function usePropertyIdFromPath() {
    const pathname = usePathname() ?? '';
    const match = pathname.match(/\/property\/([0-9a-f-]{36})/i);
    return match?.[1] ?? null;
}

interface DueAlert {
    id: string;
    title: string;
    label: string;
    isUrgent: boolean;
    templateId: string;
    completionId: string | null; // existing in-progress session if any
}

const MAX_VISIBLE = 4;

export default function SOPDueAlerts() {
    const propertyId = usePropertyIdFromPath();
    const router = useRouter();
    const supabase = useMemo(() => createClient(), []);

    const [rawData, setRawData] = useState<Array<{ template: any; latestCompletion: any; lastDate: string | null; inProgressId: string | null }>>([]);
    const [dismissed, setDismissed] = useState<Set<string>>(new Set());
    const [navigatingId, setNavigatingId] = useState<string | null>(null);
    const [liveNow, setLiveNow] = useState(() => new Date());

    // 1s ticker for live countdown
    useEffect(() => {
        const id = setInterval(() => setLiveNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    // Fetch latest completions — called on mount, every 60s, and on tab-focus return
    const fetchData = useMemo(() => async (pid: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data: templates } = await supabase
                .from('sop_templates')
                .select('id, title, frequency, assigned_to, start_time, end_time, started_at')
                .eq('property_id', pid)
                .eq('is_active', true)
                .eq('is_running', true)
                .neq('frequency', 'on_demand');

            if (!templates || templates.length === 0) { setRawData([]); return; }

            const applicable = templates.filter(t =>
                !t.assigned_to || t.assigned_to.length === 0 || t.assigned_to.includes(user.id)
            );

            const ids = applicable.map(t => t.id);
            const { data: completions } = await supabase
                .from('sop_completions')
                .select('id, template_id, completion_date, completed_at, status')
                .in('template_id', ids)
                .order('completed_at', { ascending: false });

            const allCompletions = completions || [];
            const inProgressMap: Record<string, string> = {};
            for (const c of allCompletions) {
                if (c.status === 'in_progress' && !inProgressMap[c.template_id]) {
                    inProgressMap[c.template_id] = c.id;
                }
            }

            setRawData(applicable.map(template => {
                const latestCompletion = allCompletions.find(c => c.template_id === template.id && c.status === 'completed') ?? null;
                return { template, latestCompletion, lastDate: latestCompletion?.completion_date ?? null, inProgressId: inProgressMap[template.id] ?? null };
            }));
        } catch {
            // non-critical overlay — silently ignore
        }
    }, [supabase]);

    // Initial fetch + 60s polling + re-fetch on tab visibility (after returning from checklist runner)
    useEffect(() => {
        if (!propertyId) return;
        fetchData(propertyId);
        const interval = setInterval(() => fetchData(propertyId), 60_000);
        const onVisible = () => { if (document.visibilityState === 'visible') fetchData(propertyId); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [propertyId, fetchData]);

    // Compute due + upcoming alerts live every second
    const alerts = useMemo<DueAlert[]>(() => {
        const result: DueAlert[] = [];

        for (const { template, latestCompletion, lastDate, inProgressId } of rawData) {
            const ds = isDue(template.frequency, lastDate, template.start_time, template.end_time, latestCompletion?.completed_at, template.started_at);

            if (ds.due) {
                result.push({ id: template.id, templateId: template.id, title: template.title, label: ds.label, isUrgent: true, completionId: inProgressId });
            } else if (ds.label && !ds.label.startsWith('Done') && !ds.label.startsWith('All done') && !ds.label.startsWith('Window closed')) {
                result.push({ id: template.id, templateId: template.id, title: template.title, label: ds.label, isUrgent: false, completionId: null });
            }
        }

        return result;
    }, [rawData, liveNow]);

    // For overdue alerts: call the completions API to find/create the session,
    // then navigate with the real completionId so the runner never starts a duplicate.
    const handleOpenDue = async (alert: DueAlert) => {
        if (!alert.isUrgent || !propertyId || navigatingId) return;
        setNavigatingId(alert.templateId);
        try {
            const res = await fetch(`/api/properties/${propertyId}/sop/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateId: alert.templateId }),
            });
            const data = await res.json();
            const cid = data.completion?.id;
            router.push(cid
                ? `/checklist/${alert.templateId}?completionId=${cid}`
                : `/checklist/${alert.templateId}`
            );
        } catch {
            router.push(`/checklist/${alert.templateId}`);
        } finally {
            setNavigatingId(null);
        }
    };

    const visible = alerts.filter(a => !dismissed.has(a.id)).slice(0, MAX_VISIBLE);

    // Auto-dismiss: each alert slides out after N seconds
    const timerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    useEffect(() => {
        visible.forEach((alert) => {
            if (timerRef.current[alert.id]) return; // already scheduled
            const delay = alert.isUrgent ? 15_000 : 8_000;
            timerRef.current[alert.id] = setTimeout(() => {
                setDismissed(prev => new Set([...prev, alert.id]));
                delete timerRef.current[alert.id];
            }, delay);
        });
        // cleanup on unmount
        return () => {
            Object.values(timerRef.current).forEach(clearTimeout);
        };
    }, [visible]);

    if (!propertyId || visible.length === 0) return null;

    return (
        <div className="fixed bottom-4 right-4 z-[9998] flex flex-col gap-2 items-end pointer-events-none">
            <AnimatePresence mode="popLayout">
                {visible.map((alert) => (
                    <motion.div
                        key={alert.id}
                        layout
                        initial={{ opacity: 0, x: 60, scale: 0.92 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 60, scale: 0.88 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                        className="pointer-events-auto w-[280px] md:w-[320px]"
                    >
                        <div
                            onClick={() => handleOpenDue(alert)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg select-none
                                ${alert.isUrgent
                                    ? 'bg-rose-500 text-white cursor-pointer'
                                    : 'bg-emerald-500 text-white cursor-default'
                                } ${navigatingId === alert.templateId ? 'opacity-70' : ''}`}
                        >
                            {/* Icon */}
                            <div className="flex-shrink-0">
                                {alert.isUrgent
                                    ? <AlertCircle size={18} className="text-white/90" />
                                    : <Clock size={18} className="text-white/90" />
                                }
                            </div>

                            {/* Text */}
                            <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-black uppercase tracking-widest text-white/70 leading-none mb-0.5">
                                    {alert.isUrgent ? 'Checklist Due — Tap to Open' : 'Upcoming Checklist'}
                                </p>
                                <p className="text-sm font-black text-white leading-tight truncate">{alert.title}</p>
                                <p className="text-[10px] font-bold text-white/80 mt-0.5">{alert.label}</p>
                            </div>

                            {/* Dismiss */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setDismissed(prev => new Set([...prev, alert.id]));
                                }}
                                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                            >
                                <X size={12} className="text-white" />
                            </button>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
