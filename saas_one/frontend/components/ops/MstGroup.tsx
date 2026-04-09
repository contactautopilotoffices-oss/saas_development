/**
 * MstGroup - Card component that groups all tickets assigned to a single Maintenance Service
 * Technician (MST) agent within the ticket flow map.
 *
 * Displays the MST's avatar, name, team, online status indicator, and load-state badge
 * (Idle/Available/Busy/Overloaded). Tickets are organized into three status zones:
 * A (Assigned/In-Progress), W (Waitlist), and C (Completed/Done). Each TicketNode is
 * wrapped in a useDroppable zone so tickets can be dragged and reassigned. Off-shift
 * MSTs are visually greyed out and dimmed for clear operational visibility.
 *
 * PRD 4.4: Load indicators reflect ticket count thresholds — 0=Idle, 1-2=Available,
 * 3-4=Busy, 5+=Overloaded.
 *
 * @example
 * <MstGroup
 *   mst={{ id: 'mst-1', full_name: 'Alice', team: 'Technical', ... }}
 *   tickets={[...]}
 *   savingTicketIds={new Set()}
 *   onTicketClick={(id) => openPanel(id)}
 *   onMstClick={(id) => openHistory(id)}
 * />
 */
'use client';

import { motion } from 'framer-motion';
import { User, Shield, Circle } from 'lucide-react';
import TicketNode from './TicketNode';
import { useDroppable } from '@dnd-kit/core';

interface MstGroupProps {
    mst: {
        id: string;
        full_name: string;
        avatar_url?: string;
        user_photo_url?: string;
        online_status: 'online' | 'offline' | 'busy';
        team: string;
        is_checked_in?: boolean;
        is_available?: boolean;
    };
    tickets: any[];
    savingTicketIds: Set<string>;
    onTicketClick: (ticketId: string) => void;
    onMstClick: (mstId: string) => void;
}

/**
 * MST Group - Grouping tickets by the person assigned to them
 * PRD 4.4: Shows load indicators (Idle/Available/Busy/Overloaded)
 * PRD: Off-shift MSTs are greyed out for clear visibility
 */
