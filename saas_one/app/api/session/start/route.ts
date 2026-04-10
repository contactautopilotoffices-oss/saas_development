/**
 * Session start API.
 * Creates new user session, closing any previously open sessions.
 * Returns session_id for client storage.
 * POST: Start session.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * POST /api/session/start
 * Creates a new user session and returns the session_id for cookie storage
 * Closes any existing open sessions for the user first
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        console.log('[SessionStart] Unauthorized request');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[SessionStart] Starting session for user:', user.id);

    // Get user agent from request
    const userAgent = request.headers.get('user-agent') || null;
    const forwardedFor = request.headers.get('x-forwarded-for');
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || null;

    try {
        // Fetch property membership to populate property_id
        const { data: membershipData } = await supabase
            .from('property_memberships')
            .select('property_id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

        const propertyId = membershipData?.property_id || null;

        // Close any existing open sessions for this user
        const { data: closedSessions } = await supabase
            .from('user_sessions')
            .update({
                session_end: new Date().toISOString(),
                duration_seconds: supabase.rpc('calculate_duration', {}) // Will be recalculated
            })
            .eq('user_id', user.id)
            .is('session_end', null)
            .select('id');

        if (closedSessions && closedSessions.length > 0) {
            console.log('[SessionStart] Closed', closedSessions.length, 'previous open sessions');

            // Recalculate duration for closed sessions
            for (const session of closedSessions) {
                await supabase.rpc('close_stale_sessions');
            }
        }

        // Create new session
        const { data: newSession, error: insertError } = await supabase
            .from('user_sessions')
            .insert({
                user_id: user.id,
                user_agent: userAgent,
                ip_address: ipAddress
            })
            .select('id')
            .single();

        if (insertError) {
            console.error('[SessionStart] Error creating session:', insertError.message);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        console.log('[SessionStart] Created new session:', newSession.id, 'for property:', propertyId);

        return NextResponse.json({
            session_id: newSession.id,
            message: 'Session started'
        });

    } catch (err: any) {
        console.error('[SessionStart] Unexpected error:', err.message);
        return NextResponse.json({ error: 'Failed to start session' }, { status: 500 });
    }
}
