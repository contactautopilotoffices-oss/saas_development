/**
 * TicketFlowMap - Drag-and-drop Kanban-style visual flow map for ticket assignment and operations.
 *
 * Provides a real-time, interactive operations board that visualizes the ticket pipeline
 * across multiple teams (Technical, Plumbing, Housekeeping). Key features include:
 * - Upstream waitlist lane showing all unassigned incoming tickets
 * - MST group lanes per skill team with per-agent ticket counts
 * - Drag-and-drop ticket assignment from waitlist to agents
 * - Real-time updates via Supabase postgres_changes subscriptions
 * - Per-property date-based filtering with optimistic updates
 * - Detail panel for tickets and history drawer for MST agents
 *
 * Uses @dnd-kit for accessible drag-and-drop. Integrates with DataCacheContext for
 * caching, AuthContext for role-based property selection, and Supabase for realtime.
 *
 * @example
 * <TicketFlowMap propertyId="prop-123" />
 * <TicketFlowMap organizationId="org-456" isEmbedded />
 */
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RefreshCw, Filter, Calendar, Users,
    Search, ChevronRight, Activity, Clock,
    CheckCircle2, AlertCircle, ArrowLeft, Zap, ChevronDown, Building2
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import { useDataCache } from '@/frontend/context/DataCacheContext';
import { useAuth } from '@/frontend/context/AuthContext';
import Skeleton from '@/frontend/components/ui/Skeleton';
import {
    DndContext,
    PointerSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    DragEndEvent,
    DragStartEvent,
    DragOverlay,
    useDroppable,
    closestCenter,
} from '@dnd-kit/core';
import TicketNode from './TicketNode';
import MstGroup from './MstGroup';
import TicketDetailPanel from './TicketDetailPanel';
import MstHistoryDrawer from './MstHistoryDrawer';

interface FlowData {
    waitlist: any[];
    mstGroups: any[];
    stats: {
        totalActive: number;
        waitlistCount: number;
        onlineMsts: number;
        checkedInMsts: number;
        resolvedToday: number;
    };
}

interface TicketFlowMapProps {
    organizationId?: string;
    propertyId?: string;
    isEmbedded?: boolean;
}

const TEAM_CONFIG = [
    { id: 'technical', label: 'Technical', color: 'border-info' },
    { id: 'plumbing', label: 'Plumbing', color: 'border-success' },
    { id: 'housekeeping', label: 'Housekeeping', color: 'border-error' },
];

/**
 * Waitlist Lane Component (Droppable)
 */
