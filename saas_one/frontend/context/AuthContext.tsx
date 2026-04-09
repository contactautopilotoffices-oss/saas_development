/**
 * Auth Context — Authentication & User Session Management
 *
 * Purpose: Provides authentication state and actions (sign-in, sign-out, OAuth, etc.)
 * to the entire React component tree via React Context.
 *
 * Why a Context:
 *   - Multiple components need to know if the user is logged in (sidebar, header, modals).
 *   - Prevents prop-drilling auth state through deeply nested components.
 *   - Centralizes auth logic in one place.
 *
 * What it manages:
 *   - User session (Supabase Auth session token)
 *   - User profile (name, email, phone from users table)
 *   - Organization & property membership (role + accessible properties)
 *   - Loading states (isLoading, isMembershipLoading)
 *
 * Auth providers supported:
 *   - Email/password (signIn, signUp)
 *   - Google OAuth (signInWithGoogle)
 *   - Apple OAuth (signInWithApple)
 *   - Zoho SSO (signInWithZoho — redirects to /api/auth/zoho)
 *
 * Membership caching:
 *   - In-memory Map cache (Map<userId, UserMembership>) prevents duplicate fetches.
 *   - TTL = 5 minutes. Cleared on sign-out or explicit refreshMembership() call.
 *
 * Provider hierarchy:
 *   AuthProvider must be placed at the top of the provider tree (before GlobalProvider).
 *   The sidebar and all pages access auth state via useAuth().
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createClient } from '@/frontend/utils/supabase/client';
import { User, Session } from '@supabase/supabase-js';

// --- Types ---

/** Cached organization and property membership data for a user */
interface UserMembership {
    org_id: string | null;
    org_name: string | null;
    org_role: string | null;
    /** List of properties this user has access to, with their role on each */
    properties: {
        id: string;
        name: string;
        code: string;
        role: string;
    }[];
}