export default function MstGroup({
    mst,
    tickets,
    savingTicketIds,
    onTicketClick,
    onMstClick,
}: MstGroupProps) {
    const { isOver, setNodeRef } = useDroppable({
        id: `mst-${mst.id}`,
        data: {
            type: 'mst',
            mstId: mst.id,
        }
    });

    const isOnline = mst.online_status === 'online';
    const isOnShift = mst.is_checked_in !== false; // Default to on-shift if not specified

    // PRD 4.4: Load state calculation
    const ticketCount = tickets.length;
    const loadState = ticketCount === 0 ? 'Idle' :
        ticketCount <= 2 ? 'Available' :
            ticketCount <= 4 ? 'Busy' : 'Overloaded';
    const loadColor = loadState === 'Idle' ? 'text-text-muted bg-muted' :
        loadState === 'Available' ? 'text-success bg-success/10' :
            loadState === 'Busy' ? 'text-warning bg-warning/10' :
                'text-error bg-error/10';

    const groupedTickets = {
        A: tickets.filter(t => ['assigned', 'in_progress'].includes(t.status.toLowerCase())),
        W: tickets.filter(t => t.status.toLowerCase() === 'waitlist'),
        C: tickets.filter(t => ['completed', 'resolved', 'closed'].includes(t.status.toLowerCase()))
    };

    return (
        <div
            ref={setNodeRef}
            className={`transition-all p-4 border-b border-border/40 relative group/mst-lane ${isOver ? 'bg-primary/5 scale-[1.01]' : ''
                } ${!isOnShift ? 'opacity-40 grayscale' : ''}`}
        >
            {/* Horizontal Rail Extension */}
            <div className="absolute left-0 right-0 top-0 h-px bg-border/20 -mx-6" />

            {/* MST Header */}
            <div
                className="flex items-center gap-3 mb-3 cursor-pointer group"
                onClick={() => onMstClick(mst.id)}
            >
                <div className="relative flex-shrink-0">
                    {mst.user_photo_url || mst.avatar_url ? (
                        <img
                            src={`${mst.user_photo_url || mst.avatar_url}${((mst.user_photo_url || mst.avatar_url) as string)?.includes('supabase') ? '?width=80&height=80&resize=cover' : ''}`}
                            alt={mst.full_name}
                            loading="lazy"
                            className={`w-10 h-10 rounded-full border transition-colors object-cover ${!isOnShift ? 'border-border/50' : 'border-border group-hover:border-primary'
                                }`}
                        />
                    ) : (
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${!isOnShift ? 'bg-muted text-text-muted' : 'bg-primary/10 text-primary group-hover:bg-primary/20'
                            }`}>
                            <User className="w-5 h-5" />
                        </div>
                    )}
                    <span
                        className={`
                            absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-background
                            ${!isOnShift ? 'bg-text-muted' : isOnline ? 'bg-success' : 'bg-text-muted'}
                        `}
                    />
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className={`text-base font-black transition-colors ${!isOnShift ? 'text-slate-400' : 'text-slate-900 group-hover:text-primary'
                            }`}>
                            {mst.full_name || 'Unassigned'}
                        </span>
                        {/* Load Indicator Badge */}
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${loadColor}`}>
                            {loadState}
                        </span>
                        <div className="flex items-center gap-3 ml-auto text-[10px] font-black text-slate-400">
                            <span className={groupedTickets.A.length > 0 ? 'text-warning' : ''}>A:{groupedTickets.A.length}</span>
                            <span className={groupedTickets.W.length > 0 ? 'text-error' : ''}>W:{groupedTickets.W.length}</span>
                            <span className={groupedTickets.C.length > 0 ? 'text-success' : ''}>C:{groupedTickets.C.length}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-text-tertiary flex items-center gap-1 uppercase tracking-wider font-bold">
                            <Shield className="w-3 h-3 text-primary" />
                            {mst.team || 'Field Ops'}
                        </span>
                        {!isOnShift && (
                            <span className="text-[9px] text-text-muted uppercase font-bold">
                                Off Shift
                            </span>
                        )}
                    </div>
                </div>

                <div className="ml-auto text-xs text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity">
                    View History
                </div>
            </div>

            {/* Tickets Flow Zones */}
            <div className="grid grid-cols-1 sm:flex items-start gap-4 mt-4">
                {/* Zone A: Assigned */}
                <div className={`flex-1 min-h-[44px] p-2 rounded-lg bg-slate-50/50 border border-slate-100 flex flex-wrap gap-2 relative ${groupedTickets.A.length === 0 ? 'opacity-30' : ''}`}>
                    <span className="absolute -top-2 left-2 px-1 text-[8px] font-black bg-white border border-slate-200 text-slate-400 uppercase tracking-tighter">Assigned</span>
                    {groupedTickets.A.map(ticket => (
                        <TicketNode
                            key={ticket.id}
                            id={ticket.id}
                            ticketNumber={ticket.ticket_number || ticket.ticket_id || ticket.id}
                            status={ticket.status}
                            title={ticket.title}
                            description={ticket.description}
                            assignedToName={mst.full_name}
                            isSaving={savingTicketIds.has(ticket.id)}
                            onClick={() => onTicketClick(ticket.id)}
                        />
                    ))}
                </div>

                {/* Zone W: Waitlist */}
                <div className={`w-full sm:w-[90px] min-h-[44px] p-2 rounded-lg bg-rose-50/30 border border-rose-100 flex flex-row sm:flex-col flex-wrap sm:flex-nowrap gap-2 items-center relative ${groupedTickets.W.length === 0 ? 'opacity-20' : ''}`}>
                    <span className="absolute -top-2 left-2 px-1 text-[8px] font-black bg-white border border-rose-200 text-rose-400 uppercase tracking-tighter">Waitlist</span>
                    {groupedTickets.W.map(ticket => (
                        <TicketNode
                            key={ticket.id}
                            id={ticket.id}
                            ticketNumber={ticket.ticket_number || ticket.ticket_id || ticket.id}
                            status={ticket.status}
                            title={ticket.title}
                            description={ticket.description}
                            assignedToName={mst.full_name}
                            isSaving={savingTicketIds.has(ticket.id)}
                            onClick={() => onTicketClick(ticket.id)}
                        />
                    ))}
                </div>

                {/* Zone C: Completed */}
                <div className={`w-full sm:w-[90px] min-h-[44px] p-2 rounded-lg bg-green-50/30 border border-green-100 flex flex-row sm:flex-col flex-wrap sm:flex-nowrap gap-2 items-center relative ${groupedTickets.C.length === 0 ? 'opacity-20' : ''}`}>
                    <span className="absolute -top-2 left-2 px-1 text-[8px] font-black bg-white border border-green-200 text-green-400 uppercase tracking-tighter">Done</span>
                    {groupedTickets.C.map(ticket => (
                        <TicketNode
                            key={ticket.id}
                            id={ticket.id}
                            ticketNumber={ticket.ticket_number || ticket.ticket_id || ticket.id}
                            status={ticket.status}
                            title={ticket.title}
                            description={ticket.description}
                            assignedToName={mst.full_name}
                            isSaving={savingTicketIds.has(ticket.id)}
                            onClick={() => onTicketClick(ticket.id)}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
