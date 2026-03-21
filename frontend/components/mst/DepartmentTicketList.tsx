'use client';

import React, { useState, useEffect } from 'react';
import {
    Wrench, Sparkles, Building2, Clock, UserPlus,
    ChevronRight, AlertCircle, Camera, Users
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MstTicketView, TicketDepartment, MstLoad } from '@/frontend/types/ticketing';
import { getSkillGroupColor, getSkillGroupDisplayName, type SkillGroup } from '@/backend/lib/ticketing';
import { MstLoadDot } from './MstLoadBadge';
import TicketCard from '@/frontend/components/shared/TicketCard';
import { Ticket } from '@/frontend/types/ticketing';

// Map legacy department to new skill_group
const mapDepartmentToSkillGroup = (dept: TicketDepartment): SkillGroup => {
    const mapping: Record<TicketDepartment, SkillGroup> = {
        technical: 'technical',
        soft_services: 'soft_services',
        vendor: 'vendor'
    };
    return mapping[dept] || 'technical';
};

interface DepartmentTicketListProps {
    propertyId: string;
    userId: string;
    onTicketClick: (ticketId: string) => void;
    onSelfAssign: (ticketId: string) => Promise<void>;
}

interface TicketsByDepartment {
    waitlist: MstTicketView[];
    myTickets: MstTicketView[];
    othersTickets: MstTicketView[];
}

interface DepartmentCounts {
    technical: number;
    soft_services: number;
    vendor: number;
}

/**
 * Department-filtered ticket list with toggle
 * Shows: Waitlist (unassigned) | Assigned to Others | My Tickets
 */
