'use client';

import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import Cookies from 'js-cookie';
import { useAuth } from '@/frontend/context/AuthContext';

const SESSION_COOKIE_NAME = 'app_session_id';
const SESSION_COOKIE_TTL = 1; // 1 day
const PING_THROTTLE_MS = 45000; // 45 seconds

interface SessionContextValue {
    sessionId: string | null;
    isSessionActive: boolean;
}

const SessionContext = createContext<SessionContextValue>({
    sessionId: null,
    isSessionActive: false,
});

export const useSession = () => useContext(SessionContext);

interface SessionProviderProps {
    children: React.ReactNode;
}

/**
 * SessionProvider - Manages user session lifecycle for analytics
 * 
 * - Initializes session on mount if no valid session cookie exists
 * - Sends throttled activity pings on route changes and interactions
 * - Stores session_id in first-party cookie (24h TTL)
 */
export const SessionProvider: React.FC<SessionProviderProps> = ({ children }) => {
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [isSessionActive, setIsSessionActive] = useState(false);
    const lastPingRef = useRef<number>(0);
    const isStartingRef = useRef<boolean>(false);
    const pathname = usePathname();

    // Start a new session
    const startSession = useCallback(async () => {
        if (isStartingRef.current) return;
        isStartingRef.current = true;
        try {
            console.log('[SessionProvider] Starting new session...');
            const res = await fetch('/api/session/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });

            if (res.ok) {
                const data = await res.json();
                const newSessionId = data.session_id;

                // Store in cookie
                Cookies.set(SESSION_COOKIE_NAME, newSessionId, {
                    expires: SESSION_COOKIE_TTL,
                    sameSite: 'Lax',
                    secure: process.env.NODE_ENV === 'production'
                });

                setSessionId(newSessionId);
                setIsSessionActive(true);
                console.log('[SessionProvider] Session started:', newSessionId);
            } else {
                console.error('[SessionProvider] Failed to start session:', res.status);
            }
        } catch (err: any) {
            if (err instanceof TypeError && err.message === 'Failed to fetch') {
                console.warn('[SessionProvider] Network error starting session (server might be restarting)');
            } else {
                console.error('[SessionProvider] Error starting session:', err);
            }
        } finally {
            isStartingRef.current = false;
        }
    }, []);

    // Send activity ping (throttled)
    const sendPing = useCallback(async () => {
        const now = Date.now();
        if (now - lastPingRef.current < PING_THROTTLE_MS) {
            return; // Throttled
        }

        const currentSessionId = sessionId || Cookies.get(SESSION_COOKIE_NAME);
        if (!currentSessionId) {
            return;
        }

        lastPingRef.current = now;

        try {
            const res = await fetch('/api/session/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId }),
            });

            if (!res.ok) {
                return;
            }

            const data = await res.json();
            if (data.should_restart) {
                console.log('[SessionProvider] Session expired/invalid, starting new one');
                await startSession();
            }
        } catch (err: any) {
            if (err instanceof TypeError && err.message === 'Failed to fetch') {
                // Silently ignore ping failures during server restarts to avoid console noise
                // console.warn('[SessionProvider] Network error during ping');
            } else {
                console.error('[SessionProvider] Ping error:', err);
            }
        }
    }, [sessionId, startSession]);

    const { user, isLoading: isAuthLoading } = useAuth();

    // Initialize session on mount/auth change
    useEffect(() => {
        if (isAuthLoading) return;
        if (!user) {
            setSessionId(null);
            setIsSessionActive(false);
            return;
        }

        const existingSessionId = Cookies.get(SESSION_COOKIE_NAME);

        if (existingSessionId) {
            console.log('[SessionProvider] Found existing session:', existingSessionId);
            setSessionId(existingSessionId);
            setIsSessionActive(true);
            // Send initial ping to validate session
            sendPing();
        } else {
            // No session, start new one
            startSession();
        }
    }, [user, isAuthLoading, startSession, sendPing]);

    // Send ping on route change
    useEffect(() => {
        if (isSessionActive && pathname) {
            sendPing();
        }
    }, [pathname, isSessionActive, sendPing]);

    // Optional: Add click/interaction listener for pings
    useEffect(() => {
        if (!isSessionActive) return;

        const handleInteraction = () => {
            sendPing();
        };

        // Listen for significant interactions
        document.addEventListener('click', handleInteraction, { passive: true });

        return () => {
            document.removeEventListener('click', handleInteraction);
        };
    }, [isSessionActive, sendPing]);

    return (
        <SessionContext.Provider value={{ sessionId, isSessionActive }}>
            {children}
        </SessionContext.Provider>
    );
};

export default SessionProvider;
