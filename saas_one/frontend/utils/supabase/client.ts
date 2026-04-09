/**
 * Supabase Browser Client Factory
 *
 * Purpose: Creates a browser-side Supabase client using @supabase/ssr.
 * This client is used in React components and client-side hooks.
 *
 * Why @supabase/ssr (server-side rendering) package:
 *   - Manages the auth cookie automatically (critical for SSR/Next.js).
 *   - Refreshes tokens transparently on the server between requests.
 *   - Prevents the "blank screen on refresh" issue common with SPAs.
 *
 * When to use:
 *   - Frontend React components and hooks (useEffect, onClick handlers).
 *   - Client-side data fetching (useSWR, React Query).
 *
 * When NOT to use:
 *   - Server components (use createClient from ./server.ts instead).
 *   - API routes that need admin access (use ./admin.ts instead).
 *
 * Environment variables:
 *   NEXT_PUBLIC_SUPABASE_URL      — Supabase project URL (safe to expose to browser)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY — Anonymous key for client-side operations
 *
 * Note: The ANON key enforces Row Level Security (RLS) policies.
 * The browser client cannot bypass RLS — use admin.ts for server-side operations.
 */

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
}
