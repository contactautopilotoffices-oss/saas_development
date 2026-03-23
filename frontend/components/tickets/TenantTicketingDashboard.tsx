'use client';

import { useState, useEffect, useRef } from 'react';
import { Plus, Send, Star, User, ChevronRight, X, MessageSquare, Loader2, CheckCircle, Camera, Filter, Video, Play, Pause, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from '@/frontend/context/ThemeContext';
import { playTickleSound } from '@/frontend/utils/sounds';
import MediaCaptureModal, { MediaFile } from '@/frontend/components/shared/MediaCaptureModal';
import { createClient } from '@/frontend/utils/supabase/client';

interface Ticket {
    id: string;
    ticket_number: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    created_at: string;
    assigned_at: string | null;
    sla_deadline: string | null;
    sla_paused: boolean;
    total_paused_minutes: number;
    category?: { name: string; code: string };
    assignee?: { full_name: string };
    rating?: number;
    photo_before_url?: string;
    photo_after_url?: string;
}

interface Classification {
    category: string | null;
    confidence: number;
    isVague: boolean;
}

interface TenantTicketingDashboardProps {
    propertyId: string;
    organizationId: string;
    user: { id: string; full_name: string };
    propertyName?: string;
    isStaff?: boolean;
    showInternalToggle?: boolean;
    onSuccess?: () => void;
}

export default function TenantTicketingDashboard({
    propertyId,
    organizationId,
    user,
    propertyName,
    isStaff = false,
    showInternalToggle = false,
    onSuccess
}: TenantTicketingDashboardProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { theme } = useTheme();
    const supabase = createClient();
    const [description, setDescription] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [classification, setClassification] = useState<Classification | null>(null);
    const [activeTickets, setActiveTickets] = useState<Ticket[]>([]);
    const [resolvedTickets, setResolvedTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [showSuccess, setShowSuccess] = useState(false);
    const [mediaFile, setMediaFile] = useState<MediaFile | null>(null);
    const [showCameraModal, setShowCameraModal] = useState(false);
    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isInternal, setIsInternal] = useState(false);
    const [isCritical, setIsCritical] = useState(false);
    const [ratingTicket, setRatingTicket] = useState<Ticket | null>(null);
    const [selectedRating, setSelectedRating] = useState(0);
    const [filter, setFilter] = useState<'all' | 'in_progress' | 'completed'>(
        (searchParams.get('filter') as any) || 'all'
    );

    useEffect(() => {
        fetchTickets();

        // Real-time subscription: refresh ticket list when any ticket in this property changes
        const channel = supabase
            .channel(`tenant_tickets_${propertyId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tickets',
                filter: `property_id=eq.${propertyId}`,
            }, () => fetchTickets())
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [propertyId, user.id]);

    const fetchTickets = async () => {
        try {
            // Staff/MST see their assigned tickets. Tenants see all non-internal tickets for the property.
            const queryParam = isStaff ? `assignedTo=${user.id}` : `isInternal=false`;
            const response = await fetch(`/api/tickets?propertyId=${propertyId}&${queryParam}`);
            const data = await response.json();

            if (response.ok) {
                const tickets = data.tickets || [];
                setActiveTickets(tickets.filter((t: Ticket) => !['resolved', 'closed'].includes(t.status)));
                setResolvedTickets(tickets.filter((t: Ticket) => ['resolved', 'closed'].includes(t.status)));
            }
        } catch (error) {
            console.error('Error fetching tickets:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleMediaCapture = (media: MediaFile) => {
        setMediaFile(media);
        setIsVideoPlaying(false);
        setShowCameraModal(false);
    };

    const handleSubmit = async () => {
        if (!description.trim()) return;

        setIsSubmitting(true);
        try {
            // Create ticket (classification happens server-side)
            const response = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description,
                    propertyId,
                    organizationId,
                    isInternal,
                    priority: isCritical ? 'critical' : 'low',
                }),
            });

            const data = await response.json();

            if (response.ok) {
                // Play tickle sound on success
                playTickleSound();

                // Show server classification result (not fake)
                setClassification(data.classification);
                setShowSuccess(true);

                // Upload media (photo or video) if present
                if (mediaFile && data.ticket?.id) {
                    const formData = new FormData();
                    formData.append('file', mediaFile.file);
                    formData.append('type', 'before');
                    formData.append('takenAt', mediaFile.takenAt || new Date().toISOString());
                    const endpoint = mediaFile.type === 'video'
                        ? `/api/tickets/${data.ticket.id}/videos`
                        : `/api/tickets/${data.ticket.id}/photos`;
                    await fetch(endpoint, { method: 'POST', body: formData });
                }

                setDescription('');
                setIsCritical(false);
                if (mediaFile?.preview.startsWith('blob:')) URL.revokeObjectURL(mediaFile.preview);
                setMediaFile(null);
                setIsVideoPlaying(false);
                fetchTickets();
                if (onSuccess) onSuccess();
                setTimeout(() => {
                    setShowSuccess(false);
                    setClassification(null);
                }, 3000);
            }
        } catch (error) {
            console.error('Error submitting ticket:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRatingSubmit = async () => {
        if (!ratingTicket || selectedRating < 1) return;

        try {
            await fetch(`/api/tickets/${ratingTicket.id}/rating`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ rating: selectedRating }),
            });

            fetchTickets();
            setRatingTicket(null);
            setSelectedRating(0);
        } catch (error) {
            console.error('Error submitting rating:', error);
        }
    };

    // Real SLA progress calculation
    const getSLAProgress = (ticket: Ticket) => {
        if (!ticket.assigned_at || !ticket.sla_deadline) return null;
        if (ticket.sla_paused) return { progress: 0, text: 'Paused', color: 'text-yellow-400' };

        const start = new Date(ticket.assigned_at).getTime();
        const end = new Date(ticket.sla_deadline).getTime();
        const now = Date.now();
        const pausedMs = (ticket.total_paused_minutes || 0) * 60000;

        const totalDuration = end - start;
        const elapsed = now - start - pausedMs;
        const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));

        const remaining = end - now;
        const hoursLeft = Math.floor(remaining / (1000 * 60 * 60));

        if (remaining < 0) return { progress: 100, text: 'Breached', color: 'text-red-500' };
        if (hoursLeft < 2) return { progress, text: `${hoursLeft}h left`, color: 'text-red-400' };
        if (hoursLeft < 8) return { progress, text: `${hoursLeft}h left`, color: 'text-orange-400' };
        return { progress, text: `~${hoursLeft}h`, color: 'text-gray-400' };
    };

    const STATUS_COLORS: Record<string, string> = {
        open: 'text-orange-400',
        assigned: 'text-amber-500',
        in_progress: 'text-[#f28c33]',
        waitlist: 'text-slate-400',
    };

    const isDark = theme === 'dark';

    return (
        <div className="min-h-screen bg-transparent text-text-primary p-0 md:p-8 font-body transition-colors duration-300">
            {/* Header */}
            <div className="max-w-6xl mx-auto">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 md:mb-12 gap-4">
                    <div>
                        <h1 className={`text-3xl md:text-4xl font-display font-semibold ${isDark ? 'text-white' : 'text-text-primary'} tracking-tight`}>
                            <span className="text-primary">{propertyName || 'Property'}</span>{' '}
                            {isStaff ? 'Maintenance Portal' : 'Request Manager'}
                        </h1>
                        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-text-secondary'} mt-1 font-medium`}>Efficiently handle your facility needs</p>
                    </div>
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <div className="flex items-center gap-3 bg-surface border-border px-4 py-3 md:px-6 rounded-2xl border w-full md:w-auto">
                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center border border-primary/20 shrink-0">
                                <User className={`w-5 h-5 ${isDark ? 'text-emerald-500' : 'text-primary'}`} />
                            </div>
                            <div className="overflow-hidden">
                                <p className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-text-primary'} truncate`}>{user.full_name}</p>
                                <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-text-tertiary'} font-bold uppercase tracking-widest`}>{isStaff ? 'MST Account' : ''}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8">
                    {/* Left Panel - Raise New Request */}
                    <div className="space-y-6">
                        <div className="bg-surface border-border shadow-2xl p-4 md:p-10 rounded-3xl border transition-all">
                            <h2 className="text-xs font-bold text-secondary mb-6 md:mb-8 flex items-center gap-3 uppercase tracking-[0.2em]">
                                <Plus className="w-4 h-4" />
                                Raise a New Request
                            </h2>

                            <div className="relative group">
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Describe the issue in your own words...&#10;Example: Leaking tap in kitchenette, 2nd floor"
                                    className="w-full h-32 md:h-40 bg-surface-elevated text-text-primary border-border border rounded-2xl p-4 md:p-6 placeholder-text-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-primary/10 transition-all font-medium"
                                />
                                {!isDark && <div className="absolute inset-0 rounded-2xl border border-primary/5 pointer-events-none group-focus-within:border-primary/20 transition-smooth"></div>}
                            </div>

                            {/* Media Preview (photo or video) */}
                            {mediaFile && (
                                <div className={`relative mt-4 rounded-2xl overflow-hidden border ${isDark ? 'border-[#30363d]' : 'border-border/10'} bg-black`}>
                                    {mediaFile.type === 'image' ? (
                                        <img src={mediaFile.preview} alt="Preview" className="w-full h-36 object-cover" />
                                    ) : (
                                        <div className="relative w-full h-36">
                                            <video
                                                ref={videoRef}
                                                src={mediaFile.preview}
                                                className="w-full h-full object-cover"
                                                onPlay={() => setIsVideoPlaying(true)}
                                                onPause={() => setIsVideoPlaying(false)}
                                                onEnded={() => setIsVideoPlaying(false)}
                                            />
                                            <div
                                                className={`absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer transition-opacity ${isVideoPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}
                                                onClick={() => {
                                                    if (!videoRef.current) return;
                                                    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
                                                }}
                                            >
                                                <div className={`rounded-full p-3 backdrop-blur-sm hover:bg-white/30 transition-colors ${isDark ? 'bg-white/10' : 'bg-white/20'}`}>
                                                    {isVideoPlaying
                                                        ? <Pause className="w-6 h-6 text-white fill-white" />
                                                        : <Play className="w-6 h-6 text-white fill-white" />
                                                    }
                                                </div>
                                                {!isVideoPlaying && (
                                                    <span className="absolute bottom-2 left-3 text-white text-[10px] font-bold bg-black/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                                                        <Video className="w-3 h-3" /> Video attached
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => { if (mediaFile.preview.startsWith('blob:')) URL.revokeObjectURL(mediaFile.preview); setMediaFile(null); setIsVideoPlaying(false); }}
                                        className="absolute top-3 right-3 bg-rose-500 text-white rounded-full p-2 shadow-xl hover:scale-110 transition-all"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            )}

                            {/* Internal toggle — only for staff/admin roles */}
                            {showInternalToggle && (
                                <div className={`flex items-center justify-between mt-4 px-4 py-3 rounded-xl border ${isDark ? 'bg-[#0d1117] border-[#21262d]' : 'bg-slate-50 border-slate-200'}`}>
                                    <div>
                                        <p className={`text-sm font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Internal ticket</p>
                                        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Not visible to tenants</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsInternal(v => !v)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isInternal ? 'bg-amber-500' : 'bg-slate-300'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isInternal ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            )}

                            <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between mt-6 md:mt-10 gap-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        onClick={() => setShowCameraModal(true)}
                                        className={`flex items-center justify-center gap-2 ${isDark ? 'text-slate-400 hover:text-white hover:bg-[#21262d]' : 'text-text-secondary hover:text-primary hover:bg-primary/5'} cursor-pointer transition-all text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border border-border/10 bg-surface-elevated`}
                                    >
                                        <Camera className="w-4 h-4" />
                                        <span>Camera</span>
                                    </button>

                                    {/* Critical Priority Toggle - only for tenants */}
                                    {!isStaff && (
                                    <button
                                        onClick={() => setIsCritical(!isCritical)}
                                        className={`flex items-center justify-center gap-2 transition-all text-[10px] font-black uppercase tracking-widest px-4 py-2.5 rounded-xl border ${isCritical
                                            ? 'bg-rose-500 text-white border-rose-600 animate-pulse shadow-lg shadow-rose-500/20'
                                            : isDark ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-400/5 border-border/10 bg-surface-elevated' : 'text-text-secondary hover:text-rose-600 hover:bg-rose-50 shadow-sm border-slate-200 bg-white'
                                            }`}
                                    >
                                        <Activity className={`w-4 h-4 ${isCritical ? 'text-white' : 'text-rose-500'}`} />
                                        <span>{isCritical ? 'Critical Request' : 'Mark Critical'}</span>
                                    </button>
                                    )}
                                </div>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isSubmitting || !description.trim()}
                                    className={`px-6 py-3.5 ${isDark ? 'bg-emerald-600 shadow-emerald-900/20' : 'bg-primary shadow-primary/20'} hover:opacity-90 disabled:bg-text-primary/10 disabled:text-text-tertiary disabled:cursor-not-allowed text-white font-black rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg uppercase tracking-widest text-[10px] whitespace-nowrap`}
                                >
                                    {isSubmitting ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Send className="w-3.5 h-3.5" />
                                    )}
                                    Submit Request
                                </button>
                            </div>
                        </div>

                        {/* Server Classification Result */}
                        <AnimatePresence>
                            {showSuccess && classification && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className={`${isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'premium-list border-success/30 bg-success/5'} p-8 border rounded-3xl`}
                                >
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className={`${isDark ? 'text-emerald-400' : 'text-success'} font-bold uppercase tracking-widest text-[11px]`}>✓ Request Submitted Successfully</h3>
                                        <span className={`text-[10px] ${isDark ? 'bg-emerald-600' : 'bg-success'} text-white px-3 py-1 rounded-full font-bold tracking-tighter`}>SUCCESS</span>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className={`${isDark ? 'text-slate-400' : 'text-text-secondary'} font-medium text-sm`}>AI Classification:</span>
                                            <span className={`${isDark ? 'text-white' : 'text-text-primary'} font-display font-semibold capitalize`}>{(classification as any).categoryCode?.replace(/_/g, ' ') || 'General Request'}</span>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className={`${isDark ? 'text-slate-400' : 'text-text-secondary'} font-medium text-sm`}>System Priority:</span>
                                            <span className={`${isDark ? 'text-emerald-400' : 'text-primary'} font-bold uppercase tracking-widest text-[10px]`}>Processing</span>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Right Panel - My Tickets */}
                    <div className="space-y-8">
                        <div className={`${isDark ? 'bg-[#161b22] border-[#21262d]' : 'glass-panel'} p-4 md:p-10 rounded-3xl border transition-all`}>
                            <div className="flex items-center justify-between mb-6 md:mb-10 border-b pb-4 md:pb-6">
                                <h2 className={`text-xs font-bold ${isDark ? 'text-slate-500 border-[#21262d]' : 'text-text-tertiary border-border/5'} uppercase tracking-[0.2em]`}>
                                    {isStaff ? 'Assigned Operations' : 'Recent Activity'}
                                </h2>

                                <div className={`flex items-center gap-2 ${isDark ? 'bg-[#0d1117] border-[#21262d]' : 'bg-white border-slate-100'} border px-3 py-1.5 rounded-xl shadow-sm`}>
                                    <Filter className={`w-3.5 h-3.5 ${isDark ? 'text-slate-500' : 'text-text-tertiary'}`} />
                                    <select
                                        value={filter}
                                        onChange={(e) => {
                                            const newFilter = e.target.value as any;
                                            setFilter(newFilter);
                                            const url = new URL(window.location.href);
                                            url.searchParams.set('filter', newFilter);
                                            window.history.pushState({}, '', url.toString());
                                        }}
                                        className={`bg-transparent text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-emerald-400' : 'text-primary'} focus:outline-none cursor-pointer`}
                                    >
                                        <option value="all">All</option>
                                        <option value="in_progress">In Progress</option>
                                        <option value="completed">Completed</option>
                                    </select>
                                </div>
                            </div>

                            {loading ? (
                                <div className="space-y-6">
                                    {[1, 2, 3].map(i => (
                                        <div key={i} className={`${isDark ? 'bg-[#0d1117] border-[#21262d]' : 'bg-text-primary/5 border-border/5'} rounded-3xl p-4 md:p-8 border animate-pulse`}>
                                            <div className="h-5 bg-text-primary/10 rounded-lg w-3/4 mb-4" />
                                            <div className="h-2.5 bg-text-primary/5 rounded-full w-1/2" />
                                        </div>
                                    ))}
                                </div>
                            ) : (() => {
                                const filteredTickets = filter === 'all'
                                    ? [...activeTickets, ...resolvedTickets]
                                    : filter === 'in_progress'
                                        ? activeTickets
                                        : resolvedTickets;

                                if (filteredTickets.length === 0) {
                                    return (
                                        <div className="text-center py-20 px-8">
                                            <div className={`w-20 h-20 ${isDark ? 'bg-[#0d1117]' : 'bg-text-primary/5'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                                                <MessageSquare className={`w-8 h-8 ${isDark ? 'text-slate-800' : 'text-text-tertiary/30'}`} />
                                            </div>
                                            <p className={`${isDark ? 'text-slate-600' : 'text-text-tertiary'} font-medium`}>
                                                {filter === 'completed' ? 'No completed requests found' : 'No active requests currently in progress'}
                                            </p>
                                        </div>
                                    );
                                }

                                return (
                                    <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                        {filteredTickets
                                            .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                                            .map((ticket) => {
                                                const isFinal = ['resolved', 'closed'].includes(ticket.status);
                                                const sla = getSLAProgress(ticket);
                                                return (
                                                    <div
                                                        key={ticket.id}
                                                        onClick={() => router.push(`/tickets/${ticket.id}`)}
                                                        className={`group/ticket ${isDark ? 'bg-[#0d1117] border-[#21262d] hover:border-emerald-500/30' : 'premium-list border-border/5 hover:border-primary/20'} p-4 md:p-8 cursor-pointer transition-all rounded-2xl border hover:shadow-2xl ${isFinal ? 'opacity-80' : ''}`}
                                                    >
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex items-start gap-3 md:gap-6">
                                                                <div className={`w-10 h-10 md:w-14 md:h-14 ${isDark ? 'bg-[#161b22] border-[#21262d]' : 'kpi-icon'} flex items-center justify-center flex-shrink-0 rounded-xl border`}>
                                                                    {isFinal ? (
                                                                        <CheckCircle className={`w-5 h-5 md:w-7 md:h-7 ${isDark ? 'text-emerald-500' : 'text-success'}`} />
                                                                    ) : (
                                                                        <MessageSquare className={`w-5 h-5 md:w-7 md:h-7 ${isDark ? 'text-emerald-500' : 'text-primary'}`} />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <p className={`font-display font-semibold ${isDark ? 'text-white group-hover/ticket:text-emerald-400' : 'text-text-primary group-hover/ticket:text-primary'} text-base md:text-xl transition-all`}>{ticket.title}</p>
                                                                        {isFinal && <span className="text-[9px] bg-success/10 text-success px-2 py-0.5 rounded font-black uppercase tracking-tighter">Resolved</span>}
                                                                    </div>
                                                                    <div className="flex items-center gap-3">
                                                                        <span className={`text-[10px] font-bold ${isDark ? 'text-slate-500 bg-[#161b22]' : 'text-text-tertiary bg-text-primary/5'} uppercase tracking-widest px-2.5 py-1 rounded-md`}>
                                                                            {((ticket as any).category && typeof (ticket as any).category === 'string')
                                                                                ? (ticket as any).category.replace(/_/g, ' ')
                                                                                : (ticket.category?.name || 'General')}
                                                                        </span>
                                                                        {!isFinal && sla && <span className={`text-[10px] font-bold uppercase tracking-widest ${sla.color}`}>{sla.text}</span>}
                                                                        {isFinal && ticket.rating && (
                                                                            <div className="flex gap-0.5">
                                                                                {[1, 2, 3, 4, 5].map(s => (
                                                                                    <Star key={s} className={`w-2.5 h-2.5 ${s <= ticket.rating! ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}`} />
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="pt-2">
                                                                <ChevronRight className={`w-6 h-6 ${isDark ? 'text-slate-800' : 'text-text-tertiary'} group-hover/ticket:text-primary group-hover/ticket:translate-x-1 transition-all`} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                );
                            })()}
                        </div>


                    </div>
                </div>
            </div>

            {/* Rating Modal */}
            <AnimatePresence>
                {ratingTicket && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50"
                        onClick={() => setRatingTicket(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className={`${isDark ? 'bg-[#161b22] border-[#21262d]' : 'bg-white border-slate-100'} border rounded-[2.5rem] p-8 max-w-sm w-full mx-4 shadow-2xl`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className={`text-xl font-black ${isDark ? 'text-white' : 'text-slate-900'} mb-2 uppercase tracking-tight`}>Rate Request</h3>
                            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'} mb-8`}>{ratingTicket.title}</p>
                            <div className="flex justify-center gap-3 mb-8">
                                {[1, 2, 3, 4, 5].map((star) => (
                                    <Star
                                        key={star}
                                        className={`w-8 h-8 cursor-pointer transition-all hover:scale-120 ${star <= selectedRating ? (isDark ? 'text-emerald-500 fill-emerald-500' : 'text-yellow-400 fill-yellow-400') : (isDark ? 'text-[#21262d]' : 'text-slate-100')
                                            }`}
                                        onClick={() => setSelectedRating(star)}
                                    />
                                ))}
                            </div>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setRatingTicket(null)}
                                    className={`flex-1 py-3 ${isDark ? 'text-slate-500 hover:text-white' : 'text-slate-400 hover:text-slate-900'} font-bold uppercase tracking-widest text-xs transition-colors`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleRatingSubmit}
                                    disabled={selectedRating < 1}
                                    className={`flex-1 py-4 ${isDark ? 'bg-emerald-600 shadow-emerald-900/40 hover:bg-emerald-500' : 'bg-slate-900 hover:bg-black'} text-white font-black uppercase tracking-widest text-xs rounded-2xl transition-all shadow-lg disabled:opacity-30`}
                                >
                                    Submit
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
            <MediaCaptureModal
                isOpen={showCameraModal}
                onClose={() => setShowCameraModal(false)}
                onCapture={handleMediaCapture}
                title="Add Photo or Video"
            />
        </div >
    );
}
