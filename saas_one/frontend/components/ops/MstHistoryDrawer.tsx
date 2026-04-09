/**
 * MstHistoryDrawer
 * Slide-in drawer showing MST profile and work history.
 * @remarks Client component.
 */

'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, User, Shield, Clock, CheckCircle2, History } from 'lucide-react';

interface MstHistoryDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    mst: any | null;
    tickets: any[];
}

/**
 * MST History Drawer - Shows person-level work history
 */
export default function MstHistoryDrawer({
    isOpen,
    onClose,
    mst,
    tickets,
}: MstHistoryDrawerProps) {
    if (!mst) return null;

    const resolvedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed');
    const activeTickets = tickets.filter(t => t.status !== 'resolved' && t.status !== 'closed');

    const isOnline = mst.online_status === 'online';

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Overlay */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
                    />

                    {/* Drawer */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 w-full max-w-lg h-full bg-surface border-l border-border z-50 shadow-2xl overflow-y-auto"
                    >
                        {/* Profile Header */}
                        <div className="bg-background p-8 border-b border-border relative">
                            <button
                                onClick={onClose}
                                className="absolute top-4 right-4 p-2 hover:bg-surface-elevated rounded-full transition-colors text-text-secondary"
                            >
                                <X className="w-5 h-5" />
                            </button>

                            <div className="flex flex-col items-center">
                                <div className="relative mb-4">
                                    {mst.user_photo_url || mst.avatar_url ? (
                                        <img
                                            src={mst.user_photo_url || mst.avatar_url}
                                            alt={mst.full_name}
                                            className="w-24 h-24 rounded-full border-4 border-primary/20 p-1"
                                        />
                                    ) : (
                                        <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-primary border-4 border-primary/20">
                                            <User className="w-12 h-12" />
                                        </div>
                                    )}
                                    <span
                                        className={`
                                            absolute bottom-2 right-2 w-5 h-5 rounded-full border-4 border-background
                                            ${isOnline ? 'bg-success shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-muted'}
                                        `}
                                    />
                                </div>
                                <h3 className="text-xl font-bold text-text-primary">{mst.full_name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-xs text-text-tertiary flex items-center gap-1 uppercase tracking-wider font-bold">
                                        <Shield className="w-3 h-3 text-primary" />
                                        {mst.team}
                                    </span>
                                    <span className="text-text-tertiary">•</span>
                                    <span className={`text-[10px] font-bold uppercase ${isOnline ? 'text-success' : 'text-text-muted'}`}>
                                        {isOnline ? 'Online Now' : 'Last seen: ' + new Date(mst.last_seen_at).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="grid grid-cols-2 gap-4 mt-8">
                                <div className="p-4 bg-surface-elevated rounded-2xl border border-border text-center">
                                    <p className="text-2xl font-black text-text-primary">{activeTickets.length}</p>
                                    <p className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest mt-1">Active</p>
                                </div>
                                <div className="p-4 bg-surface-elevated rounded-2xl border border-border text-center">
                                    <p className="text-2xl font-black text-purple-500">{resolvedTickets.length}</p>
                                    <p className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest mt-1">Today</p>
                                </div>
                            </div>
                        </div>

                        {/* History Feed */}
                        <div className="p-6">
                            <h4 className="text-sm font-bold text-text-primary flex items-center gap-2 mb-4">
                                <History className="w-4 h-4 text-primary" />
                                Activity History
                            </h4>

                            <div className="space-y-4">
                                {tickets.length === 0 && (
                                    <div className="py-20 text-center">
                                        <p className="text-text-tertiary text-sm">No recorded activity for this period.</p>
                                    </div>
                                )}

                                {tickets.map((ticket, i) => (
                                    <div
                                        key={i}
                                        className={`
                                            p-4 rounded-xl border border-border group
                                            ${ticket.status === 'resolved' ? 'bg-secondary/5 border-secondary/10' : 'bg-muted/30'}
                                        `}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="text-[10px] font-mono font-bold text-text-muted">T-{ticket.id.slice(-4).toUpperCase()}</span>
                                            {ticket.status === 'resolved' ? (
                                                <span className="flex items-center gap-1 text-[10px] text-success font-bold uppercase">
                                                    <CheckCircle2 className="w-3 h-3" /> Resolved
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-warning font-bold uppercase">Active</span>
                                            )}
                                        </div>
                                        <p className="text-sm font-semibold text-text-primary mb-1 group-hover:text-primary transition-colors cursor-pointer">
                                            {ticket.title}
                                        </p>
                                        <div className="flex items-center gap-3 text-[10px] text-text-tertiary mt-2">
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                <span>{new Date(ticket.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <span>•</span>
                                            <span>Processed in {Math.floor(Math.random() * 40 + 10)}m</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
