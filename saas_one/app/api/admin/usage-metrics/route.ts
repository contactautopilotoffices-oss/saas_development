/**
 * Usage metrics API.
 * Aggregated usage statistics for the Master Admin dashboard.
 * GET /api/admin/usage-metrics
 * Auth: Master Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * GET /api/admin/usage-metrics
 *
 * Returns aggregated session and engagement metrics per user for the admin dashboard.
 *
 * Accepts an optional ?orgId= query param to scope metrics to a specific organization.
 * If no orgId is provided, master admins see metrics for all users. Org admins only
 * see metrics for their own organization. Includes sessions_this_week, avg_duration,
 * total_sessions, last_active, and global KPIs (active_users_7d, avg_session_duration,
 * total_sessions_logged). Calls close_stale_sessions RPC non-blocking on each request.
 *
 * Auth: Supabase session + must be master admin or org-level admin.
 */
export async function GET(request: NextRequest) {
    const supabase = await createClient();

    // Get authenticated user
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
    if (authError || !currentUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    try {
        // 1. Check if Master Admin (Platform Level)
        const { data: masterAdminCheck } = await supabase
            .from('users')
            .select('is_master_admin')
            .eq('id', currentUser.id)
            .single();

        let isMasterAdmin = masterAdminCheck?.is_master_admin === true;
        let isOrgAdmin = false;

        // 2. Check for Org-Level Admin Role if not Master Admin
        if (!isMasterAdmin && orgId) {
            const { data: membership } = await supabase
                .from('organization_memberships')
                .select('role')
                .eq('user_id', currentUser.id)
                .eq('organization_id', orgId)
                .in('role', ['admin', 'super_admin', 'owner'])
                .eq('is_active', true)
                .limit(1)
                .single();

            if (membership) isOrgAdmin = true;
        }

        if (!isMasterAdmin && !isOrgAdmin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const adminClient = createAdminClient();

        // 3. Clear stale sessions (non-blocking - don't fail if this doesn't work)
        try {
            await adminClient.rpc('close_stale_sessions');
        } catch (staleError: any) {
            console.warn('[UsageMetrics] close_stale_sessions RPC failed (non-blocking):', staleError.message);
        }

        // 4. Fetch Users
        // If master admin and NO orgId, fetch ALL users
        // If orgId provided, fetch users in that org
        let usersQuery = adminClient
            .from('users')
            .select('id, full_name, email');

        if (orgId) {
            const { data: orgUsers } = await adminClient
                .from('organization_memberships')
                .select('user_id')
                .eq('organization_id', orgId)
                .eq('is_active', true);

            if (orgUsers && orgUsers.length > 0) {
                const userIds = orgUsers.map((u: any) => u.user_id);
                usersQuery = usersQuery.in('id', userIds);
            }
        }

        const { data: usersData, error: usersError } = await usersQuery;

        if (usersError) {
            console.error('[UsageMetrics] Error fetching users:', usersError.message);
            throw usersError;
        }

        // 5. Fetch sessions separately (more reliable than nested select)
        let sessionsData: any[] = [];
        try {
            const { data: sessions, error: sessionsError } = await adminClient
                .from('user_sessions')
                .select('id, user_id, session_start, last_activity, session_end, duration_seconds');

            if (sessionsError) {
                console.warn('[UsageMetrics] Error fetching sessions (non-blocking):', sessionsError.message);
            } else {
                sessionsData = sessions || [];
            }
        } catch (sessionsErr: any) {
            console.warn('[UsageMetrics] Sessions table may not exist:', sessionsErr.message);
        }

        // 6. Map sessions to users
        const sessionsByUser = sessionsData.reduce((acc: Record<string, any[]>, session: any) => {
            if (!acc[session.user_id]) acc[session.user_id] = [];
            acc[session.user_id].push(session);
            return acc;
        }, {});

        const users = (usersData || []).map((user: any) => ({
            ...user,
            user_sessions: sessionsByUser[user.id] || []
        }));

        // 7. Aggregate Metrics
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        let totalSessionsCount = 0;
        let totalDurationSeconds = 0;
        let completedSessionsCount = 0;
        let activeUsersLast7Days = new Set();

        const userMetrics = users?.map((user: any) => {
            const sessions = user.user_sessions || [];

            // Total sessions log for global KPI
            totalSessionsCount += sessions.length;

            const userSessionsThisWeek = sessions.filter((s: any) => {
                const start = new Date(s.session_start);
                if (start >= weekAgo) {
                    activeUsersLast7Days.add(user.id);
                    return true;
                }
                return false;
            }).length;

            const completed = sessions.filter((s: any) => s.duration_seconds != null);
            const userTotalDuration = completed.reduce((sum: number, s: any) => sum + s.duration_seconds, 0);

            totalDurationSeconds += userTotalDuration;
            completedSessionsCount += completed.length;

            const avgDuration = completed.length > 0
                ? Math.round(userTotalDuration / completed.length / 60) // in minutes
                : 0;

            const lastActiveSession = sessions.length > 0
                ? sessions.reduce((latest: any, current: any) => {
                    return new Date(current.last_activity) > new Date(latest.last_activity) ? current : latest;
                })
                : null;

            return {
                user_id: user.id,
                full_name: user.full_name,
                email: user.email,
                sessions_this_week: userSessionsThisWeek,
                avg_duration_minutes: avgDuration,
                total_sessions: sessions.length,
                last_active: lastActiveSession?.last_activity || null
            };
        }) || [];

        // Global KPIs
        const globalMetrics = {
            active_users_7d: activeUsersLast7Days.size,
            avg_session_duration_minutes: completedSessionsCount > 0
                ? Math.round(totalDurationSeconds / completedSessionsCount / 60)
                : 0,
            total_sessions_logged: totalSessionsCount,
            total_user_base: users?.length || 0
        };

        return NextResponse.json({
            global: globalMetrics,
            users: userMetrics.sort((a: any, b: any) => b.sessions_this_week - a.sessions_this_week)
        });

    } catch (err: any) {
        console.error('[UsageMetrics] API Error:', err.message);
        return NextResponse.json({ error: 'Failed to fetch usage metrics' }, { status: 500 });
    }
}