/** Shape of the Auth Context value provided to all children */
interface AuthContextType {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    membership: UserMembership | null;
    isMembershipLoading: boolean;
    // Auth actions
    signIn: (email: string, password: string) => Promise<any>;
    signUp: (email: string, password: string, fullName: string) => Promise<any>;
    signInWithGoogle: (propertyCode?: string, redirectPath?: string) => Promise<void>;
    signInWithApple: (propertyCode?: string, redirectPath?: string) => Promise<void>;
    signInWithZoho: (propertyCode?: string, redirectPath?: string) => void;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    // Cache helpers
    refreshMembership: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// --- In-Memory Cache ---

/** Prevents duplicate membership fetches across components mounted simultaneously */
const membershipCache = new Map<string, { data: UserMembership; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// --- Provider Component ---

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [membership, setMembership] = useState<UserMembership | null>(null);
    const [isMembershipLoading, setIsMembershipLoading] = useState(false);
    const fetchingRef = useRef(false);  // Prevents duplicate parallel fetches

    // Create Supabase client once (not on every render)
    const supabase = useMemo(() => createClient(), []);

    /**
     * Fetch user's organization and property memberships.
     *
     * What it does:
     *   1. Checks in-memory cache (5-minute TTL) — returns early if cached.
     *   2. Fetches org_memberships + property_memberships in parallel (performance).
     *   3. Combines results into a UserMembership object.
     *   4. Stores in cache for 5 minutes.
     *
     * Why parallel fetches: An org admin may belong to 10 properties. Fetching them
     * sequentially would take 10x longer than a single parallel query.
     */
    const fetchMembership = useCallback(async (userId: string) => {
        if (fetchingRef.current) return;

        const cached = membershipCache.get(userId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            setMembership(cached.data);
            return;
        }

        fetchingRef.current = true;
        setIsMembershipLoading(true);

        try {
            // Run both queries in parallel — faster than sequential
            const [orgResult, propResult] = await Promise.all([
                supabase
                    .from('organization_memberships')
                    .select(`role, organization:organizations (id, name)`)
                    .eq('user_id', userId)
                    .eq('is_active', true)
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from('property_memberships')
                    .select(`role, property:properties (id, name, code)`)
                    .eq('user_id', userId)
                    .eq('is_active', true),
            ]);

            const orgData = orgResult.data;
            const propData = propResult.data;

            // Build the UserMembership object from both query results
            const membershipData: UserMembership = {
                org_id: (orgData?.organization as any)?.id || null,
                org_name: (orgData?.organization as any)?.name || null,
                org_role: orgData?.role || null,
                properties: propData?.map((p: any) => ({
                    id: p.property?.id,
                    name: p.property?.name,
                    code: p.property?.code,
                    role: p.role
                })).filter((p: any) => p.id) || []
            };

            membershipCache.set(userId, { data: membershipData, timestamp: Date.now() });
            setMembership(membershipData);
        } catch (err) {
            console.error('Membership fetch error:', err);
        } finally {
            fetchingRef.current = false;
            setIsMembershipLoading(false);
        }
    }, [supabase]);

    /** Force a fresh membership fetch (bypasses cache). Used after role changes. */
    const refreshMembership = useCallback(async () => {
        if (user?.id) {
            membershipCache.delete(user.id);
            await fetchMembership(user.id);
        }
    }, [user?.id, fetchMembership]);

    // --- Auth State Initialization ---
    useEffect(() => {
        // Get initial session from cookie (fast, no network call)
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setIsLoading(false);  // Show UI immediately; membership loads in background
            if (session?.user) {
                fetchMembership(session.user.id);
            }
        });

        // Subscribe to auth state changes (sign-in, sign-out, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            setSession(session);
            setUser(session?.user ?? null);

            if (event === 'SIGNED_IN' && session?.user) {
                await fetchMembership(session.user.id);
            } else if (event === 'SIGNED_OUT') {
                setMembership(null);
                if (user?.id) membershipCache.delete(user.id);
            }
            setIsLoading(false);
        });

        return () => subscription.unsubscribe();
    }, [supabase, fetchMembership]);

    // --- Auth Actions ---

    /**
     * Sign in with email and password.
     *
     * Fallback strategy:
     *   1. Try the /api/auth/login server route first.
     *   2. If unreachable (503), fall back to direct client-side signInWithPassword.
     *   3. If network error, same fallback.
     * This ensures login works even if Vercel cold-starts the serverless function.
     */
    const signIn = useCallback(async (email: string, password: string) => {
        let sessionData: Session | null = null;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
            });

            const result = await response.json();

            if (response.status === 503 || (result.error && result.error.toLowerCase().includes('unable to reach'))) {
                // Server route unreachable — fall back to direct Supabase client login
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw new Error(error.message);
                sessionData = data.session;
            } else if (!response.ok) {
                throw new Error(result.error || 'Login failed');
            }
        } catch (fetchError: any) {
            // Network error hitting the API route — fall back to direct client login
            if (fetchError.message === 'Failed to fetch' || fetchError.message?.includes('fetch')) {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw new Error(error.message);
                sessionData = data.session;
            } else {
                throw fetchError;
            }
        }

        // Sync session to browser client and refresh membership
        if (!sessionData) {
            const { data, error } = await supabase.auth.getSession();
            if (error) throw error;
            sessionData = data.session;
        }

        if (sessionData) {
            setSession(sessionData);
            setUser(sessionData.user);
            membershipCache.delete(sessionData.user.id);  // Always fetch fresh on sign-in
            await fetchMembership(sessionData.user.id);
        }

        return { data: { user: sessionData?.user || null, session: sessionData }, error: null };
    }, [supabase, fetchMembership]);

    /**
     * Sign in with Google OAuth.
     * Redirects the browser to Google's OAuth consent screen, then back to /api/auth/callback.
     *
     * @param propertyCode — Optional property code to join after auth (passed as OAuth state param)
     * @param redirectPath — Where to redirect the browser after successful OAuth callback
     */
    const signInWithGoogle = useCallback(async (propertyCode?: string, redirectPath?: string) => {
        const url = new URL(`${window.location.origin}/api/auth/callback`);
        if (redirectPath) url.searchParams.set('redirect', redirectPath);

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: url.toString(),
                queryParams: propertyCode ? { state: propertyCode } : {}  // Pass via OAuth state param
            }
        });
        if (error) throw error;
    }, [supabase]);

    /**
     * Sign in with Apple OAuth.
     * Same flow as Google OAuth but using Apple's Sign in with Apple provider.
     */
    const signInWithApple = useCallback(async (propertyCode?: string, redirectPath?: string) => {
        const url = new URL(`${window.location.origin}/api/auth/callback`);
        if (redirectPath) url.searchParams.set('redirect', redirectPath);

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'apple',
            options: {
                redirectTo: url.toString(),
                queryParams: propertyCode ? { state: propertyCode } : {}
            }
        });
        if (error) throw error;
    }, [supabase]);

    /**
     * Create a new account with email and password.
     * Calls /api/auth/signup server route which handles user creation + sending confirmation email.
     */
    const signUp = useCallback(async (email: string, password: string, fullName: string) => {
        const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, fullName }),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Signup failed');

        const { data: sessionData, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (sessionData.session) {
            setSession(sessionData.session);
            setUser(sessionData.session.user);
            await fetchMembership(sessionData.session.user.id);
        }

        return {
            user: sessionData.session?.user || result.data?.user || null,
            session: sessionData.session || result.data?.session || null
        };
    }, [supabase, fetchMembership]);

    /**
     * Sign out the current user.
     *
     * What it does:
     *   1. Optimistically clears local state immediately (instant UI feedback).
     *   2. Removes remembered credentials from localStorage.
     *   3. Clears all data cache entries (security — prevents stale data leaks).
     *   4. Calls supabase.auth.signOut() to invalidate the server session.
     */
    const signOut = useCallback(async () => {
        if (user?.id) membershipCache.delete(user.id);

        // Optimistic update — clear local state before async call completes
        setMembership(null);
        setSession(null);
        setUser(null);

        localStorage.removeItem('rememberedEmail');
        localStorage.removeItem('rememberedPassword');
        sessionStorage.setItem('justLoggedOut', 'true');

        // Clear all cached data (security)
        Object.keys(localStorage)
            .filter(k => k.startsWith('cache:'))
            .forEach(k => localStorage.removeItem(k));

        await supabase.auth.signOut();
    }, [supabase, user?.id]);

    /**
     * Send a password reset email to the given address.
     * Supabase sends the email and redirects to /reset-password on completion.
     */
    const resetPassword = useCallback(async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent('/reset-password')}`,
        });
        if (error) throw error;
    }, [supabase]);

    /**
     * Sign in via Zoho SSO.
     * Redirects to /api/auth/zoho which initiates the Zoho OAuth flow.
     */
    const signInWithZoho = useCallback((propertyCode?: string, redirectPath?: string) => {
        const url = new URL('/api/auth/zoho', window.location.origin);
        if (redirectPath) url.searchParams.set('redirect', redirectPath);
        if (propertyCode) url.searchParams.set('propertyCode', propertyCode);
        window.location.href = url.toString();
    }, []);

    // Memoize context value to prevent unnecessary re-renders
    const value = useMemo(() => ({
        user, session, isLoading, membership, isMembershipLoading,
        signIn, signUp, signInWithGoogle, signInWithApple, signInWithZoho,
        signOut, resetPassword, refreshMembership
    }), [user, session, isLoading, membership, isMembershipLoading,
         signIn, signUp, signInWithGoogle, signInWithApple, signInWithZoho,
         signOut, resetPassword, refreshMembership]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