function WaitlistLane({
    tickets,
    onTicketClick,
    savingTicketIds
}: {
    tickets: any[],
    onTicketClick: (id: string) => void,
    savingTicketIds: Set<string>
}) {
    const { isOver, setNodeRef } = useDroppable({
        id: 'waitlist',
        data: { type: 'waitlist' }
    });

    return (
        <div ref={setNodeRef} className={`w-full flex flex-col relative z-10 transition-colors ${isOver ? 'bg-warning/5' : ''}`}>
            <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-warning" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-warning/80">Waitlist Lane</h3>
                    <span className="text-[10px] font-bold text-slate-400 ml-2">
                        W:{tickets.length} (Incoming Feed)
                    </span>
                </div>
            </div>

            <div className="lg:flex-1 lg:overflow-y-auto overflow-y-visible pr-2 custom-scrollbar min-h-[120px] lg:min-h-0 h-auto lg:h-full">
                <div className="flex flex-wrap gap-2">
                    {tickets.map((ticket) => (
                        <TicketNode
                            key={ticket.id}
                            id={ticket.id}
                            ticketNumber={ticket.ticket_number || ticket.ticket_id || ticket.id}
                            status={ticket.status}
                            title={ticket.title}
                            description={ticket.description}
                            isSaving={savingTicketIds.has(ticket.id)}
                            onClick={() => onTicketClick(ticket.id)}
                        />
                    ))}
                </div>
                {tickets.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-200 rounded-2xl opacity-50 bg-white/50">
                        <CheckCircle2 className="w-8 h-8 mb-2 text-success" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Clear Feed</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function TicketFlowMap({
    organizationId,
    propertyId,
    isEmbedded = false
}: TicketFlowMapProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const from = searchParams.get('from');

    const { membership, user } = useAuth();
    const { getCachedData, setCachedData } = useDataCache();
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

    // Cache key now correctly uses selectedDate after its declaration
    const cacheKey = useMemo(() => `flow-${organizationId}-${propertyId}-${selectedDate}`, [organizationId, propertyId, selectedDate]);

    // Initialize state from cache if available to prevent flicker
    const [flowData, setFlowData] = useState<FlowData | null>(() => getCachedData(cacheKey));
    const [loading, setLoading] = useState(!flowData);
    const [error, setError] = useState<string | null>(null);
    const [pendingAssignments, setPendingAssignments] = useState<Record<string, string | null>>({});
    const [savingTicketIds, setSavingTicketIds] = useState<Set<string>>(new Set());
    const [isSaving, setIsSaving] = useState(false);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Sync state if cacheKey changes
    useEffect(() => {
        const cached = getCachedData(cacheKey);
        if (cached) {
            setFlowData(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }
    }, [cacheKey, getCachedData]);

    // UI State
    const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
    const [selectedMst, setSelectedMst] = useState<any | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showDevTools, setShowDevTools] = useState(false); // FOR DEMO ONLY
    const [activeId, setActiveId] = useState<string | null>(null);
    const [properties, setProperties] = useState<any[]>([]);
    const [activePropertyId, setActivePropertyId] = useState<string | null>(propertyId || null);
    const [isOrgAdmin, setIsOrgAdmin] = useState(false);
    const [isFetchingProps, setIsFetchingProps] = useState(false);

    // Sync activePropertyId with propertyId prop changes (from Dashboard dropdown)
    useEffect(() => {
        setActivePropertyId(propertyId || null);
    }, [propertyId]);

    const activeTicket = useMemo(() => {
        if (!activeId || !flowData) return null;
        return [...flowData.waitlist, ...flowData.mstGroups.flatMap(g => g.tickets)]
            .find(t => t.id === activeId);
    }, [activeId, flowData]);

    // DND Sensors
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 10,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 200,
                tolerance: 5,
            },
        })
    );

    // Initial check for roles and fetch properties if admin
    useEffect(() => {
        if (!membership) return;

        const checkAdmin = () => {
            const orgRole = membership.org_role;
            const isMaster = (user as any)?.user_metadata?.is_master_admin || (user as any)?.is_master_admin;
            return isMaster || ['org_admin', 'org_super_admin', 'owner'].includes(orgRole || '');
        };

        const adminStatus = checkAdmin();
        setIsOrgAdmin(adminStatus);

        if (adminStatus) {
            fetchProperties();
        }
    }, [membership, user]);

    const fetchProperties = async () => {
        setIsFetchingProps(true);
        try {
            const supabase = createClient();
            let query = supabase.from('properties').select('id, name, code');

            // If org admin, limit to their org
            if (membership?.org_id) {
                query = query.eq('organization_id', membership.org_id);
            }

            const { data, error } = await query.order('name');
            if (error) throw error;
            setProperties(data || []);

            // If no propertyId in props and NOT embedded, default to first property
            if (!propertyId && !isEmbedded && data && data.length > 0) {
                setActivePropertyId(data[0].id);
            }
        } catch (err) {
            console.error('Error fetching properties:', err);
        } finally {
            setIsFetchingProps(false);
        }
    };

    const targetPropId = isEmbedded ? propertyId : (activePropertyId || propertyId);

    const fetchFlowData = useCallback(async (isInitial = false) => {
        // Abort previous request if any
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        // If no property is selected, do not fetch data and clear any existing data
        if (!targetPropId || targetPropId === 'all' || targetPropId === 'undefined') {
            setFlowData(null);
            setLoading(false);
            return;
        }

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const params = new URLSearchParams();
            if (organizationId) params.set('organization_id', organizationId);
            
            params.set('property_id', targetPropId);
            params.set('date', selectedDate);

            const response = await fetch(`/api/tickets/flow?${params}`, {
                signal: controller.signal
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.code === 'MIGRATION_REQUIRED') {
                    setError('MIGRATION_REQUIRED');
                    return;
                }
                throw new Error(data.error || 'Failed to fetch flow data');
            }

            setFlowData(data);
            setCachedData(cacheKey, data);
            setError(null);
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            console.error('[TicketFlowMapV2] Fetch error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            if (abortControllerRef.current === controller) {
                setLoading(false);
            }
        }
    }, [organizationId, propertyId, selectedDate, cacheKey, setCachedData, targetPropId]);

    const lastFetchRef = useRef<number>(0);
    const debouncedFetch = useCallback(() => {
        const now = Date.now();
        if (now - lastFetchRef.current < 200) return; // Throttle to once every 200ms for fast updates
        lastFetchRef.current = now;
        fetchFlowData();
    }, [fetchFlowData]);

    useEffect(() => {
        fetchFlowData(true);
    }, [fetchFlowData]);

    // Realtime subscription
    useEffect(() => {
        const supabase = createClient();

        // Filter changes to current property if available to reduce noise
        const filter = targetPropId ? `property_id=eq.${targetPropId}` : undefined;

        const channel = supabase
            .channel(`flow-${targetPropId || 'global'}`)
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'tickets', filter },
                () => debouncedFetch()
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [targetPropId, debouncedFetch]);

    const handleTicketClick = (ticketId: string) => {
        const ticket = [...(flowData?.waitlist || []), ...(flowData?.mstGroups.flatMap(g => g.tickets) || [])]
            .find(t => t.id === ticketId);
        setSelectedTicket(ticket);
        setIsDetailOpen(true);
    };

    const handleMstClick = (mstId: string) => {
        const group = flowData?.mstGroups.find(g => g.mst.id === mstId);
        setSelectedMst(group?.mst);
        setIsHistoryOpen(true);
    };

    const derivedFlowData = useMemo(() => {
        if (!flowData) return null;

        const allTickets = [...flowData.waitlist, ...flowData.mstGroups.flatMap(g => g.tickets)];
        let updatedWaitlist = [...flowData.waitlist];
        const updatedMstGroups = flowData.mstGroups.map(g => ({ ...g, tickets: [...g.tickets] }));

        Object.entries(pendingAssignments).forEach(([ticketId, newMstId]) => {
            const ticket = allTickets.find((t: any) => t.id === ticketId);
            if (!ticket) return;

            // Remove from current location
            updatedWaitlist = updatedWaitlist.filter((t: any) => t.id !== ticketId);
            updatedMstGroups.forEach(g => {
                g.tickets = g.tickets.filter((t: any) => t.id !== ticketId);
            });

            // Add to new location
            if (newMstId === null) {
                updatedWaitlist.push({ ...ticket, status: 'waitlist' });
            } else {
                const group = updatedMstGroups.find(g => g.mst.id === newMstId);
                if (group) {
                    group.tickets.push({ ...ticket, status: 'assigned' });
                }
            }
        });

        // Filter out from waitlist if moved to MST
        const finalWaitlist = updatedWaitlist.filter(t => !pendingAssignments[t.id] || pendingAssignments[t.id] === null);

        return {
            ...flowData,
            waitlist: finalWaitlist,
            mstGroups: updatedMstGroups
        };
    }, [flowData, pendingAssignments]);

    const filteredMstGroups = useMemo(() => {
        if (!derivedFlowData?.mstGroups) return [];
        return derivedFlowData.mstGroups.filter(g =>
            g.mst.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            g.tickets.some((t: any) => t.id.includes(searchQuery) || t.title.toLowerCase().includes(searchQuery.toLowerCase()))
        );
    }, [derivedFlowData?.mstGroups, searchQuery]);

    const totalCounts = useMemo(() => {
        if (!derivedFlowData) return { A: 0, W: 0, C: 0 };
        const allTickets = [...derivedFlowData.waitlist, ...derivedFlowData.mstGroups.flatMap(g => g.tickets)];
        return {
            A: allTickets.filter(t => ['assigned', 'in_progress'].includes(t.status.toLowerCase())).length,
            W: allTickets.filter(t => t.status.toLowerCase() === 'waitlist').length,
            C: allTickets.filter(t => ['completed', 'resolved', 'closed'].includes(t.status.toLowerCase())).length
        };
    }, [derivedFlowData]);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);
        if (!over) return;

        const ticketId = active.id as string;
        const overId = over.id as string;
        const overData = over.data.current;

        let newMstId: string | null = null;
        if (overId.startsWith('mst-')) {
            newMstId = overData?.mstId;
        } else if (overId === 'waitlist') {
            newMstId = null;
        } else {
            return;
        }

        // Only update if it's different from current
        const currentMstId = flowData?.mstGroups.find(g => g.tickets.some((t: any) => t.id === ticketId))?.mst.id || null;

        if (newMstId !== currentMstId) {
            // Optimistic Update
            setPendingAssignments(prev => ({
                ...prev,
                [ticketId]: newMstId
            }));

            // Immediate Save
            try {
                setSavingTicketIds(prev => new Set(prev).add(ticketId));
                const response = await fetch('/api/tickets/batch-assign', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        assignments: [{
                            ticket_id: ticketId,
                            assigned_to: newMstId
                        }]
                    })
                });

                if (!response.ok) throw new Error('Failed to save assignment');

                // Clear pending and saving for this ticket
                setPendingAssignments(prev => {
                    const next = { ...prev };
                    delete next[ticketId];
                    return next;
                });
                setSavingTicketIds(prev => {
                    const next = new Set(prev);
                    next.delete(ticketId);
                    return next;
                });

                // Refresh data to be sure
                fetchFlowData();
            } catch (err) {
                console.error('[TicketFlowMap] Auto-save error:', err);
                setError('Failed to save assignment. Reverting...');
                // Revert optimistic update and clear saving
                setPendingAssignments(prev => {
                    const next = { ...prev };
                    delete next[ticketId];
                    return next;
                });
                setSavingTicketIds(prev => {
                    const next = new Set(prev);
                    next.delete(ticketId);
                    return next;
                });
            }
        }
    };

    const triggerSimulation = async (type: 'sla' | 'diesel') => {
        try {
            const endpoint = type === 'sla' ? '/api/cron/check-sla' : '/api/cron/check-diesel';
            await fetch(endpoint);
        } catch (e) {
            console.error('Simulation failed', e);
        }
    };

    const handleBack = () => {
        if (!propertyId || !membership) {
            router.back();
            return;
        }

        const propMember = membership.properties.find(p => p.id === propertyId);

        if (propMember) {
            switch (propMember.role) {
                case 'property_admin':
                    if (from === 'requests') {
                        router.push(`/property/${propertyId}/dashboard?tab=requests`);
                    } else {
                        router.push(`/property/${propertyId}/dashboard`);
                    }
                    break;
                case 'mst':
                    router.push(`/property/${propertyId}/mst`);
                    break;
                case 'staff':
                    router.push(`/property/${propertyId}/staff`);
                    break;
                case 'tenant':
                    router.push(`/property/${propertyId}/tenant`);
                    break;
                case 'security':
                    router.push(`/property/${propertyId}/security`);
                    break;
                default:
                    router.push(`/property/${propertyId}/dashboard`);
            }
        } else {
            // Fallback for org admins or if membership not found
            if (organizationId) {
                router.push(`/org/${organizationId}/dashboard`);
            } else {
                router.push(`/property/${propertyId}/dashboard`);
            }
        }
    };

    if (!targetPropId || targetPropId === 'all' || targetPropId === 'undefined') {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-background p-6 text-center">
                <div className="w-20 h-20 bg-primary/5 text-primary rounded-full flex items-center justify-center mb-6">
                    <Building2 className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-display font-medium text-text-primary tracking-tight mb-2">Please Select a Property</h3>
                <p className="text-text-tertiary mb-3 max-w-md text-sm leading-relaxed">
                    The Flow Map visualizes operational queues for specific locations. 
                    Please choose a property from the dropdown above to view its live ticket flow.
                </p>
                <div className="flex gap-2 text-[10px] items-center text-primary mt-2 uppercase font-black tracking-widest px-3 py-1 bg-primary/5 rounded-md">
                    <Activity className="w-3 h-3" />
                    Live Operations Matrix
                </div>
            </div>
        );
    }

    if (loading && !flowData) {
        return (
            <div className="flex flex-col h-full bg-background overflow-hidden">
                <header className="px-6 py-4 border-b border-border bg-surface/50 flex justify-between items-center">
                    <div className="flex gap-4">
                        <Skeleton className="w-24 h-8" />
                        <Skeleton className="w-48 h-8" />
                    </div>
                    <div className="flex gap-4">
                        <Skeleton className="w-32 h-10" />
                        <Skeleton className="w-10 h-10" />
                    </div>
                </header>
                <div className="flex-1 flex overflow-hidden">
                    <div className="w-80 border-r border-border p-6 space-y-4">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="w-full h-24" />)}
                    </div>
                    <div className="flex-1 p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="space-y-4">
                                <Skeleton className="w-full h-12" />
                                <Skeleton className="w-full h-40" />
                                <Skeleton className="w-full h-40" />
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error && !flowData) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-background p-6 text-center">
                <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mb-4">
                    <AlertCircle className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-bold mb-2">Ops! Something went wrong</h3>
                <p className="text-text-secondary mb-6 max-w-md">{error}</p>
                <button
                    onClick={() => { setLoading(true); fetchFlowData(); }}
                    className="px-6 py-3 bg-primary text-white rounded-xl font-bold flex items-center gap-2 hover:bg-primary-dark transition-all"
                >
                    <RefreshCw className="w-4 h-4" /> Try Again
                </button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full max-w-full min-w-0 bg-background text-text-primary overflow-hidden">
            {/* Top Toolbar */}
            <header className="px-4 lg:px-6 py-3 lg:py-4 border-b border-border bg-surface/50 backdrop-blur-md flex items-center justify-between z-20">
                <div className="flex items-center gap-4 lg:gap-6">
                    { !isEmbedded && (
                        <button
                            onClick={handleBack}
                            className="flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-lg text-sm font-bold text-text-secondary hover:bg-slate-50 transition-all group"
                        >
                            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                            <span className="hidden sm:inline">Back</span>
                        </button>
                    )}

                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                            <Activity className="w-5 h-5 text-primary" />
                        </div>
                        <h2 className="text-lg lg:text-xl font-display font-bold tracking-tight">Ticket Flow</h2>
                    </div>

                    <div className="hidden lg:flex items-center gap-4 border-l border-border pl-6">
                        {isOrgAdmin && !isEmbedded && properties.length > 1 && (
                            <div className="flex items-center gap-2">
                                <Building2 className="w-4 h-4 text-primary" />
                                <select
                                    value={activePropertyId || ''}
                                    onChange={(e) => setActivePropertyId(e.target.value)}
                                    className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm font-bold outline-none cursor-pointer text-text-primary h-auto transition-all hover:border-primary/50"
                                    disabled={isFetchingProps}
                                >
                                    {properties.map(prop => (
                                        <option key={prop.id} value={prop.id}>
                                            {prop.name} ({prop.code})
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Summary:</span>
                            <span className="text-sm font-black text-text-secondary">
                                {totalCounts.A}A {totalCounts.W}W {totalCounts.C}C
                            </span>
                        </div>
                        <div className="h-6 w-px bg-border" />
                        <div className="flex flex-col">
                            <span className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">On Shift</span>
                            <span className="text-sm font-black text-success">{flowData?.stats.checkedInMsts || 0}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest">Online</span>
                            <span className="text-sm font-black text-info">{flowData?.stats.onlineMsts || 0}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative hidden xl:block">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                        <input
                            type="text"
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-sm w-64 focus:ring-2 focus:ring-primary/50 outline-none transition-all"
                        />
                    </div>

                    <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-2 lg:px-3 py-2 transition-all hover:border-primary/50">
                        <Calendar className="w-4 h-4 text-primary" />
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-transparent text-sm font-bold outline-none cursor-pointer text-text-primary h-auto w-28 lg:w-auto"
                        />
                    </div>

                    <button
                        onClick={() => { setLoading(true); fetchFlowData(); }}
                        disabled={loading}
                        className={`p-2.5 bg-primary text-text-inverse rounded-lg hover:brightness-110 shadow-lg transition-all relative ${loading && flowData ? 'animate-pulse' : ''}`}
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        {loading && flowData && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-info rounded-full animate-ping" />
                        )}
                    </button>
                </div>
            </header>

            <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                collisionDetection={closestCenter}
            >
                <main className="flex-1 flex flex-col lg:flex-row overflow-y-auto lg:overflow-y-hidden lg:overflow-x-auto p-0 min-h-0 bg-white relative">
                    {/* Upstream Waitlist Feed */}
                    <div className="w-full lg:w-80 flex-shrink-0 flex flex-col bg-slate-50/50 border-b lg:border-b-0 lg:border-r border-slate-200/60 z-20 relative overflow-hidden h-auto lg:h-full transition-all">
                        {/* Feed Flow Visual */}
                        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-r from-transparent to-warning/5 pointer-events-none hidden lg:block" />
                        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-transparent to-warning/5 pointer-events-none lg:hidden" />

                        <div className="absolute top-1/2 -right-4 -translate-y-1/2 w-8 h-8 bg-white border border-slate-200/60 rounded-full items-center justify-center z-30 shadow-sm hidden lg:flex">
                            <ChevronRight className="w-4 h-4 text-warning" />
                        </div>

                        <div className="absolute left-1/2 bottom-[-16px] -translate-x-1/2 w-8 h-8 bg-white border border-slate-200/60 rounded-full items-center justify-center z-30 shadow-sm flex lg:hidden">
                            <ChevronDown className="w-4 h-4 text-warning" />
                        </div>

                        <div className="p-4 lg:p-6 relative z-10 h-full flex flex-col">
                            <WaitlistLane
                                tickets={derivedFlowData?.waitlist || []}
                                onTicketClick={handleTicketClick}
                                savingTicketIds={savingTicketIds}
                            />
                        </div>
                    </div>

                    <div className="flex flex-1 min-w-0 flex-col lg:flex-row h-auto lg:h-full custom-scrollbar">
                        <div className="flex flex-col lg:flex-row h-full min-w-0 lg:min-w-max">
                            {TEAM_CONFIG.map((team) => {
                                const mstsInTeam = filteredMstGroups.filter(g => {
                                    if (team.id === 'housekeeping') {
                                        return g.mst.team === 'housekeeping' || g.mst.team === 'soft_services';
                                    }
                                    const t = (g.mst.team || '').toLowerCase();
                                    // Separate Technical and Plumbing lanes
                                    if (team.id === 'technical') {
                                        return t === 'technical' || (!t);
                                    }
                                    if (team.id === 'plumbing') {
                                        return t === 'plumbing' || t === 'vendor';
                                    }
                                    return t === team.id;
                                });

                                const teamTickets = mstsInTeam.flatMap(g => g.tickets);
                                const teamCounts = {
                                    A: teamTickets.filter(t => ['assigned', 'in_progress'].includes(t.status.toLowerCase())).length,
                                    W: teamTickets.filter(t => t.status.toLowerCase() === 'waitlist').length,
                                    C: teamTickets.filter(t => ['completed', 'resolved', 'closed'].includes(t.status.toLowerCase())).length
                                };

                                const teamColorClass = team.id === 'technical' ? 'text-info' :
                                    team.id === 'plumbing' ? 'text-success' : 'text-error';

                                return (
                                    <div key={team.id} className="w-full lg:w-[400px] flex flex-col border-b lg:border-b-0 lg:border-r border-slate-100 last:border-0 relative group/dept flex-shrink-0 h-[500px] lg:h-full">
                                        {/* Department Vertical Rail Backdrop */}
                                        <div className="absolute inset-0 bg-slate-50/30 opacity-100 transition-opacity pointer-events-none" />

                                        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-white sticky top-0 z-10 w-full flex-shrink-0">
                                            <div className="flex flex-col">
                                                <h3 className={`text-xs font-black uppercase tracking-widest ${teamColorClass}`}>
                                                    {team.label}
                                                </h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <Users className="w-3 h-3 text-slate-400" />
                                                    <span className="text-[10px] font-bold text-slate-500">
                                                        {mstsInTeam.length} Active
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] font-black">
                                                <span className="text-warning bg-warning/5 px-2 py-0.5 rounded border border-warning/10 whitespace-nowrap min-w-[32px] text-center">{teamCounts.A}A</span>
                                                <span className="text-error bg-error/5 px-2 py-0.5 rounded border border-error/10 whitespace-nowrap min-w-[32px] text-center">{teamCounts.W}W</span>
                                                <span className="text-success bg-success/5 px-2 py-0.5 rounded border border-success/10 whitespace-nowrap min-w-[32px] text-center">{teamCounts.C}C</span>
                                            </div>
                                        </div>

                                        <div className="flex-1 overflow-y-auto custom-scrollbar w-full min-h-0">
                                            <div className="flex flex-col px-1">
                                                {mstsInTeam.map((group) => (
                                                    <MstGroup
                                                        key={group.mst.id}
                                                        mst={group.mst}
                                                        tickets={group.tickets}
                                                        savingTicketIds={savingTicketIds}
                                                        onTicketClick={handleTicketClick}
                                                        onMstClick={handleMstClick}
                                                    />
                                                ))}

                                                {mstsInTeam.length === 0 && (
                                                    <div className="p-10 text-center flex flex-col items-center justify-center opacity-30 mt-10">
                                                        <AlertCircle className="w-8 h-8 mb-2" />
                                                        <p className="text-[10px] font-bold uppercase tracking-widest">No Personnel</p>
                                                        <p className="text-[10px] text-slate-400 mt-1">Status: Offline</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </main>
            </DndContext>

            <TicketDetailPanel
                isOpen={isDetailOpen}
                onClose={() => setIsDetailOpen(false)}
                ticket={selectedTicket}
            />

            <MstHistoryDrawer
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                mst={selectedMst}
                tickets={derivedFlowData?.mstGroups.find(g => g.mst.id === selectedMst?.id)?.tickets || []}
            />

            <DragOverlay dropAnimation={null}>
                {activeTicket ? (
                    <div className="opacity-80 scale-110 pointer-events-none">
                        <TicketNode
                            id={activeTicket.id}
                            ticketNumber={activeTicket.ticket_number || activeTicket.ticket_id || activeTicket.id}
                            status={activeTicket.status}
                            title={activeTicket.title}
                            description={activeTicket.description}
                            isOverlay={true}
                        />
                    </div>
                ) : null}
            </DragOverlay>

            {/* DEV TOOLS (Simulations) */}
            <div className={`fixed bottom-4 right-4 z-[9999] transition-all bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden ${showDevTools ? 'w-64' : 'w-10 h-10 rounded-full'}`}>
                {showDevTools ? (
                    <div className="p-4">
                        <div className="flex justify-between items-center mb-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Simulation Tools</span>
                            <button onClick={() => setShowDevTools(false)} className="text-slate-400 hover:text-red-500"><Zap className="w-3 h-3" /></button>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => triggerSimulation('sla')} className="px-3 py-2 bg-red-50 text-red-600 rounded text-xs font-bold hover:bg-red-100 transition-colors text-left flex items-center gap-2">
                                <Activity className="w-3 h-3" /> Simulate SLA Breach
                            </button>
                            <button onClick={() => triggerSimulation('diesel')} className="px-3 py-2 bg-blue-50 text-blue-600 rounded text-xs font-bold hover:bg-blue-100 transition-colors text-left flex items-center gap-2">
                                <AlertCircle className="w-3 h-3" /> Check Diesel Logs
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setShowDevTools(true)} className="w-full h-full flex items-center justify-center bg-slate-900 text-white hover:scale-110 transition-transform">
                        <Zap className="w-4 h-4" />
                    </button>
                )}
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #30363d; border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #484f58; }
            `}</style>
        </div>
    );
}