export default function DepartmentTicketList({
    propertyId,
    userId,
    onTicketClick,
    onSelfAssign
}: DepartmentTicketListProps) {
    const [activeDepartment, setActiveDepartment] = useState<TicketDepartment>('technical');
    const [tickets, setTickets] = useState<TicketsByDepartment>({
        waitlist: [],
        myTickets: [],
        othersTickets: []
    });
    const [departmentCounts, setDepartmentCounts] = useState<DepartmentCounts>({
        technical: 0,
        soft_services: 0,
        vendor: 0
    });
    const [mstLoads, setMstLoads] = useState<MstLoad[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [assigningTicketId, setAssigningTicketId] = useState<string | null>(null);

    // Fetch tickets for current department
    useEffect(() => {
        fetchDepartmentTickets();
    }, [propertyId, activeDepartment]);

    // Fetch MST loads
    useEffect(() => {
        fetchMstLoads();
    }, [propertyId]);

    const fetchDepartmentTickets = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(
                `/api/tickets/mst?propertyId=${propertyId}&view=department&dept=${activeDepartment}`
            );
            const data = await response.json();

            if (response.ok) {
                setTickets(data.categorized || { waitlist: [], myTickets: [], othersTickets: [] });
                setDepartmentCounts(data.departmentCounts || { technical: 0, soft_services: 0, vendor: 0 });
            }
        } catch (error) {
            console.error('Error fetching department tickets:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchMstLoads = async () => {
        try {
            const response = await fetch(`/api/tickets/mst?propertyId=${propertyId}&view=load`);
            const data = await response.json();
            if (response.ok) {
                setMstLoads(data.mstLoads || []);
            }
        } catch (error) {
            console.error('Error fetching MST loads:', error);
        }
    };

    const handleSelfAssign = async (ticketId: string) => {
        setAssigningTicketId(ticketId);
        try {
            await onSelfAssign(ticketId);
            // Refresh tickets after assignment
            fetchDepartmentTickets();
            fetchMstLoads();
        } finally {
            setAssigningTicketId(null);
        }
    };

    const departments: { key: TicketDepartment; icon: React.ElementType }[] = [
        { key: 'technical', icon: Wrench },
        { key: 'soft_services', icon: Sparkles },
        { key: 'vendor', icon: Building2 }
    ];

    return (
        <div className="space-y-6">
            {/* Department Toggle */}
            <div className="flex gap-2 p-1 bg-muted rounded-xl">
                {departments.map(({ key, icon: Icon }) => {
                    const colors = getSkillGroupColor(mapDepartmentToSkillGroup(key));
                    const count = departmentCounts[key];
                    const isActive = activeDepartment === key;

                    return (
                        <button
                            key={key}
                            onClick={() => setActiveDepartment(key)}
                            className={`
                                flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg 
                                font-bold text-sm transition-all
                                ${isActive
                                    ? `bg-card shadow-sm ${colors.text}`
                                    : 'text-text-tertiary hover:text-text-secondary'
                                }
                            `}
                        >
                            <Icon className="w-4 h-4" />
                            <span className="hidden sm:inline">{getSkillGroupDisplayName(mapDepartmentToSkillGroup(key))}</span>
                            {count > 0 && (
                                <span className={`
                                    px-1.5 py-0.5 rounded-full text-[10px] font-black
                                    ${isActive ? colors.bg : 'bg-surface-elevated'}
                                `}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* MST Load Overview */}
            {mstLoads.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <Users className="w-4 h-4 text-text-tertiary" />
                        <h3 className="text-sm font-bold text-text-secondary">Team Workload</h3>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {mstLoads.slice(0, 5).map((mst) => (
                            <div
                                key={mst.userId}
                                className="flex items-center gap-2 px-3 py-1.5 bg-surface-elevated rounded-lg"
                            >
                                <span className="text-xs text-text-secondary truncate max-w-[80px]">
                                    {mst.fullName.split(' ')[0]}
                                </span>
                                <MstLoadDot count={mst.activeTicketCount} isAvailable={mst.isAvailable} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Loading State */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-24 bg-surface-elevated rounded-xl animate-pulse" />
                    ))}
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Waitlist Section */}
                    <TicketSection
                        title="Waitlist"
                        subtitle="Available for pickup"
                        tickets={tickets.waitlist}
                        userId={userId}
                        onTicketClick={onTicketClick}
                        onSelfAssign={handleSelfAssign}
                        assigningTicketId={assigningTicketId}
                        showAssignButton={true}
                        emptyMessage="No tickets waiting in this department"
                        accentColor="emerald"
                    />

                    {/* My Tickets Section */}
                    {tickets.myTickets.length > 0 && (
                        <TicketSection
                            title="My Tickets"
                            subtitle="Assigned to you"
                            tickets={tickets.myTickets}
                            userId={userId}
                            onTicketClick={onTicketClick}
                            showAssignButton={false}
                            emptyMessage=""
                            accentColor="primary"
                        />
                    )}

                    {/* Others' Tickets Section */}
                    {tickets.othersTickets.length > 0 && (
                        <TicketSection
                            title="Assigned to Others"
                            subtitle="For visibility"
                            tickets={tickets.othersTickets}
                            userId={userId}
                            onTicketClick={onTicketClick}
                            showAssignButton={false}
                            emptyMessage=""
                            accentColor="gray"
                            muted={true}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

// Ticket Section Component
interface TicketSectionProps {
    title: string;
    subtitle: string;
    tickets: MstTicketView[];
    userId: string;
    onTicketClick: (ticketId: string) => void;
    onSelfAssign?: (ticketId: string) => Promise<void>;
    assigningTicketId?: string | null;
    showAssignButton: boolean;
    emptyMessage: string;
    accentColor: 'emerald' | 'primary' | 'gray';
    muted?: boolean;
}

function TicketSection({
    title,
    subtitle,
    tickets,
    userId,
    onTicketClick,
    onSelfAssign,
    assigningTicketId,
    showAssignButton,
    emptyMessage,
    accentColor,
    muted = false
}: TicketSectionProps) {
    if (tickets.length === 0 && !emptyMessage) return null;

    const colorMap = {
        emerald: 'text-emerald-500',
        primary: 'text-primary',
        gray: 'text-text-tertiary'
    };

    return (
        <div className={muted ? 'opacity-70' : ''}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <h3 className={`text-sm font-bold ${colorMap[accentColor]}`}>{title}</h3>
                    <span className="text-xs text-text-tertiary">({tickets.length})</span>
                </div>
                <span className="text-xs text-text-tertiary">{subtitle}</span>
            </div>

            {tickets.length === 0 ? (
                <div className="bg-surface-elevated border border-dashed border-border rounded-xl p-6 text-center">
                    <p className="text-sm text-text-tertiary">{emptyMessage}</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {tickets.map((ticket) => (
                        <TicketCard
                            key={ticket.id}
                            id={ticket.id}
                            title={ticket.title}
                            priority={ticket.priority?.toUpperCase() as any || 'MEDIUM'}
                            status={
                                ['closed', 'resolved'].includes(ticket.status) ? 'COMPLETED' :
                                    ticket.status === 'in_progress' ? 'IN_PROGRESS' :
                                        ticket.assigned_to ? 'ASSIGNED' : 'OPEN'
                            }
                            ticketNumber={ticket.ticket_number}
                            createdAt={ticket.created_at}
                            assignedTo={ticket.assignee?.full_name}
                            assigneePhotoUrl={(ticket.assignee as any)?.user_photo_url}
                            photoUrl={ticket.photo_before_url}
                            escalationChain={(() => { const logs = ticket.ticket_escalation_logs; if (!logs || logs.length === 0) return undefined; const sorted = [...logs].sort((a, b) => new Date(a.escalated_at).getTime() - new Date(b.escalated_at).getTime()); const chain: { name: string; avatar?: string | null }[] = []; sorted.forEach((log, i) => { if (i === 0 && log.from_employee?.full_name) chain.push({ name: log.from_employee.full_name, avatar: log.from_employee.user_photo_url }); if (log.to_employee?.full_name) chain.push({ name: log.to_employee.full_name, avatar: log.to_employee.user_photo_url }); }); return chain.length > 0 ? chain : undefined; })()}
                            raisedByTenant={!ticket.internal}
                            onClick={() => onTicketClick(ticket.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

// TicketCard sub-component replaced by shared/TicketCard
