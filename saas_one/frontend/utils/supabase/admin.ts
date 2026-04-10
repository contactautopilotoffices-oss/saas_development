/**
 * Supabase Admin Client Factory (Browser-Safe for Build-Time)
 *
 * Purpose: Creates a Supabase client with the SERVICE ROLE key.
 * Bypasses Row Level Security (RLS) for operations that need admin access.
 *
 * Why this matters:
 *   - Regular Supabase clients use the ANON key which enforces RLS.
 *   - Admin operations (creating auth users, sending invites) need elevated access.
 *   - The SERVICE ROLE key grants full database access but should be kept server-side.
 *
 * Usage:
 *   - In API routes: use directly for admin-only operations.
 *   - In backend services: import this to create admin clients.
 *
 * IMPORTANT SECURITY RULES:
 *   1. NEVER import this from frontend/client-side code (it exposes the service role key).
 *   2. Only use in: API routes, backend/lib/, backend/services/, server-side utilities.
 *   3. In Next.js, API routes are server-side by default — this is safe there.
 *   4. If imported from a client component, the service role key leaks to the browser.
 *
 * Auth behavior:
 *   - autoRefreshToken: false — admin clients don't need token refresh.
 *   - persistSession: false — admin clients are single-request contexts.
 *
 * Throws: If SUPABASE_SERVICE_ROLE_KEY is not set, throws an error at runtime.
 * This is intentional — missing the service role key is a configuration error.
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error(
            'Missing Supabase admin credentials. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.'
        )
    }

    return createSupabaseClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })
}
