/**
 * KanbanColumn
 * Column component for Kanban board (each column = a ticket status).
 * @remarks Client component.
 */

'use client';

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import KanbanCard from './KanbanCard';

interface Ticket {
    id: string;
    title: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
    status: string;
    assigned_to: string | null;
    skill_group?: { code: string; name: string };
    created_at: string;
}

interface KanbanColumnProps {
    id: string;
    label: string;
    color: string;
    tickets: Ticket[];
}

/**
 * Kanban Column - Droppable container for a status
 * PRD 5.1: Waitlist → Assigned → In Progress → Blocked → Resolved
 */
export default function KanbanColumn({ id, label, color, tickets }: KanbanColumnProps) {
    const { setNodeRef, isOver } = useDroppable({ id });

    return (
        <div
            ref={setNodeRef}
            className={`
                w-72 flex-shrink-0 flex flex-col bg-surface/30 rounded-2xl border-2 transition-all
                ${isOver ? 'border-primary shadow-lg scale-[1.02]' : 'border-transparent'}
            `}
        >
            {/* Column Header */}
            <div className={`px-4 py-3 border-b-2 ${color} bg-surface/50 rounded-t-2xl`}>
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold uppercase tracking-wide text-text-primary">
                        {label}
                    </h3>
                    <span className="text-xs font-mono font-bold bg-muted text-text-muted px-2 py-0.5 rounded-full">
                        {tickets.length}
                    </span>
                </div>
            </div>

            {/* Tickets Container */}
            <SortableContext items={tickets.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="flex-1 p-3 overflow-y-auto custom-scrollbar space-y-2 min-h-[200px]">
                    {tickets.length > 0 ? (
                        tickets.map(ticket => (
                            <KanbanCard key={ticket.id} ticket={ticket} />
                        ))
                    ) : (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="h-full min-h-[160px] flex items-center justify-center border-2 border-dashed border-border rounded-xl"
                        >
                            <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest">
                                Drop here
                            </span>
                        </motion.div>
                    )}
                </div>
            </SortableContext>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar { width: 4px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: #30363d; border-radius: 10px; }
            `}</style>
        </div>
    );
}
