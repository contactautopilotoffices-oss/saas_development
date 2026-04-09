/**
 * TenantRoomBooking - Tenant-facing meeting room booking interface.
 *
 * Allows tenants to browse available meeting rooms by date and capacity, view real-time
 * slot availability, and confirm bookings against their credit balance. Key features:
 * - Date wheel picker (horizontal scroll snap, next 14 days, haptic feedback)
 * - Capacity filter chips (Any Size, 2-4, 6-10, 12+ people)
 * - Per-room slot grid from `/api/meeting-rooms/available`
 * - Booking confirmation modal with optimistic cache invalidation
 * - Credit balance banner with refill request modal (requests sent to admin)
 * - Booking history modal with past/confirmed tabs and cancellation
 *
 * @example
 * <TenantRoomBooking
 *   propertyId="prop-123"
 *   user={{ id: 'user-1', ... }}
 *   hideHeader={false}
 * />
 */
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calendar, Loader2, X, CheckCircle2, ClipboardList, Clock, Trash2, Zap, AlertTriangle } from 'lucide-react';
import RoomCard from './RoomCard';
import { motion, AnimatePresence } from 'framer-motion';
import { useDataCache } from '@/frontend/context/DataCacheContext';

interface TenantRoomBookingProps {
    propertyId: string;
    user: any;
    hideHeader?: boolean;
}

