'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Bell, CheckCircle2, AlertCircle, Clock, Info, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { useRouter } from 'next/navigation';

interface Notification {
    id: string;
    notification_type: string;
    title: string;
    message: string;
    deep_link: string;
    ticket_id?: string;
    is_read: boolean;
    created_at: string;
}

interface NotificationBellProps {
    align?: 'left' | 'right';
}

export default function NotificationBell({ align = 'right' }: NotificationBellProps) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const supabase = useMemo(() => createClient(), []);
    const router = useRouter();

    const fetchNotifications = useCallback(async () => {
        setIsLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(20);

        if (!error && data) {
            setNotifications(data);
            setUnreadCount(data.filter(n => !n.is_read).length);
        }
        setIsLoading(false);
    }, [supabase]);

    useEffect(() => {
        let channel: any;

        const init = async () => {
            await fetchNotifications();

            // Get user again for real-time filter
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Subscribe to real-time updates for THIS user only
            channel = supabase
                .channel(`notif-bell-${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${user.id}`
                    },
                    (payload) => {
                        console.log('New notification received via bell:', payload.new);
                        setNotifications((prev) => [payload.new as Notification, ...prev]);
                        setUnreadCount((count) => count + 1);
                    }
                )
                .subscribe();
        };

        init();

        // Close dropdown when clicking outside
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);

        return () => {
            if (channel) supabase.removeChannel(channel);
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [fetchNotifications, supabase]);

    const markAsRead = async (id: string) => {
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', id);

        if (!error) {
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            setUnreadCount(count => Math.max(0, count - 1));
        }
    };

    const markAllAsRead = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('user_id', user.id)
            .neq('is_read', true);

        if (!error) {
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
        }
    };

    const handleNotificationClick = (notif: Notification) => {
        setIsOpen(false);
        if (!notif.is_read) {
            markAsRead(notif.id).catch(err => console.error('Failed to mark read:', err));
        }

        if (notif.ticket_id) {
            router.push(`/tickets/${notif.ticket_id}`);
        } else if (notif.deep_link) {
            router.push(notif.deep_link);
        }
    };

    // Parse created_at as UTC to avoid timezone offset issues
    const parseUTCDate = (dateStr: string): Date => {
        // Supabase returns UTC timestamps, but without 'Z' suffix
        // JavaScript Date() treats strings without 'Z' as local time
        if (dateStr && !dateStr.endsWith('Z') && !dateStr.includes('+')) {
            return new Date(dateStr + 'Z');
        }
        return new Date(dateStr);
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'TICKET_CREATED': return <AlertCircle className="w-4 h-4 text-primary" />;
            case 'TICKET_ASSIGNED': return <Clock className="w-4 h-4 text-amber-500" />;
            case 'TICKET_COMPLETED': return <CheckCircle2 className="w-4 h-4 text-success" />;
            default: return <Info className="w-4 h-4 text-slate-400" />;
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-slate-600 hover:text-primary transition-all group flex items-center justify-center min-w-[44px] min-h-[44px]"
            >
                <Bell className={`w-5 h-5 ${unreadCount > 0 ? 'animate-wiggle' : ''}`} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-rose-500 border-2 border-white shadow-sm">
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className={`fixed top-20 left-4 right-4 sm:absolute sm:top-full sm:mt-2 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[100] overflow-hidden bg-white/95 backdrop-blur-sm ring-1 ring-black/5 
                        ${align === 'left' ? 'sm:left-0 sm:right-auto origin-top-left' : 'sm:right-0 sm:left-auto origin-top-right'} sm:w-96`}
                    >
                        <div className="p-5 border-b border-gray-100 bg-white/95 backdrop-blur-sm sticky top-0 z-10 flex justify-between items-center">
                            <h3 className="text-[15px] font-semibold text-gray-900 tracking-tight">Notifications</h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="text-[13px] font-medium text-primary hover:text-primary/80 transition-colors"
                                >
                                    Mark all as read
                                </button>
                            )}
                        </div>

                        <div className="max-h-[60vh] sm:max-h-[500px] overflow-y-auto overscroll-contain bg-white">
                            {isLoading ? (
                                <div className="p-8 text-center text-[11px] font-medium text-text-tertiary">Loading notifications...</div>
                            ) : notifications.length === 0 ? (
                                <div className="p-12 text-center flex flex-col items-center gap-3">
                                    <div className="w-12 h-12 bg-surface-elevated rounded-full flex items-center justify-center text-text-tertiary/20">
                                        <Bell className="w-6 h-6" />
                                    </div>
                                    <p className="text-[11px] font-medium text-text-tertiary">No notifications yet</p>
                                </div>
                            ) : (
                                notifications.map((notif) => (
                                    <div
                                        key={notif.id}
                                        onClick={() => handleNotificationClick(notif)}
                                        className={`p-5 border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-all relative group ${notif.is_read ? 'bg-white' : 'bg-blue-50/30'}`}
                                    >
                                        {!notif.is_read && (
                                            <div className="absolute top-6 right-5 w-2 h-2 bg-primary rounded-full shadow-sm ring-2 ring-white" />
                                        )}
                                        <div className="flex gap-4 items-start">
                                            <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center shrink-0 border ${notif.is_read ? 'bg-gray-50 border-gray-100 text-gray-400' : 'bg-primary/10 border-primary/10 text-primary'}`}>
                                                {getIcon(notif.notification_type)}
                                            </div>
                                            <div className="min-w-0 flex-1 pr-4">
                                                <h4 className={`text-[15px] font-semibold leading-snug mb-1 ${notif.is_read ? 'text-gray-700' : 'text-gray-900'}`}>
                                                    {notif.title}
                                                </h4>
                                                <p className="text-[13px] text-gray-500 line-clamp-2 leading-relaxed">
                                                    {notif.message}
                                                </p>
                                                <p className="text-[12px] font-medium text-gray-400 mt-2 flex items-center gap-1.5">
                                                    {formatDistanceToNow(parseUTCDate(notif.created_at), { addSuffix: true })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
