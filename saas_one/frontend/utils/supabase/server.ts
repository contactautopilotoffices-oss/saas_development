/**
 * Supabase Server Client Factory
 *
 * Purpose: Creates a server-side Supabase client for Next.js Server Components
 * and Server Actions. Uses @supabase/ssr which handles auth cookie management.
 *
 * Why a server-specific client:
 *   - Server components run on the server — they need direct database access.
 *   - The cookie-based auth means no redirect/callback flow is needed.
 *   - @supabase/ssr reads cookies from the incoming request automatically.
 *
 * How cookie handling works:
 *   - On initial request: cookies() reads all auth cookies from the request.
 *   - On set operation: cookies() sets auth cookies in the response headers.
 *   - This keeps the session alive across server component re-renders.
 *
 * When to use:
 *   - Next.js Server Components (page.tsx, layout.tsx).
 *   - Server Actions (form actions, mutations).
 *
 * When NOT to use:
 *   - Client components (use ./client.ts instead).
 *   - Admin operations (use ./admin.ts instead — it bypasses RLS).
 *
 * Note: The `setAll` error handling is intentional — in Server Components,
 * setting cookies is safe. In middleware (which also uses this), it may throw
 * because middleware can't set cookies. The catch prevents this from crashing.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
    const cookieStore = await cookies()

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                // Read all cookies from the incoming request
                getAll() {
                    return cookieStore.getAll()
                },
                // Set cookies in the response
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // setAll can throw in middleware contexts where cookies can't be modified.
                        // This is expected behavior — the error is safely caught here.
                    }
                },
            },
        }
    )
}
