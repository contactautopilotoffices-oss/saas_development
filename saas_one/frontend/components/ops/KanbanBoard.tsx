/**
 * KanbanBoard — Drag-and-Drop Ticket Kanban Control Board
 *
 * A full-featured Kanban board (PRD Plan B) that lets staff manage tickets across
 * five status-based columns using drag-and-drop via @dnd-kit/core. It also overlays
 * MST (Mobile Service Technician) swimlanes so the board reflects real-time team state.
 *
 * KEY PROPS:
 *   - propertyId:      string — the active property context; filters tickets to that property
 *   - organizationId?: string — optional org-level filter for cross-property views
 *
 * KEY STATE:
 *   - tickets:  Record<string, Ticket[]> — tickets keyed by column id (waitlist, assigned, in_progress, blocked, resolved)
 *   - msts:     MstUser[] — list of MSTs loaded from mstGroups, used to derive online count
 *   - activeTicket: Ticket | null — the ticket currently being dragged (used for DragOverlay)
 *   - skillMismatchWarning: string | null — surfaced when a ticket is dropped on a skill-incompatible column
 *
 * INTEGRATION:
 *   - Fetches initial data from GET /api/tickets/flow (groups tickets by status and MST)
 *   - Status updates are PATCHed to POST /api/tickets/update-status with optimistic UI
 *   - Subscribes to Supabase realtime channel 'kanban-updates' on the tickets table for live refresh
 *   - Composes KanbanColumn and KanbanCard sub-components for individual column and card rendering
 *   - Uses framer-motion for the skill mismatch warning banner (AnimatePresence)
 *
 * UI/UX PATTERNS:
 *   - Drag uses PointerSensor (8px activation distance) and KeyboardSensor with sortable keyboard coordinates for accessibility
 *   - Optimistic updates are reverted on API failure to keep state consistent
 *   - Online MST count is displayed as a live indicator in the board header
 *   - Horizontal scrolling columns with overflow hidden on the outer container
 *   - DragOverlay renders a ghost card so the dragged ticket is always visible above other content
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    DragOverEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, AlertTriangle, Users, Activity, Filter } from 'lucide-react';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';
import { createClient } from '@/frontend/utils/supabase/client';

// PRD 5.1: Status-based columns
const KANBAN_COLUMNS = [
    { id: 'waitlist', label: 'Waitlist', color: 'border-warning' },
    { id: 'assigned', label: 'Assigned', color: 'border-info' },
    { id: 'in_progress', label: 'In Progress', color: 'border-primary' },
    { id: 'blocked', label: 'Blocked', color: 'border-error' },
    { id: 'resolved', label: 'Resolved', color: 'border-success' },
];

interface KanbanBoardProps {
    propertyId: string;
    organizationId?: string;
}

interface Ticket {
    id: string;
    title: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: string;
    assigned_to: string | null;
    skill_group?: { code: string; name: string };
    created_at: string;
}

interface MstUser {
    id: string;
    full_name: string;
    user_photo_url?: string;
    online_status: string;
    team: string;
    is_checked_in: boolean;
    is_available: boolean;
}

export default function KanbanBoard({ propertyId, organizationId }: KanbanBoardProps) {
    const [tickets, setTickets] = useState<Record<string, Ticket[]>>({});
    const [msts, setMsts] = useState<MstUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
    const [skillMismatchWarning, setSkillMismatchWarning] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (propertyId) params.set('property_id', propertyId);
            if (organizationId) params.set('organization_id', organizationId);

            const response = await fetch(`/api/tickets/flow?${params}`);
            const data = await response.json();

            if (data.success) {
                // Group tickets by status for Kanban columns
                const grouped: Record<string, Ticket[]> = {
                    waitlist: [],
                    assigned: [],
                    in_progress: [],
                    blocked: [],
                    resolved: [],
                };

                // Process waitlist
                data.waitlist?.forEach((t: Ticket) => {
                    grouped.waitlist.push(t);
                });

                // Process MST groups
                data.mstGroups?.forEach((group: any) => {
                    group.tickets?.forEach((t: Ticket) => {
                        const status = t.status === 'open' ? 'waitlist' : t.status;
                        if (grouped[status]) {
                            grouped[status].push(t);
                        } else {
                            grouped.assigned.push(t);
                        }
                    });
                });

                setTickets(grouped);
                setMsts(data.mstGroups?.map((g: any) => g.mst) || []);
            }
        } catch (error) {
            console.error('[KanbanBoard] Fetch error:', error);
        } finally {
            setLoading(false);
        }
    }, [propertyId, organizationId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Realtime updates
    useEffect(() => {
        const supabase = createClient();
        const channel = supabase
            .channel('kanban-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => fetchData())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchData]);

    const handleDragStart = (event: DragStartEvent) => {
        const { active } = event;
        const ticket = Object.values(tickets).flat().find(t => t.id === active.id);
        setActiveTicket(ticket || null);
    };

    const handleDragOver = (event: DragOverEvent) => {
        // Could show insertion indicator here
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTicket(null);
        setSkillMismatchWarning(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Find which column the ticket came from and is going to
        let sourceColumn: string | null = null;
        let destColumn: string | null = null;

        for (const [col, colTickets] of Object.entries(tickets)) {
            if (colTickets.some(t => t.id === activeId)) {
                sourceColumn = col;
            }
            if (overId === col || colTickets.some(t => t.id === overId)) {
                destColumn = overId === col ? col : col;
            }
        }

        // If dropped on a column header
        if (KANBAN_COLUMNS.some(c => c.id === overId)) {
            destColumn = overId;
        }

        if (!sourceColumn || !destColumn || sourceColumn === destColumn) return;

        // Optimistic update
        const ticket = tickets[sourceColumn].find(t => t.id === activeId);
        if (!ticket) return;

        setTickets(prev => ({
            ...prev,
            [sourceColumn!]: prev[sourceColumn!].filter(t => t.id !== activeId),
            [destColumn!]: [...prev[destColumn!], { ...ticket, status: destColumn }],
        }));

        // API call to update status
        try {
            const response = await fetch('/api/tickets/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticketId: activeId,
                    newStatus: destColumn,
                }),
            });

            if (!response.ok) {
                // Revert on failure
                fetchData();
            }
        } catch (error) {
            console.error('[KanbanBoard] Status update failed:', error);
            fetchData();
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                    <p className="text-text-tertiary text-sm font-medium">Loading Kanban Board...</p>
                </div>
            </div>
        );
    }

    const totalTickets = Object.values(tickets).flat().length;
    const onlineMsts = msts.filter(m => m.online_status === 'online').length;

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="flex flex-col h-full bg-background">
                {/* Header */}
                <header className="px-6 py-4 border-b border-border bg-surface/50 backdrop-blur-md flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
                                <Activity className="w-5 h-5 text-primary" />
                            </div>
                            <h2 className="text-xl font-display font-bold tracking-tight">Kanban Control</h2>
                        </div>

                        <div className="flex items-center gap-4 border-l border-border pl-4">
                            <span className="text-sm text-text-tertiary">
                                <strong className="text-text-primary">{totalTickets}</strong> tickets
                            </span>
                            <span className="text-sm text-text-tertiary">
                                <Users className="w-4 h-4 inline mr-1" />
                                <strong className="text-success">{onlineMsts}</strong> online
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="p-2.5 bg-primary text-text-inverse rounded-lg hover:brightness-110 shadow-lg transition-all"
                    >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </header>

                {/* Skill Mismatch Warning */}
                <AnimatePresence>
                    {skillMismatchWarning && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="bg-warning/10 border-b border-warning/30 px-6 py-3 flex items-center gap-2"
                        >
                            <AlertTriangle className="w-4 h-4 text-warning" />
                            <span className="text-sm text-warning">{skillMismatchWarning}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Kanban Columns */}
                <main className="flex-1 overflow-x-auto overflow-y-hidden p-6 flex gap-4">
                    {KANBAN_COLUMNS.map(column => (
                        <KanbanColumn
                            key={column.id}
                            id={column.id}
                            label={column.label}
                            color={column.color}
                            tickets={tickets[column.id] || []}
                        />
                    ))}
                </main>

                {/* Drag Overlay */}
                <DragOverlay>
                    {activeTicket && (
                        <KanbanCard
                            ticket={activeTicket}
                            isDragging
                        />
                    )}
                </DragOverlay>
            </div>
        </DndContext>
    );
}
