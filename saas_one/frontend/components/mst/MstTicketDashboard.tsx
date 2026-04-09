/**
 * MstTicketDashboard - Primary ticket management dashboard for Maintenance Service Technicians (MSTs).
 *
 * Provides three tabbed views: "My Work" (active ticket + paused tickets with action buttons),
 * "Department" (team queue with self-assign), and "All Requests" (property-wide read-only feed).
 * Fetches ticket data from `/api/tickets/mst` and `/api/tickets/mst?view=all`. Supports
 * ticket actions including start_work, resume_work, pause_work (via TicketPauseModal),
 * and complete. Shows live status counts (waitlist, assigned, in-progress, paused, completed).
 *
 * @example
 * <MstTicketDashboard
 *   propertyId="prop-123"
 *   userId="user-456"
 *   propertyName="Apex Tower"
 *   userName="John Doe"
 * />
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
    LayoutDashboard, ClipboardList, Layers, RefreshCw,
    Clock, CheckCircle2, AlertCircle, Ticket
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { MstTicketView } from '@/frontend/types/ticketing';
import ActiveTicketCard, { NoActiveTicketCard } from './ActiveTicketCard';
import DepartmentTicketList from './DepartmentTicketList';
import TicketPauseModal from './TicketPauseModal';

interface MstTicketDashboardProps {
    propertyId: string;
    userId: string;
    propertyName?: string;
    userName?: string;
}

type TabId = 'my_work' | 'department' | 'all';

interface TabConfig {
    id: TabId;
    label: string;
    icon: React.ElementType;
}

const tabs: TabConfig[] = [
    { id: 'my_work', label: 'My Work', icon: ClipboardList },
    { id: 'department', label: 'Department', icon: Layers },
    { id: 'all', label: 'All Requests', icon: LayoutDashboard },
];

/**
 * Main MST Ticket Dashboard
 * Three tabs: My Work | Department | All Requests
 */
