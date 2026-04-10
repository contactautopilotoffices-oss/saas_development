/**
 * TicketDetailPanel — Ticket Detail Slide-out Drawer
 *
 * A right-side slide-out drawer that displays the full context and process timeline
 * of a selected ticket. It is shown/hidden via a controlled isOpen prop and renders
 * nothing when no ticket is selected (returns null early).
 *
 * KEY PROPS:
 *   - isOpen:  boolean — controls whether the drawer is visible (AnimatePresence triggers the animation)
 *   - onClose: () => void — called when the user clicks the overlay or the X button
 *   - ticket:  any | null — the selected ticket object; panel is invisible when null
 *
 * KEY STATE:
 *   - No local state beyond the incoming ticket prop; all rendering is derived from ticket data
 *
 * INTEGRATION:
 *   - Used alongside the KanbanBoard and ticket list views as the "view details" destination
 *   - Timeline entries (Created, Assigned, Accepted, Resolved) are derived from ticket timestamps
 *   - Displays assignee info (MST) with avatar, name, and team badge
 *   - The ticket object type is intentionally loose (any) to accommodate varying ticket shapes across the app
 *
 * UI/UX PATTERNS:
 *   - Slide-in from the right using framer-motion spring animation (damping: 25, stiffness: 200)
 *   - Backdrop overlay with blur (backdrop-blur-sm) dims the background
 *   - Sticky header with ticket short-ID (T-XXXX) and close button
 *   - Vertical timeline with colored icons for each lifecycle stage; pending stages show "Pending..."
 *   - Scrollable panel content with overflow-y-auto
 */
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Clock, Calendar, User, Shield, CheckCircle2, AlertCircle } from 'lucide-react';

interface TicketDetailPanelProps {
    isOpen: boolean;
    onClose: () => void;
    ticket: any | null;
}

export default function TicketDetailPanel({
    isOpen,
    onClose,
    ticket,
}: TicketDetailPanelProps) {
    if (!ticket) return null;

    const shortId = ticket.id.slice(-4).toUpperCase();

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return 'Not yet';
        return new Date(dateStr).toLocaleString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const timeline = [
        { label: 'Created', time: ticket.created_at, icon: Calendar, color: 'text-info' },
        { label: 'Assigned', time: ticket.assigned_at, icon: User, color: 'text-warning' },
        { label: 'Accepted', time: ticket.accepted_at, icon: Shield, color: 'text-success' },
        { label: 'Resolved', time: ticket.resolved_at, icon: CheckCircle2, color: 'text-secondary' },
    ];

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

                    {/* Panel */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed top-0 right-0 w-full max-w-md h-full bg-surface border-l border-border z-50 shadow-2xl overflow-y-auto"
                    >
                        {/* Header */}
                        <div className="sticky top-0 bg-background/80 backdrop-blur-md p-6 border-b border-border flex items-center justify-between z-10">
                            <div>
                                <span className="text-xs font-mono font-bold text-text-muted bg-muted px-2 py-1 rounded">
                                    T-{shortId}
                                </span>
                                <h3 className="text-lg font-bold text-text-primary mt-2">Ticket Details</h3>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-surface-elevated rounded-full transition-colors text-text-secondary"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-6 space-y-8">
                            {/* status & priority */}
                            <div className="flex gap-4">
                                <div className="flex-1 p-3 bg-surface-elevated rounded-xl border border-border">
                                    <span className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest block mb-1">Status</span>
                                    <span className="text-sm font-semibold text-text-primary capitalize">{ticket.status.replace('_', ' ')}</span>
                                </div>
                                <div className="flex-1 p-3 bg-surface-elevated rounded-xl border border-border">
                                    <span className="text-[10px] text-text-tertiary uppercase font-bold tracking-widest block mb-1">Priority</span>
                                    <span className="text-sm font-semibold text-text-primary capitalize">{ticket.priority}</span>
                                </div>
                            </div>

                            {/* Title & Description */}
                            <section>
                                <h4 className="text-sm font-bold text-text-primary mb-2">Issue Info</h4>
                                <div className="p-4 bg-surface-elevated rounded-xl border border-border">
                                    <p className="font-semibold text-text-primary mb-2">{ticket.title}</p>
                                    <p className="text-sm text-text-secondary leading-relaxed">
                                        {ticket.description}
                                    </p>
                                </div>
                            </section>

                            {/* Assignment Info */}
                            {ticket.mst && (
                                <section>
                                    <h4 className="text-sm font-bold text-text-primary mb-2">Ownership</h4>
                                    <div className="flex items-center gap-4 p-4 bg-surface-elevated rounded-xl border border-border">
                                        {ticket.mst.user_photo_url || ticket.mst.avatar_url ? (
                                            <img
                                                src={ticket.mst.user_photo_url || ticket.mst.avatar_url}
                                                alt={ticket.mst.full_name}
                                                className="w-12 h-12 rounded-full border border-primary/20"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                                                <User className="w-6 h-6" />
                                            </div>
                                        )}
                                        <div>
                                            <p className="font-bold text-text-primary">{ticket.mst.full_name}</p>
                                            <p className="text-xs text-text-tertiary flex items-center gap-1 uppercase tracking-wider font-bold">
                                                <Shield className="w-3 h-3 text-primary" />
                                                {ticket.mst.team}
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {/* Timeline */}
                            <section>
                                <h4 className="text-sm font-bold text-text-primary mb-3 text-center uppercase tracking-widest opacity-60">Process Timeline</h4>
                                <div className="space-y-6 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
                                    {timeline.map((step, i) => (
                                        <div key={i} className="flex gap-4 relative">
                                            <div className={`w-9 h-9 rounded-full bg-background border-2 border-border flex items-center justify-center z-10 ${step.color}`}>
                                                <step.icon className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 pt-1">
                                                <p className="text-xs font-bold text-text-primary">{step.label}</p>
                                                <p className="text-[10px] text-text-tertiary font-medium">
                                                    {step.time ? formatDate(step.time) : 'Pending...'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
