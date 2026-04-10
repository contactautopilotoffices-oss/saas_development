/**
 * NotificationSystem
 * Global in-app toast notification overlay with queue management.
 * @remarks Client component.
 */

'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Info, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { createClient } from '@/frontend/utils/supabase/client';

import { useRouter } from 'next/navigation';

interface Notification {
    id: string;
    user_id: string;
    notification_type: string;
    title: string;
    message: string;
    deep_link: string;
    created_at: string;
}

import { usePushNotifications } from '@/frontend/hooks/usePushNotifications';

/**
 * NotificationSystem - Global component for handling real-time alerts
 */
export default function NotificationSystem() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const supabase = createClient();
    const router = useRouter();

    // Register push notifications globally
    usePushNotifications();

    // Trigger Haptics
    const triggerHaptic = (type: string) => {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
            // Light haptic for basic, heavier for SLA
            if (type === 'SLA_BREACH' || type === 'SLA_WARNING') {
                window.navigator.vibrate([100, 50, 100]);
            } else {
                window.navigator.vibrate(50);
            }
        }
    };

    useEffect(() => {
        const setupSubscription = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Subscribe to real-time notifications for THIS user only
            const channel = supabase
                .channel(`notif-${user.id}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${user.id}`
                    },
                    (payload) => {
                        const newNotif = payload.new as Notification;
                        setNotifications((prev) => [newNotif, ...prev]);
                        triggerHaptic(newNotif.notification_type);

                        // Auto-dismiss after 6 seconds
                        setTimeout(() => {
                            setNotifications((prev) => prev.filter((n) => n.id !== newNotif.id));
                        }, 6000);
                    }
                )
                .subscribe();

            return channel;
        };

        let activeChannel: any;
        setupSubscription().then(channel => activeChannel = channel);

        return () => {
            if (activeChannel) supabase.removeChannel(activeChannel);
        };
    }, []);

    const handleNotificationClick = (notif: Notification) => {
        console.log('Notification clicked:', notif);
        removeNotification(notif.id);
        if (notif.deep_link) {
            console.log('Redirecting to:', notif.deep_link);
            router.push(notif.deep_link);
        } else {
            console.warn('Notification has no deep_link');
        }
    };

    const removeNotification = (id: string) => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
    };

    const getTypeStyles = (type: string) => {
        switch (type) {
            case 'SLA_BREACH':
            case 'SLA_WARNING':
                return {
                    icon: <AlertTriangle className="w-5 h-5 text-error" />,
                    bg: 'bg-error/5',
                    border: 'border-error/20'
                };
            case 'TICKET_ASSIGNED':
            case 'TICKET_COMPLETED':
                return {
                    icon: <CheckCircle className="w-5 h-5 text-success" />,
                    bg: 'bg-success/5',
                    border: 'border-success/20'
                };
            default:
                return {
                    icon: <Bell className="w-5 h-5 text-primary" />,
                    bg: 'bg-primary/5',
                    border: 'border-primary/20'
                };
        }
    };

    return (
        <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 w-80 pointer-events-none">
            <AnimatePresence>
                {notifications.map((notif) => {
                    const styles = getTypeStyles(notif.notification_type);
                    return (
                        <motion.div
                            key={notif.id}
                            initial={{ opacity: 0, x: 50, scale: 0.9 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                            onClick={() => handleNotificationClick(notif)}
                            className={`pointer-events-auto flex items-start gap-4 p-4 rounded-xl border bg-white shadow-2xl ${styles.border} ${styles.bg} overflow-hidden relative group cursor-pointer hover:scale-[1.02] active:scale-[0.98] transition-all`}
                        >
                            <div className="mt-0.5">{styles.icon}</div>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-black uppercase tracking-widest text-text-primary mb-1">
                                    {notif.title}
                                </h4>
                                <p className="text-[11px] font-medium text-text-secondary leading-normal">
                                    {notif.message}
                                </p>
                            </div>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeNotification(notif.id);
                                }}
                                className="p-1 hover:bg-black/5 rounded-md transition-colors relative z-10"
                            >
                                <X className="w-4 h-4 text-text-tertiary" />
                            </button>

                            {/* Progress bar for auto-dismiss */}
                            <motion.div
                                initial={{ width: '100%' }}
                                animate={{ width: '0%' }}
                                transition={{ duration: 6, ease: 'linear' }}
                                className="absolute bottom-0 left-0 h-1 bg-black/5"
                            />
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
