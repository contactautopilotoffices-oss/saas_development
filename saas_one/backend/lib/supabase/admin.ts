/**
 * Supabase Admin Client — Service Role Client
 *
 * Purpose: Provides a Supabase client authenticated with the SERVICE ROLE key.
 * This key bypasses all Row Level Security (RLS) policies.
 *
 * Why it exists:
 *   - Regular Supabase clients (browser/server) use the ANON key, which enforces RLS.
 *   - Backend services (cron jobs, webhooks, admin APIs) need to perform operations
 *     that RLS would block — such as inserting audit logs or reading across all orgs.
 *   - This client gives unrestricted database access to trusted backend code ONLY.
 *
 * SECURITY WARNING:
 *   - This file must NEVER be imported from frontend code or exposed to the client.
 *   - Only use in: /api/ routes, cron endpoints, backend/lib/, backend/services/.
 *   - The SERVICE ROLE key has full database access — treat it like a database password.
 *
 * Environment variables used:
 *   NEXT_PUBLIC_SUPABASE_URL    — Supabase project URL (safe to expose)
 *   SUPABASE_SERVICE_ROLE_KEY   — Service role secret (NEVER expose to client)
 */

import { createClient } from '@supabase/supabase-js';

// Create a Supabase client with service role privileges
export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
        auth: {
            // Disable token auto-refresh — admin clients don't need session management
            autoRefreshToken: false,
            // Don't persist sessions — this is a short-lived request context
            persistSession: false,
        },
    }
);