export default function MstTicketDashboard({
    propertyId,
    userId,
    propertyName,
    userName
}: MstTicketDashboardProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabId>('my_work');
    const [activeTicket, setActiveTicket] = useState<MstTicketView | null>(null);
    const [pausedTickets, setPausedTickets] = useState<MstTicketView[]>([]);
    const [allTickets, setAllTickets] = useState<MstTicketView[]>([]);
    const [statusCounts, setStatusCounts] = useState({
        waitlist: 0,
        assigned: 0,
        in_progress: 0,
        paused: 0,
        completed: 0
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showPauseModal, setShowPauseModal] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    // Fetch active ticket data
    const fetchMyWork = useCallback(async () => {
        try {
            const response = await fetch(`/api/tickets/mst?propertyId=${propertyId}&view=my_active`);
            const data = await response.json();
            
            if (response.ok) {
                setActiveTicket(data.activeTicket || null);
                setPausedTickets(data.pausedTickets || []);
            }
        } catch (error) {
            console.error('Error fetching my work:', error);
        }
    }, [propertyId]);

    // Fetch all tickets
    const fetchAllTickets = useCallback(async () => {
        try {
            const response = await fetch(`/api/tickets/mst?propertyId=${propertyId}&view=all`);
            const data = await response.json();
            
            if (response.ok) {
                setAllTickets(data.tickets || []);
                setStatusCounts(data.statusCounts || {
                    waitlist: 0,
                    assigned: 0,
                    in_progress: 0,
                    paused: 0,
                    completed: 0
                });
            }
        } catch (error) {
            console.error('Error fetching all tickets:', error);
        }
    }, [propertyId]);

    // Initial load
    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            await Promise.all([fetchMyWork(), fetchAllTickets()]);
            setIsLoading(false);
        };
        loadData();
    }, [fetchMyWork, fetchAllTickets]);

    // Refresh handler
    const handleRefresh = async () => {
        setIsRefreshing(true);
        await Promise.all([fetchMyWork(), fetchAllTickets()]);
        setIsRefreshing(false);
    };

    // Ticket action handlers
    const handleTicketAction = async (action: string, ticketId: string, reason?: string) => {
        setActionLoading(true);
        try {
            const body: Record<string, string> = { action };
            if (reason) body.work_pause_reason = reason;

            const response = await fetch(`/api/tickets/${ticketId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Action failed');
            }

            // Refresh data after action
            await fetchMyWork();
            await fetchAllTickets();
        } catch (error) {
            console.error('Action error:', error);
            // Could add toast notification here
        } finally {
            setActionLoading(false);
        }
    };

    const handleStartWork = async () => {
        if (!activeTicket) return;
        const action = activeTicket.status === 'assigned' ? 'start_work' : 'resume_work';
        await handleTicketAction(action, activeTicket.id);
    };

    const handlePauseWork = async (reason: string) => {
        if (!activeTicket) return;
        await handleTicketAction('pause_work', activeTicket.id, reason);
    };

    const handleComplete = async () => {
        if (!activeTicket) return;
        await handleTicketAction('complete', activeTicket.id);
    };

    const handleSelfAssign = async (ticketId: string) => {
        await handleTicketAction('self_assign', ticketId);
    };

    const handleTicketClick = (ticketId: string) => {
        router.push(`/tickets/${ticketId}`);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-text-primary">Ticket Management</h1>
                    <p className="text-text-tertiary text-sm mt-1">
                        {propertyName} {userName && `• MST: ${userName}`}
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-4 py-2 bg-surface-elevated border border-border rounded-xl text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-muted transition-all disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <StatCard label="Waitlist" value={statusCounts.waitlist} color="emerald" icon={Clock} />
                <StatCard label="Assigned" value={statusCounts.assigned} color="blue" icon={Ticket} />
                <StatCard label="In Progress" value={statusCounts.in_progress} color="primary" icon={ClipboardList} />
                <StatCard label="Paused" value={statusCounts.paused} color="amber" icon={AlertCircle} />
                <StatCard label="Completed" value={statusCounts.completed} color="gray" icon={CheckCircle2} />
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-1 p-1 bg-muted rounded-xl">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`
                                flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
                                font-bold text-sm transition-all
                                ${isActive 
                                    ? 'bg-card shadow-sm text-primary' 
                                    : 'text-text-tertiary hover:text-text-secondary'
                                }
                            `}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                >
                    {isLoading ? (
                        <LoadingState />
                    ) : (
                        <>
                            {activeTab === 'my_work' && (
                                <MyWorkTab
                                    activeTicket={activeTicket}
                                    pausedTickets={pausedTickets}
                                    onStartWork={handleStartWork}
                                    onPauseWork={() => setShowPauseModal(true)}
                                    onComplete={handleComplete}
                                    onViewDetails={() => activeTicket && handleTicketClick(activeTicket.id)}
                                    onBrowseDepartment={() => setActiveTab('department')}
                                    onTicketClick={handleTicketClick}
                                    isLoading={actionLoading}
                                />
                            )}
                            {activeTab === 'department' && (
                                <DepartmentTicketList
                                    propertyId={propertyId}
                                    userId={userId}
                                    onTicketClick={handleTicketClick}
                                    onSelfAssign={handleSelfAssign}
                                />
                            )}
                            {activeTab === 'all' && (
                                <AllTicketsTab
                                    tickets={allTickets}
                                    userId={userId}
                                    onTicketClick={handleTicketClick}
                                />
                            )}
                        </>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* Pause Modal */}
            <TicketPauseModal
                isOpen={showPauseModal}
                onClose={() => setShowPauseModal(false)}
                onConfirm={handlePauseWork}
                ticketTitle={activeTicket?.title}
                isLoading={actionLoading}
            />
        </div>
    );
}

// Stat Card Component
function StatCard({ 
    label, 
    value, 
    color,
    icon: Icon
}: { 
    label: string; 
    value: number; 
    color: 'emerald' | 'blue' | 'primary' | 'amber' | 'gray';
    icon: React.ElementType;
}) {
    const colorMap = {
        emerald: 'text-emerald-500 bg-emerald-500/10',
        blue: 'text-blue-500 bg-blue-500/10',
        primary: 'text-primary bg-primary/10',
        amber: 'text-amber-500 bg-amber-500/10',
        gray: 'text-text-tertiary bg-muted'
    };

    return (
        <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
                    <Icon className="w-4 h-4" />
                </div>
                <span className={`text-2xl font-bold ${color === 'gray' ? 'text-text-tertiary' : colorMap[color].split(' ')[0]}`}>
                    {value}
                </span>
            </div>
            <p className="text-xs text-text-tertiary mt-2 font-medium">{label}</p>
        </div>
    );
}

// My Work Tab
function MyWorkTab({
    activeTicket,
    pausedTickets,
    onStartWork,
    onPauseWork,
    onComplete,
    onViewDetails,
    onBrowseDepartment,
    onTicketClick,
    isLoading
}: {
    activeTicket: MstTicketView | null;
    pausedTickets: MstTicketView[];
    onStartWork: () => Promise<void>;
    onPauseWork: () => void;
    onComplete: () => Promise<void>;
    onViewDetails: () => void;
    onBrowseDepartment: () => void;
    onTicketClick: (id: string) => void;
    isLoading: boolean;
}) {
    return (
        <div className="space-y-6">
            {/* Active Ticket or Empty State */}
            {activeTicket ? (
                <ActiveTicketCard
                    ticket={activeTicket}
                    onStartWork={onStartWork}
                    onPauseWork={onPauseWork}
                    onComplete={onComplete}
                    onViewDetails={onViewDetails}
                    isLoading={isLoading}
                />
            ) : (
                <NoActiveTicketCard onBrowseDepartment={onBrowseDepartment} />
            )}

            {/* Paused Tickets */}
            {pausedTickets.length > 0 && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-amber-600 mb-3 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        Paused Tickets ({pausedTickets.length})
                    </h3>
                    <div className="space-y-2">
                        {pausedTickets.map((ticket) => (
                            <div
                                key={ticket.id}
                                onClick={() => onTicketClick(ticket.id)}
                                className="bg-card border border-border rounded-lg p-3 cursor-pointer hover:border-amber-500/30 transition-colors"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-medium text-text-primary">{ticket.title}</p>
                                        <p className="text-xs text-amber-600 mt-1">
                                            {ticket.work_pause_reason}
                                        </p>
                                    </div>
                                    <span className="text-xs text-text-tertiary">
                                        #{ticket.ticket_number}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// All Tickets Tab (Read-only)
function AllTicketsTab({
    tickets,
    userId,
    onTicketClick
}: {
    tickets: MstTicketView[];
    userId: string;
    onTicketClick: (id: string) => void;
}) {
    return (
        <div className="space-y-4">
            <p className="text-sm text-text-tertiary">
                Property-wide ticket visibility for peer accountability. This view is read-only.
            </p>
            
            {tickets.length === 0 ? (
                <div className="bg-surface-elevated border border-dashed border-border rounded-xl p-8 text-center">
                    <Ticket className="w-12 h-12 text-text-tertiary mx-auto mb-3 opacity-50" />
                    <p className="text-text-tertiary">No tickets found</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {tickets.map((ticket) => (
                        <div
                            key={ticket.id}
                            onClick={() => onTicketClick(ticket.id)}
                            className={`
                                bg-card border rounded-lg p-4 cursor-pointer transition-colors
                                ${ticket.assigned_to === userId 
                                    ? 'border-primary/30 hover:border-primary/50' 
                                    : 'border-border hover:border-primary/20'
                                }
                            `}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                                            ticket.status === 'closed' ? 'bg-emerald-500/10 text-emerald-500' :
                                            ticket.status === 'in_progress' ? 'bg-blue-500/10 text-blue-500' :
                                            ticket.status === 'paused' ? 'bg-amber-500/10 text-amber-500' :
                                            'bg-muted text-text-tertiary'
                                        }`}>
                                            {ticket.status.replace('_', ' ').toUpperCase()}
                                        </span>
                                        {ticket.assigned_to === userId && (
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">
                                                YOUR TASK
                                            </span>
                                        )}
                                    </div>
                                    <h4 className="text-sm font-medium text-text-primary truncate">
                                        {ticket.title}
                                    </h4>
                                    <div className="flex items-center gap-3 mt-1 text-[10px] text-text-tertiary">
                                        <span>#{ticket.ticket_number}</span>
                                        {ticket.assignee && (
                                            <>
                                                <span>•</span>
                                                <span>{ticket.assignee.full_name}</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// Loading State
function LoadingState() {
    return (
        <div className="space-y-4">
            <div className="h-48 bg-surface-elevated rounded-xl animate-pulse" />
            <div className="h-24 bg-surface-elevated rounded-xl animate-pulse" />
            <div className="h-24 bg-surface-elevated rounded-xl animate-pulse" />
        </div>
    );
}
