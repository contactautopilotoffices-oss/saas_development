/**
 * @fileoverview Master Admin Dashboard Statistics API
 * @route GET /api/admin/dashboard-stats
 * @description
 *   Securely retrieves aggregated global statistics for the Master Admin dashboard.
 *   Returns counts of registered entities (properties), active user sessions,
 *   security audit log events from the past 24 hours, and pending soft-deletions.
 *   Only accessible to users with `is_master_admin = true`.
 * @requires_auth Yes — Master Admin only
 * @response 200 { entities, activeSessions, securityAlerts, pendingDeletions, status }
 * @response 401 Unauthorized — missing or invalid session
 * @response 403 Forbidden — user is not a master admin
 * @response 500 Internal Server Error
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/frontend/utils/supabase/server'
import { createAdminClient } from '@/frontend/utils/supabase/admin'

/**
 * GET /api/admin/dashboard-stats
 *
 * Securely fetch global stats for the Master Admin console.
 */
export async function GET(request: NextRequest) {
    try {
        // 1. Verify Authentication & Master Admin Status
        const supabase = await createClient()
        const { data: { session }, error: authError } = await supabase.auth.getSession()
        const currentUser = session?.user

        if (authError || !currentUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const adminClient = createAdminClient()

        const { data: masterAdminCheck, error: checkError } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', currentUser.id)
            .single()

        if (checkError || !masterAdminCheck?.is_master_admin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 2. Fetch Aggregated Stats in Parallel
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const [
            entitiesRes,
            sessionsRes,
            alertsRes,
            deletionsRes
        ] = await Promise.all([
            adminClient.from('properties').select('*', { count: 'exact', head: true }),
            adminClient.from('user_sessions').select('*', { count: 'exact', head: true }).is('session_end', null),
            adminClient.from('audit_logs').select('*', { count: 'exact', head: true }).gte('event_at', yesterday.toISOString()),
            adminClient.from('organizations').select('*', { count: 'exact', head: true }).eq('is_deleted', true)
        ]);

        const entitiesCount = entitiesRes.count || 0;
        const activeSessionsCount = sessionsRes.count || 0;
        const securityAlertsCount = alertsRes.count || 0;
        const pendingDeletionsCount = deletionsRes.count || 0;

        // 3. Return Data with nice fallbacks
        return NextResponse.json({
            entities: entitiesCount || 0,
            activeSessions: activeSessionsCount || 0,
            securityAlerts: securityAlertsCount || 0,
            pendingDeletions: pendingDeletionsCount || 0,
            status: 'operational'
        });

    } catch (error) {
        console.error('Admin stats API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
