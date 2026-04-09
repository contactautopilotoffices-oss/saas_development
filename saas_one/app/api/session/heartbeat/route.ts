/**
 * Session heartbeat API.
 * Updates last_activity timestamp for active user session.
 * POST: Send heartbeat.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * POST /api/session/heartbeat
 * Updates the last_activity timestamp for an active session
 * Called by frontend on route changes, clicks, API interactions (throttled to 30-60s)
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get session_id from request body
    const body = await request.json().catch(() => ({}));
    const sessionId = body.session_id;

    if (!sessionId) {
        console.log('[SessionHeartbeat] No session_id provided, skipping');
        return NextResponse.json({ error: 'session_id required' }, { status: 400 });
    }

    // console.log('[SessionHeartbeat] Heartbeat for session:', sessionId);

    try {
        // Update last_activity for this session
        const { data, error: updateError } = await supabase
            .from('user_sessions')
            .update({ last_activity: new Date().toISOString() })
            .eq('id', sessionId)
            .eq('user_id', user.id) // Ensure user owns this session
            .is('session_end', null) // Only update open sessions
            .select('id')
            .maybeSingle();

        if (updateError) {
            // Session might not exist or already closed
            console.log('[SessionHeartbeat] Session not found or closed:', updateError.message);
            return NextResponse.json({
                success: false,
                should_restart: true,
                error: 'Session not found or expired'
            }, { status: 200 });
        }

        return NextResponse.json({ success: true });

    } catch (err: any) {
        console.error('[SessionHeartbeat] Error:', err.message);
        return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
    }
}
