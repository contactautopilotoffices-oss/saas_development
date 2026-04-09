/**
 * AdminBookingList - Admin-level meeting room booking management interface.
 *
 * Displays all meeting room bookings for a property with filtering by search term,
 * booking date, and status (confirmed/cancelled/completed). Bookings are loaded from
 * `/api/meeting-room-bookings` and cached via DataCacheContext. Role-based access
 * determines delete permission: master_admin and property_admin can always delete;
 * staff/mst with technical skill can delete; users can delete their own bookings.
 * Uses optimistic cache invalidation on delete to keep the list fresh.
 *
 * @example
 * <AdminBookingList propertyId="prop-123" />
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useDataCache } from '@/frontend/context/DataCacheContext';
import { Calendar, Clock, User, CheckCircle2, XCircle, Search, Filter, Loader2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';

interface Booking {
    id: string;
    meeting_room_id: string;
    user_id: string;
    booking_date: string;
    start_time: string;
    end_time: string;
    status: 'confirmed' | 'cancelled' | 'completed';
    created_at: string;
    meeting_room: {
        name: string;
        photo_url: string;
        location: string;
    };
    tenant: {
        full_name: string;
        email: string;
    };
}

interface AdminBookingListProps {
    propertyId: string;
}

const AdminBookingList: React.FC<AdminBookingListProps> = ({ propertyId }) => {
    const { getCachedData, setCachedData, invalidateCache } = useDataCache();
    const cacheKey = `admin-bookings-${propertyId}`;
    const [bookings, setBookings] = useState<Booking[]>(() => getCachedData(cacheKey) || []);
    const [isLoading, setIsLoading] = useState(!getCachedData(cacheKey));
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('');
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);
    const [isTechnical, setIsTechnical] = useState(false);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    const supabase = createClient();

    useEffect(() => {
        fetchUserInfo();
        fetchBookings();
    }, [propertyId]);

    const fetchUserInfo = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCurrentUserId(user.id);

        // Check master admin
        const { data: profile } = await supabase.from('users').select('is_master_admin').eq('id', user.id).maybeSingle();
        if (profile?.is_master_admin) {
            setUserRole('master_admin');
            return;
        }

        // Check property role
        const { data: membership } = await supabase
            .from('property_memberships')
            .select('role')
            .eq('user_id', user.id)
            .eq('property_id', propertyId)
            .eq('is_active', true)
            .maybeSingle();

        if (membership) {
            setUserRole(membership.role.toLowerCase());

            // Check technical skill if staff/mst
            if (membership.role.toLowerCase() === 'staff' || membership.role.toLowerCase() === 'mst') {
                const { data: skill } = await supabase
                    .from('mst_skills')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('skill_code', 'technical')
                    .maybeSingle();
                setIsTechnical(!!skill);
            }
        }
    };

    const fetchBookings = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/meeting-room-bookings?propertyId=${propertyId}`);
            const data = await res.json();
            if (res.ok) {
                const fetchedBookings = data.bookings || [];
                setBookings(fetchedBookings);
                setCachedData(cacheKey, fetchedBookings);
            }
        } catch (error) {
            console.error('Error fetching bookings:', error);
        } finally {
            setIsLoading(false);
        }
    }, [propertyId, cacheKey, setCachedData]);

    useEffect(() => {
        fetchBookings();
    }, [fetchBookings]);

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this booking?')) return;

        setDeletingId(id);
        try {
            const res = await fetch(`/api/meeting-room-bookings/${id}`, {
                method: 'DELETE',
            });
            if (res.ok) {
                invalidateCache('admin-bookings-');
                invalidateCache('tenant-bookings-');
                setBookings(prev => prev.filter(b => b.id !== id));
            } else {
                const error = await res.json();
                alert(error.error || 'Failed to delete booking');
            }
        } catch (error) {
            console.error('Error deleting booking:', error);
            alert('An unexpected error occurred');
        } finally {
            setDeletingId(null);
        }
    };

    const canDelete = (bookingUserId: string) => {
        if (userRole === 'master_admin') return true;
        if (currentUserId === bookingUserId) return true;
        if (userRole === 'property_admin') return true;
        if ((userRole === 'staff' || userRole === 'mst') && isTechnical) return true;
        return false;
    };

    const filteredBookings = bookings.filter(booking => {
        const matchesSearch =
            booking.tenant.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            booking.meeting_room.name.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' || booking.status === statusFilter;
        const matchesDate = !dateFilter || booking.booking_date === dateFilter;
        return matchesSearch && matchesStatus && matchesDate;
    });

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'confirmed': return 'bg-emerald-50 text-emerald-700 border-emerald-100';
            case 'cancelled': return 'bg-rose-50 text-rose-700 border-rose-100';
            case 'completed': return 'bg-slate-50 text-slate-700 border-slate-100';
            default: return 'bg-slate-50 text-slate-700 border-slate-100';
        }
    };

    return (
        <div className="space-y-6">
            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 md:gap-4">
                <div className="flex-1 relative group">
                    <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <input
                        type="text"
                        placeholder="Search by client or room..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-12 md:pl-14 pr-4 md:pr-6 py-3.5 md:py-4 bg-white border border-slate-100 rounded-xl md:rounded-2xl text-sm font-bold placeholder:text-slate-300 focus:outline-none focus:ring-4 focus:ring-primary/5 transition-all shadow-sm outline-none"
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                    <input
                        type="date"
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value)}
                        className="px-4 py-3.5 md:py-4 bg-white border border-slate-100 rounded-xl md:rounded-2xl text-[11px] md:text-sm font-black text-slate-700 focus:ring-4 focus:ring-primary/5 transition-all cursor-pointer outline-none shrink-0 shadow-sm uppercase tracking-widest"
                    />
                    <div className="flex items-center gap-2 bg-white px-4 md:px-6 py-3.5 md:py-4 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm overflow-hidden min-w-[140px] md:min-w-[160px]">
                        <Filter className="w-4 h-4 text-slate-400 flex-shrink-0" />
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="bg-transparent text-[11px] md:text-sm font-black text-slate-700 focus:outline-none cursor-pointer uppercase tracking-widest w-full appearance-none outline-none"
                        >
                            <option value="all">All Status</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex flex-col gap-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-24 bg-slate-50 rounded-2xl animate-pulse" />
                    ))}
                </div>
            ) : filteredBookings.length === 0 ? (
                <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem] p-12 text-center">
                    <Calendar className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">No bookings found</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    <AnimatePresence mode="popLayout">
                        {filteredBookings.map((booking) => (
                            <motion.div
                                key={booking.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white p-4 md:p-6 rounded-xl md:rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-6 hover:shadow-md transition-shadow group/card"
                            >
                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-lg md:rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-50">
                                        <img src={booking.meeting_room.photo_url} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <div className="min-w-0">
                                        <h4 className="text-sm font-bold text-slate-900 truncate">{booking.meeting_room.name}</h4>
                                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                                            <div className="flex items-center gap-1.5 text-slate-400">
                                                <Calendar className="w-3 h-3" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider">{booking.booking_date}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-400">
                                                <Clock className="w-3 h-3" />
                                                <span className="text-[10px] font-bold uppercase tracking-wider">{booking.start_time} - {booking.end_time}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center justify-between md:justify-end gap-6">
                                    <div className="flex flex-col md:items-end gap-1.5">
                                        <div className="flex items-center gap-2">
                                            <User className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="text-xs font-bold text-slate-700">{booking.tenant.full_name}</span>
                                        </div>
                                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getStatusColor(booking.status)}`}>
                                            {booking.status}
                                        </span>
                                    </div>

                                    {canDelete(booking.user_id) && (
                                        <button
                                            onClick={() => handleDelete(booking.id)}
                                            disabled={deletingId === booking.id}
                                            className="p-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-100 transition-colors md:opacity-0 group-hover/card:opacity-100"
                                            title="Delete Booking"
                                        >
                                            {deletingId === booking.id ? (
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-5 h-5" />
                                            )}
                                        </button>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

export default AdminBookingList;