const TenantRoomBooking: React.FC<TenantRoomBookingProps> = ({ propertyId, user, hideHeader = false }) => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [selectedCapacity, setSelectedCapacity] = useState<number>(0);
    const { getCachedData, setCachedData, invalidateCache } = useDataCache();
    
    const roomsCacheKey = `rooms-avail-${propertyId}-${selectedDate.toISOString().split('T')[0]}-${selectedCapacity}`;
    const historyCacheKey = `tenant-bookings-${user?.id}`;
    const creditCacheKey = `tenant-credits-${propertyId}-${user?.id}`;
    
    const [rooms, setRooms] = useState<any[]>(() => getCachedData(roomsCacheKey) || []);
    const [isSearching, setIsSearching] = useState(!getCachedData(roomsCacheKey));
    const [myBookings, setMyBookings] = useState<any[]>(() => getCachedData(historyCacheKey) || []);
    
    const wheelRef = useRef<HTMLDivElement>(null);
    const [pendingBooking, setPendingBooking] = useState<{ room: any; slot: any } | null>(null);
    const [isBooking, setIsBooking] = useState(false);
    const [bookingError, setBookingError] = useState('');
    const [bookingSuccess, setBookingSuccess] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // Credit state
    const [credit, setCredit] = useState<{ remaining_hours: number; monthly_hours: number } | null>(() => getCachedData(creditCacheKey) || null);
    const [showRefillModal, setShowRefillModal] = useState(false);
    const [refillReason, setRefillReason] = useState('');
    const [isRequestingRefill, setIsRequestingRefill] = useState(false);
    const [refillRequestSent, setRefillRequestSent] = useState(false);
    const [refillError, setRefillError] = useState('');

    // My refill request history
    const [myRequests, setMyRequests] = useState<any[]>([]);
    const [isLoadingRequests, setIsLoadingRequests] = useState(false);
    const [historyTab, setHistoryTab] = useState<'bookings' | 'requests'>('bookings');

    const fetchMyBookings = useCallback(async () => {
        if (!user?.id) return;
        setIsLoadingHistory(true);
        try {
            const res = await fetch(`/api/meeting-room-bookings?tenantId=${user.id}&propertyId=${propertyId}`);
            const data = await res.json();
            if (res.ok) {
                const fetched = data.bookings || [];
                setMyBookings(fetched);
                setCachedData(historyCacheKey, fetched);
            }
        } catch (err) {
            console.error('Error fetching my bookings:', err);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [user?.id, propertyId]);

    const handleDeleteBooking = async (bookingId: string) => {
        if (!confirm('Cancel this booking?')) return;
        setDeletingId(bookingId);
        try {
            const res = await fetch(`/api/meeting-room-bookings/${bookingId}`, { method: 'DELETE' });
            if (res.ok) {
                invalidateCache('tenant-bookings-');
                invalidateCache('admin-bookings-');
                invalidateCache('rooms-avail-');
                setMyBookings(prev => prev.filter(b => b.id !== bookingId));
                fetchRooms(); // refresh availability
            }
        } catch (err) {
            console.error('Error deleting booking:', err);
        } finally {
            setDeletingId(null);
        }
    };

    useEffect(() => {
        if (showHistory) fetchMyBookings();
    }, [showHistory, fetchMyBookings]);

    const fetchCredit = useCallback(async () => {
        if (!user?.id) return;
        try {
            const res = await fetch(`/api/meeting-room-credits?propertyId=${propertyId}`);
            const data = await res.json();
            if (res.ok) {
                setCredit(data.credit || null);
                setCachedData(creditCacheKey, data.credit);
            }
        } catch { /* no-op */ }
    }, [propertyId, user?.id]);

    useEffect(() => { fetchCredit(); }, [fetchCredit]);

    const fetchMyRequests = useCallback(async () => {
        if (!user?.id) return;
        setIsLoadingRequests(true);
        try {
            const res = await fetch(`/api/meeting-room-credits/refill-requests?propertyId=${propertyId}`);
            const data = await res.json();
            if (res.ok) setMyRequests(data.requests || []);
        } catch { /* no-op */ }
        finally { setIsLoadingRequests(false); }
    }, [propertyId, user?.id]);

    useEffect(() => {
        if (showHistory && historyTab === 'requests') fetchMyRequests();
    }, [showHistory, historyTab, fetchMyRequests]);

    const handleRefillRequest = async () => {
        setIsRequestingRefill(true);
        setRefillError('');
        try {
            const res = await fetch('/api/meeting-room-credits/refill-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId, reason: refillReason }),
            });
            const data = await res.json();
            if (res.ok) {
                setRefillRequestSent(true);
                setTimeout(() => { setShowRefillModal(false); setRefillRequestSent(false); setRefillReason(''); }, 2000);
            } else {
                setRefillError(data.error || 'Failed to send request');
            }
        } catch {
            setRefillError('An error occurred. Please try again.');
        } finally {
            setIsRequestingRefill(false);
        }
    };

    // Generate next 14 days
    const days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d;
    });

    const fetchRooms = async () => {
        setIsSearching(true);
        try {
            const dateStr = selectedDate.toISOString().split('T')[0];
            // Fetch all rooms for the property with capacity filter
            const res = await fetch(`/api/meeting-rooms/available?propertyId=${propertyId}&date=${dateStr}&capacity=${selectedCapacity}`);
            const data = await res.json();
            if (res.ok) {
                const fetchedRooms = data.rooms || [];
                setRooms(fetchedRooms);
                // 30 second TTL for availability
                setCachedData(roomsCacheKey, fetchedRooms, 30000);
            }
        } catch (error) {
            console.error('Error fetching rooms:', error);
        } finally {
            setIsSearching(false);
        }
    };

    useEffect(() => {
        fetchRooms();
    }, [selectedDate, propertyId, selectedCapacity]);

    // Scroll wheel to initially selected date
    useEffect(() => {
        const el = wheelRef.current;
        if (!el) return;
        const idx = days.findIndex(d => d.toDateString() === selectedDate.toDateString());
        if (idx >= 0) el.scrollTop = idx * 48;
    }, []);

    // Haptic feedback on scroll
    useEffect(() => {
        const el = wheelRef.current;
        if (!el) return;
        let lastIndex = -1;
        const handleScroll = () => {
            const index = Math.round(el.scrollTop / 48);
            if (index !== lastIndex && index >= 0 && index < days.length) {
                lastIndex = index;
                setSelectedDate(days[index]);
                if (navigator.vibrate) navigator.vibrate(10);
            }
        };
        el.addEventListener('scroll', handleScroll, { passive: true });
        return () => el.removeEventListener('scroll', handleScroll);
    }, [days]);

    const handleBook = (room: any, slot: any) => {
        setPendingBooking({ room, slot });
        setBookingError('');
        setBookingSuccess(false);
    };

    const handleConfirmBook = async () => {
        if (!pendingBooking) return;
        const { room, slot } = pendingBooking;
        const dateStr = selectedDate.toISOString().split('T')[0];
        setIsBooking(true);
        setBookingError('');
        try {
            const res = await fetch('/api/meeting-room-bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    meetingRoomId: room.id,
                    propertyId,
                    date: dateStr,
                    startTime: slot.start,
                    endTime: slot.end
                })
            });
            const data = await res.json();
            if (res.ok) {
                setBookingSuccess(true);
                invalidateCache('tenant-bookings-');
                invalidateCache('admin-bookings-');
                invalidateCache('rooms-avail-');
                fetchRooms();
                fetchCredit();
                setTimeout(() => { setPendingBooking(null); setBookingSuccess(false); }, 1800);
            } else {
                setBookingError(data.error || 'Failed to create booking');
            }
        } catch {
            setBookingError('An error occurred. Please try again.');
        } finally {
            setIsBooking(false);
        }
    };

    return (
        <>
            <div className="flex flex-col gap-4 md:gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-12 w-full max-w-full overflow-hidden">
                {/* Local Header */}
                {!hideHeader && (
                    <div className="flex items-start justify-between md:px-0">
                        <div className="flex flex-col gap-1">
                            <h2 className="text-2xl md:text-3xl font-display font-semibold text-foreground tracking-tight">Meeting Rooms</h2>
                            <p className="text-sm md:text-base text-muted-foreground font-medium">Book your workspace</p>
                        </div>
                        <button
                            onClick={() => setShowHistory(true)}
                            className="flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-primary/20 text-primary rounded-xl text-xs font-black uppercase tracking-widest hover:bg-primary/5 transition-all shadow-sm"
                        >
                            <ClipboardList className="w-4 h-4" />
                            <span className="hidden sm:inline">My Bookings</span>
                        </button>
                    </div>
                )}

                {/* Credit Balance Banner */}
                {credit !== null && (
                    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-bold ${
                        credit.remaining_hours <= 0
                            ? 'bg-rose-50 border-rose-100 text-rose-700'
                            : credit.remaining_hours < credit.monthly_hours * 0.25
                            ? 'bg-amber-50 border-amber-100 text-amber-700'
                            : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                    }`}>
                        <div className="flex items-center gap-2">
                            {credit.remaining_hours <= 0
                                ? <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                : <Zap className="w-4 h-4 flex-shrink-0" />
                            }
                            <span>
                                {credit.remaining_hours <= 0
                                    ? 'No meeting credits remaining'
                                    : `${credit.remaining_hours}h of ${credit.monthly_hours}h credits remaining`
                                }
                            </span>
                        </div>
                        {credit.remaining_hours < credit.monthly_hours * 0.5 && (
                            <button
                                onClick={() => { setShowRefillModal(true); setRefillError(''); setRefillRequestSent(false); }}
                                className="ml-3 px-3 py-1 rounded-lg bg-white/70 hover:bg-white border border-current/20 text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap"
                            >
                                Request Refill
                            </button>
                        )}
                    </div>
                )}

                {/* Selection Controls (Standalone Pattern) */}
                <div className="space-y-4 md:space-y-6 max-w-full overflow-hidden">
                    {/* Wheel Date Picker */}
                    <div className="relative h-[120px] md:h-[144px] w-full overflow-hidden border border-slate-100 bg-white rounded-xl md:rounded-[2rem] shadow-sm">
                        {/* Scrollable wheel */}
                        <div
                            ref={wheelRef}
                            className="h-full overflow-y-auto snap-y snap-mandatory no-scrollbar"
                        >
                            <div className="h-[36px] md:h-[48px] shrink-0" />
                            {days.map((d, i) => {
                                const isSelected = d.toDateString() === selectedDate.toDateString();
                                return (
                                    <div
                                        key={i}
                                        onClick={() => {
                                            setSelectedDate(d);
                                            if (wheelRef.current) wheelRef.current.scrollTo({ top: (i + 1) * (window.innerWidth < 768 ? 36 : 48), behavior: 'smooth' });
                                        }}
                                        className={`h-[36px] md:h-[48px] shrink-0 flex items-center justify-center snap-center cursor-pointer transition-all select-none ${isSelected
                                            ? 'text-primary font-black text-xs md:text-base scale-105'
                                            : 'text-slate-400 font-medium text-[10px] md:text-sm'
                                            }`}
                                    >
                                        <span className="mr-2 uppercase text-[7px] md:text-[10px] font-bold tracking-widest opacity-60">
                                            {d.toLocaleDateString('en-US', { weekday: 'short' })}
                                        </span>
                                        <span className="text-sm md:text-lg font-black">{d.getDate()}</span>
                                        <span className="ml-2 uppercase text-[7px] md:text-[10px] font-bold tracking-widest opacity-60">
                                            {d.toLocaleDateString('en-US', { month: 'short' })}
                                        </span>
                                    </div>
                                );
                            })}
                            <div className="h-[36px] md:h-[48px] shrink-0" />
                        </div>

                        {/* Fades & Highlight */}
                        <div className="pointer-events-none absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-white to-transparent z-10" />
                        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent z-10" />
                        <div className="pointer-events-none absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[36px] md:h-[48px] border-y border-primary/5 bg-primary/5" />
                    </div>

                    {/* Filter Chips */}
                    <div className="w-full overflow-x-auto no-scrollbar py-1">
                        <div className="flex gap-2 min-w-max">
                            {[
                                { label: 'Any Size', value: 0 },
                                { label: '2-4 People', value: 2 },
                                { label: '6-10 People', value: 6 },
                                { label: '12+ People', value: 12 }
                            ].map((cap) => (
                                <button
                                    key={cap.value}
                                    onClick={() => setSelectedCapacity(cap.value)}
                                    className={`px-3.5 py-2.5 bg-white border rounded-xl shadow-sm text-[9px] md:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${selectedCapacity === cap.value
                                        ? 'bg-primary text-primary-foreground border-primary shadow-md'
                                        : 'border-slate-100 text-slate-400 hover:bg-slate-50'
                                        }`}
                                >
                                    {cap.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>


                {/* Results */}
                <div className="py-1 md:py-4">
                    {isSearching ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="w-10 h-10 text-primary animate-spin mb-4" />
                            <p className="text-muted-foreground font-bold uppercase tracking-widest text-xs">Finding available rooms...</p>
                        </div>
                    ) : rooms.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                <Calendar className="w-6 h-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground mb-1">No rooms found</h3>
                            <p className="text-muted-foreground text-sm max-w-xs">We couldn't find any rooms matching your current filters and date.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-8 w-full">
                            {rooms.map(room => (
                                <RoomCard
                                    key={room.id}
                                    room={room}
                                    selectedDate={selectedDate.toISOString().split('T')[0]}
                                    onBook={handleBook}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Booking Confirmation Modal */}
            {pendingBooking && (
                <div
                    className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                    onClick={() => !isBooking && setPendingBooking(null)}
                >
                    <div
                        className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        {bookingSuccess ? (
                            /* Success state */
                            <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
                                <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-1">
                                    <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                                </div>
                                <p className="font-bold text-foreground text-base">Booking Confirmed!</p>
                                <p className="text-muted-foreground text-sm">{pendingBooking.room.name} · {pendingBooking.slot.time}</p>
                            </div>
                        ) : (
                            <>
                                {/* Header */}
                                <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-border">
                                    <h3 className="font-bold text-foreground text-base">Confirm Booking</h3>
                                    <button
                                        onClick={() => setPendingBooking(null)}
                                        disabled={isBooking}
                                        className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                                    >
                                        <X className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                </div>

                                {/* Room info */}
                                <div className="px-5 py-4 flex gap-3 items-center border-b border-border">
                                    <div className="w-12 h-12 rounded-xl bg-muted flex-shrink-0 overflow-hidden border border-border">
                                        {pendingBooking.room.photo_url
                                            ? <img src={pendingBooking.room.photo_url} alt={pendingBooking.room.name} className="w-full h-full object-cover" />
                                            : <div className="w-full h-full flex items-center justify-center text-muted-foreground font-bold text-lg">{pendingBooking.room.name[0]}</div>
                                        }
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-bold text-foreground text-sm truncate">{pendingBooking.room.name}</p>
                                        <p className="text-muted-foreground text-xs">{pendingBooking.room.capacity} People · {pendingBooking.room.location}</p>
                                    </div>
                                </div>

                                {/* Date & slot */}
                                <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-border">
                                    <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Date</p>
                                        <p className="font-bold text-foreground text-sm">
                                            {selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Slot</p>
                                        <p className="font-bold text-foreground text-sm">{pendingBooking.slot.time}</p>
                                        <p className="text-[11px] text-muted-foreground">ends {pendingBooking.slot.endLabel || pendingBooking.slot.end}</p>
                                    </div>
                                </div>

                                {/* Error */}
                                {bookingError && (
                                    <div className="mx-5 mt-3 px-3 py-2 bg-rose-50 border border-rose-100 rounded-lg">
                                        <p className="text-rose-600 text-xs font-medium">{bookingError}</p>
                                    </div>
                                )}

                                {/* Actions */}
                                <div className="p-4 flex gap-3">
                                    <button
                                        onClick={() => setPendingBooking(null)}
                                        disabled={isBooking}
                                        className="flex-1 py-3 rounded-xl border border-border text-foreground font-bold text-sm hover:bg-muted transition-all disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleConfirmBook}
                                        disabled={isBooking}
                                        className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
                                    >
                                        {isBooking && <Loader2 className="w-4 h-4 animate-spin" />}
                                        {isBooking ? 'Booking...' : 'Confirm'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            {/* Refill Request Modal */}
            <AnimatePresence>
                {showRefillModal && (
                    <div
                        className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
                        onClick={() => !isRequestingRefill && setShowRefillModal(false)}
                    >
                        <motion.div
                            initial={{ y: 60, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 60, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="w-full max-w-sm bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {refillRequestSent ? (
                                <div className="px-6 py-10 flex flex-col items-center gap-3 text-center">
                                    <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-1">
                                        <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                                    </div>
                                    <p className="font-bold text-foreground text-base">Request Sent!</p>
                                    <p className="text-muted-foreground text-sm">Admin will review your refill request shortly.</p>
                                </div>
                            ) : (
                                <>
                                    <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-border">
                                        <div>
                                            <h3 className="font-bold text-foreground text-base">Request Credit Refill</h3>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {credit?.remaining_hours ?? 0}h remaining of {credit?.monthly_hours ?? 0}h monthly
                                            </p>
                                        </div>
                                        <button onClick={() => setShowRefillModal(false)} disabled={isRequestingRefill} className="p-1.5 rounded-lg hover:bg-muted transition-colors disabled:opacity-50">
                                            <X className="w-4 h-4 text-muted-foreground" />
                                        </button>
                                    </div>
                                    <div className="px-5 py-4 space-y-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Reason (optional)</label>
                                            <textarea
                                                value={refillReason}
                                                onChange={e => setRefillReason(e.target.value)}
                                                placeholder="Describe why you need more hours..."
                                                rows={3}
                                                className="w-full px-3 py-2.5 text-sm bg-muted/50 border border-border rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                                            />
                                        </div>
                                        {refillError && (
                                            <p className="text-rose-600 text-xs font-medium px-1">{refillError}</p>
                                        )}
                                    </div>
                                    <div className="p-4 flex gap-3 border-t border-border">
                                        <button onClick={() => setShowRefillModal(false)} disabled={isRequestingRefill} className="flex-1 py-3 rounded-xl border border-border text-foreground font-bold text-sm hover:bg-muted transition-all disabled:opacity-50">
                                            Cancel
                                        </button>
                                        <button onClick={handleRefillRequest} disabled={isRequestingRefill} className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-all disabled:opacity-70 flex items-center justify-center gap-2">
                                            {isRequestingRefill && <Loader2 className="w-4 h-4 animate-spin" />}
                                            {isRequestingRefill ? 'Sending...' : 'Send Request'}
                                        </button>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Booking History Modal */}
            <AnimatePresence>
                {showHistory && (
                    <div
                        className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
                        onClick={() => setShowHistory(false)}
                    >
                        <motion.div
                            initial={{ y: 100, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            exit={{ y: 100, opacity: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                            className="w-full max-w-2xl bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-2xl overflow-hidden max-h-[90vh] flex flex-col"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="font-bold text-foreground text-base">My Activity</h3>
                                    <button onClick={() => setShowHistory(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                                        <X className="w-4 h-4 text-muted-foreground" />
                                    </button>
                                </div>
                                {/* Sub-tabs */}
                                <div className="flex gap-1 bg-muted p-1 rounded-xl">
                                    <button
                                        onClick={() => setHistoryTab('bookings')}
                                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${historyTab === 'bookings' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Bookings
                                    </button>
                                    <button
                                        onClick={() => setHistoryTab('requests')}
                                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${historyTab === 'requests' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                                    >
                                        Refill Requests
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {historyTab === 'bookings' && isLoadingHistory ? (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                                        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Loading bookings...</p>
                                    </div>
                                ) : historyTab === 'bookings' && myBookings.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mb-3">
                                            <Calendar className="w-6 h-6 text-muted-foreground" />
                                        </div>
                                        <p className="font-bold text-foreground text-sm">No bookings yet</p>
                                        <p className="text-muted-foreground text-xs mt-1">Your reservations will appear here</p>
                                    </div>
                                ) : historyTab === 'bookings' ? (
                                    <>
                                        {myBookings.map((booking) => {
                                            const isPast = new Date(`${booking.booking_date}T${booking.end_time}`) < new Date();
                                            const statusColor = isPast
                                                ? 'bg-slate-100 text-slate-500'
                                                : booking.status === 'confirmed'
                                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                    : 'bg-amber-50 text-amber-600 border border-amber-100';

                                            const formatTime = (t: string) => {
                                                const [h, m] = t.split(':').map(Number);
                                                const ampm = h >= 12 ? 'PM' : 'AM';
                                                const h12 = h % 12 || 12;
                                                return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
                                            };

                                            return (
                                                <div key={booking.id} className={`p-4 rounded-xl border transition-all ${isPast ? 'border-border bg-muted/30 opacity-70' : 'border-border bg-white shadow-sm'}`}>
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <p className="font-bold text-foreground text-sm truncate">{booking.meeting_room?.name || 'Meeting Room'}</p>
                                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${statusColor}`}>
                                                                    {isPast ? 'Past' : booking.status}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                                                <span className="flex items-center gap-1">
                                                                    <Calendar className="w-3 h-3" />
                                                                    {new Date(booking.booking_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                                                </span>
                                                                <span className="flex items-center gap-1">
                                                                    <Clock className="w-3 h-3" />
                                                                    {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
                                                                </span>
                                                            </div>
                                                            {booking.meeting_room?.location && (
                                                                <p className="text-[11px] text-muted-foreground mt-1 truncate">{booking.meeting_room.location}</p>
                                                            )}
                                                        </div>
                                                        {!isPast && (
                                                            <button
                                                                onClick={() => handleDeleteBooking(booking.id)}
                                                                disabled={deletingId === booking.id}
                                                                className="p-2 rounded-lg hover:bg-rose-50 text-muted-foreground hover:text-rose-500 transition-all disabled:opacity-50 flex-shrink-0"
                                                                title="Cancel booking"
                                                            >
                                                                {deletingId === booking.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </>
                                ) : isLoadingRequests ? (
                                    <div className="flex flex-col items-center justify-center py-12">
                                        <Loader2 className="w-8 h-8 text-primary animate-spin mb-3" />
                                        <p className="text-muted-foreground text-xs font-bold uppercase tracking-widest">Loading requests...</p>
                                    </div>
                                ) : myRequests.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 text-center">
                                        <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mb-3">
                                            <Zap className="w-6 h-6 text-muted-foreground" />
                                        </div>
                                        <p className="font-bold text-foreground text-sm">No refill requests yet</p>
                                        <p className="text-muted-foreground text-xs mt-1">Requests you raise will appear here</p>
                                    </div>
                                ) : (
                                    <>
                                        {myRequests.map((req: any) => {
                                            const statusColors: Record<string, string> = {
                                                pending: 'bg-amber-50 border-amber-100 text-amber-600',
                                                approved: 'bg-emerald-50 border-emerald-100 text-emerald-600',
                                                rejected: 'bg-rose-50 border-rose-100 text-rose-500',
                                            };
                                            return (
                                                <div key={req.id} className="p-4 rounded-xl border border-border bg-white shadow-sm space-y-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div>
                                                            <p className="text-xs text-muted-foreground">
                                                                {new Date(req.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                                            </p>
                                                            {req.reason && <p className="text-sm text-foreground mt-1 italic">"{req.reason}"</p>}
                                                        </div>
                                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border flex-shrink-0 ${statusColors[req.status] || ''}`}>
                                                            {req.status}
                                                        </span>
                                                    </div>
                                                    {req.admin_note && (
                                                        <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-1.5">Admin: "{req.admin_note}"</p>
                                                    )}
                                                    {req.reviewed_at && (
                                                        <p className="text-[10px] text-muted-foreground">
                                                            Reviewed {new Date(req.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                        </p>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};
export default TenantRoomBooking;
