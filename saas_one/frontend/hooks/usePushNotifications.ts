/**
 * Push Notifications Hook — Browser Web Push Subscription Management
 *
 * Purpose: Manages the browser's Web Push notification subscription lifecycle.
 * Used by the frontend to opt-in users to browser push notifications (via FCM).
 *
 * How Web Push works in this app:
 *   1. User clicks "Enable Notifications" in the UI.
 *   2. This hook calls pushManager.subscribe() with the VAPID public key.
 *   3. The resulting PushSubscription object is sent to the backend.
 *   4. The backend stores it in the push_tokens table.
 *   5. When events occur, NotificationService.dispatchPushNotification()
 *      sends a message to each token via Firebase Cloud Messaging.
 *
 * VAPID keys:
 *   - Voluntary Application Server Identification (VAPID) is required for web push.
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY goes in the browser (safe to expose).
 *   - The private key stays on the server (used by firebaseAdmin when sending).
 *
 * Service Worker:
 *   - The /sw.js (Serwist-generated) service worker receives push events.
 *   - It shows a browser notification using the notification API.
 *
 * Development note:
 *   - Push subscriptions are NOT registered in development mode (NODE_ENV === 'development').
 *   - This prevents development machines from subscribing to production push channels.
 */

import { useState, useEffect } from 'react';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export function usePushNotifications() {
    const [isSupported, setIsSupported] = useState(false);
    const [subscription, setSubscription] = useState<PushSubscription | null>(null);
    const [message, setMessage] = useState('');

    // Check if the browser supports push notifications on mount
    useEffect(() => {
        const isDev = process.env.NODE_ENV === 'development';
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
            setIsSupported(true);
            // Only register the service worker in production
            if (!isDev) {
                registerServiceWorker();
            }
        }
    }, []);

    /** Register the service worker and get the current push subscription */
    async function registerServiceWorker() {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            const sub = await registration.pushManager.getSubscription();
            setSubscription(sub);
        } catch (error) {
            console.error('Service Worker registration failed:', error);
        }
    }

    /**
     * Subscribe the user to push notifications.
     *
     * What it does:
     *   1. Requests browser notification permission (user sees the browser prompt).
     *   2. Creates a PushSubscription using the VAPID public key.
     *   3. Sends the subscription to /api/web-push/save-subscription for storage.
     *
     * @returns The PushSubscription object or null if it failed
     */
    async function subscribeToPush() {
        if (!VAPID_PUBLIC_KEY) {
            console.error('VAPID public key not found in env');
            setMessage('Configuration error: No VAPID key');
            return null;
        }

        try {
            const registration = await navigator.serviceWorker.ready;
            let sub = await registration.pushManager.getSubscription();

            if (!sub) {
                // userVisibleOnly: true — every push must show a visible notification
                // (this is a Web Push standard requirement for Chrome)
                sub = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY),
                });
            }

            setSubscription(sub);
            setMessage('Successfully subscribed to push notifications!');

            // Send subscription to backend for storage
            await fetch('/api/web-push/save-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(sub),
            });

            return sub;
        } catch (error) {
            console.error('Error subscribing to push:', error);
            setMessage(error instanceof Error ? error.message : 'Failed to subscribe to push');
            return null;
        }
    }

    return { isSupported, subscription, subscribeToPush, message };
}

/**
 * Decode a base64url-encoded VAPID public key into a Uint8Array.
 * The browser's PushManager requires the key in this format.
 */
function urlB64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
