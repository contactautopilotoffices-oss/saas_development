/**
 * Email/password authentication via Supabase.
 *
 * HTTP Methods: POST
 *
 * POST — Authenticates a user with email and password using Supabase's
 *   signInWithPassword. On success a session cookie is set server-side.
 *   Body: { email: string, password: string }
 *   Returns: { success: true } on success
 *   Errors: { error: string } with HTTP 400 (bad credentials), 503 (network failure), or 500
 *
 * Depends on:
 *   - Supabase auth (createClient — server-side Supabase client with cookie auth)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            );
        }

        const supabase = await createClient();
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            const isFetchError = error.message?.toLowerCase().includes('fetch failed') || error.message?.toLowerCase().includes('network');
            return NextResponse.json(
                { error: isFetchError ? 'Unable to reach authentication server. Please try again.' : error.message },
                { status: isFetchError ? 503 : 400 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Login API error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
