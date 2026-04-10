/**
 * Ticket flow/stage API.
 * GET: Get ticket workflow stages | POST: Transition ticket.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/tickets/flow
 * Returns tickets grouped by state and MST identity for operational flow visualization (V2)
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const propertyId = searchParams.get('property_id');
        const organizationId = searchParams.get('organization_id');
        const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
        
        const { createAdminClient } = await import('@/frontend/utils/supabase/admin');
        const queryClient = (organizationId && !propertyId) ? createAdminClient() : createAdminClient(); 

        // 1. Fetch tickets with MST information
        let query = queryClient
            .from('tickets')
            .select(`
                id,
                title,
                description,
                status,
                priority,
                skill_group_id,
                assigned_to,
                assigned_at,
                accepted_at,
                resolved_at,
                created_at,
                updated_at,
                skill_group:skill_groups(id, name, code),
                mst:users!tickets_assigned_to_fkey(
                    id, 
                    full_name, 
                    user_photo_url,
                    online_status,
                    last_seen_at,
                    team
                )
            `)
            .order('updated_at', { ascending: false });

        if (propertyId) query = query.eq('property_id', propertyId);
        if (organizationId) query = query.eq('organization_id', organizationId);

        // Performance optimization: Filter tickets to dramatically speed up Flow Map load times.
        // We fetch: 1) Currently active tickets. 2) Tickets that were completed ON the selected date.
        const nextDate = new Date(new Date(date).getTime() + 86400000).toISOString().split('T')[0];
        query = query.or(`status.in.(waitlist,open,assigned,in_progress),and(status.in.(resolved,completed,closed),updated_at.gte.${date}T00:00:00,updated_at.lt.${nextDate}T00:00:00)`);

        const { data: tickets, error: ticketError } = await query;

        if (ticketError) {
            console.error('[TicketFlowV2] Ticket query error:', ticketError);
            if (ticketError.message.includes('column') || ticketError.code === '42703') {
                return NextResponse.json({
                    error: 'Database migration required',
                    message: 'Some required columns for Flow Map V2 are missing. Please run the migration script: backend/db/migrations/flow_map_v2_updates.sql',
                    code: 'MIGRATION_REQUIRED'
                }, { status: 400 });
            }
            return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
        }

        // 2. Fetch MSTs for this property specifically
        // We use property_memberships to find users assigned to this property
        // Filter to only include MST roles (staff, mst) per PRD Section 3.2
        let mstQuery = queryClient
            .from('property_memberships')
            .select(`
                role,
                property_id,
                properties!inner(organization_id),
                user:users!inner(
                    id, 
                    full_name, 
                    user_photo_url, 
                    online_status, 
                    last_seen_at, 
                    team
                )
            `)
            .eq('is_active', true)
            .in('role', ['staff', 'mst']);

        if (propertyId) {
            mstQuery = mstQuery.eq('property_id', propertyId);
        } else if (organizationId) {
            mstQuery = mstQuery.eq('properties.organization_id', organizationId);
        }

        // Also get resolver_stats for shift status (is_checked_in) with skill_group details
        let statsQuery = queryClient
            .from('resolver_stats')
            .select(`
                user_id, 
                is_available, 
                is_checked_in, 
                skill_group_id,
                skill_group:skill_groups(id, name, code),
                properties!inner(organization_id)
            `);
            
        if (propertyId) {
            statsQuery = statsQuery.eq('property_id', propertyId);
        } else if (organizationId) {
            statsQuery = statsQuery.eq('properties.organization_id', organizationId);
        }
        
        const { data: resolverStats } = await statsQuery;

        const { data: propertyMembers, error: mstError } = await mstQuery;

        // Create a map of resolver stats by user_id for quick lookup
        const resolverStatsMap = new Map(
            resolverStats?.map(rs => [rs.user_id, rs]) || []
        );

        // Enrich MSTs with shift status and skill_group code for team segregation
        const allMsts = propertyMembers?.map((pm: any) => {
            const stats = resolverStatsMap.get(pm.user.id);
            const skillGroup = (stats as any)?.skill_group;
            // Use skill_group.code as team for proper segregation (plumbing, technical, etc.)
            const teamFromSkill = skillGroup?.code || pm.user.team || 'technical';
            return {
                ...pm.user,
                team: teamFromSkill, // Override team with skill_group code for proper grouping
                is_checked_in: stats?.is_checked_in ?? false,
                is_available: stats?.is_available ?? true,
                skill_group_id: stats?.skill_group_id,
                skill_group_name: skillGroup?.name,
            };
        }) || [];

        if (mstError) {
            console.error('[TicketFlowV2] MST query error:', mstError);
        }

        // 3. Process data
        const waitlist = tickets?.filter(t => t.status === 'waitlist' || t.status === 'open') || [];

        // Group by MST
        const mstGroups: Record<string, {
            mst: any;
            tickets: any[];
        }> = {};

        // Initialize groups with all known MSTs (including off-shift for visibility)
        allMsts?.forEach(mst => {
            mstGroups[mst.id] = {
                mst,
                tickets: []
            };
        });

        // Populate groups
        tickets?.forEach(ticket => {
            if (ticket.assigned_to && mstGroups[ticket.assigned_to]) {
                mstGroups[ticket.assigned_to].tickets.push(ticket);
            } else if (ticket.assigned_to) {
                // Fallback for MSTs not in current property membership
                const mstData = Array.isArray(ticket.mst) ? ticket.mst[0] : ticket.mst;
                const fallbackMst = { ...(mstData || {}) };

                if (!(fallbackMst as any).team) {
                    (fallbackMst as any).team = 'Field Ops';
                }
                (fallbackMst as any).is_checked_in = false;
                (fallbackMst as any).is_available = false;

                mstGroups[ticket.assigned_to] = {
                    mst: fallbackMst,
                    tickets: [ticket]
                };
            }
        });

        // 4. Calculate stats
        const stats = {
            totalActive: tickets?.filter(t => t.status !== 'resolved').length || 0,
            waitlistCount: waitlist.length,
            onlineMsts: allMsts?.filter(m => m.online_status === 'online').length || 0,
            checkedInMsts: allMsts?.filter(m => m.is_checked_in).length || 0,
            resolvedToday: tickets?.filter(t => t.status === 'resolved').length || 0,
        };

        return NextResponse.json({
            success: true,
            waitlist,
            mstGroups: Object.values(mstGroups),
            stats,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        console.error('[TicketFlowV2] Error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
