/**
 * Resolver workload stats API.
 * Returns load-balanced list of available resolvers with active ticket counts
 * and computed workload scores for assignment.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUUID = (v: string | null): v is string => !!v && UUID_RE.test(v);

// GET: Get resolver workload for load balancing
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        const searchParams = request.nextUrl.searchParams;
        const propertyId = isUUID(searchParams.get('propertyId')) ? searchParams.get('propertyId') : null;
        const organizationId = isUUID(searchParams.get('organizationId')) ? searchParams.get('organizationId') : null;
        const skillGroupId = isUUID(searchParams.get('skillGroupId')) ? searchParams.get('skillGroupId') : null;

        // Base query for resolvers
        let resolverQuery = supabase
            .from('resolver_stats')
            .select(`id, user_id, property_id, is_available, current_floor, avg_resolution_minutes, user:users(id, full_name, email)`)
            .eq('is_available', true);

        // Build ticket count query scope in advance
        let ticketQueryBase = supabase
            .from('tickets')
            .select('assigned_to')
            .in('status', ['assigned', 'in_progress', 'paused']);

        if (propertyId) {
            resolverQuery = resolverQuery.eq('property_id', propertyId);
            ticketQueryBase = ticketQueryBase.eq('property_id', propertyId);
        } else if (organizationId) {
            const { data: props } = await supabase.from('properties').select('id').eq('organization_id', organizationId);
            const propIds = props?.map(p => p.id) || [];

            if (propIds.length === 0) {
                return NextResponse.json({ resolvers: [], total_available: 0 });
            }
            resolverQuery = resolverQuery.in('property_id', propIds);
            ticketQueryBase = ticketQueryBase.in('property_id', propIds);
        }

        if (skillGroupId) {
            ticketQueryBase = ticketQueryBase.eq('skill_group_id', skillGroupId);
        }

        // Run BOTH queries in parallel instead of sequentially
        const [resolversResult, activeTicketsResult] = await Promise.all([
            resolverQuery,
            ticketQueryBase,
        ]);

        const resolvers = resolversResult.data || [];
        const error = resolversResult.error;

        if (error) {
            console.error('[resolvers/workload] Supabase query error:', JSON.stringify(error, null, 2));
            return NextResponse.json({ error: 'Failed to fetch resolvers', details: error.message }, { status: 500 });
        }

        // Count tickets per resolver
        const ticketCounts: Record<string, number> = {};
        (activeTicketsResult.data || []).forEach((t: any) => {
            if (t.assigned_to) {
                ticketCounts[t.assigned_to] = (ticketCounts[t.assigned_to] || 0) + 1;
            }
        });

        // Deduplicate resolvers by user_id
        const uniqueResolvers = new Map();
        resolvers?.forEach(r => {
            if (!uniqueResolvers.has(r.user_id)) {
                uniqueResolvers.set(r.user_id, r);
            }
        });

        // Calculate scores
        const resolversWithScores = Array.from(uniqueResolvers.values()).map((r) => {
            const activeCount = ticketCounts[r.user_id] || 0;
            const score = (activeCount * 0.6) +
                ((r.current_floor || 1) * 0.2) +
                (Math.min((r.avg_resolution_minutes || 60) / 60, 10) * 0.2);

            return {
                ...r,
                active_tickets: activeCount,
                score: Math.round(score * 100) / 100,
            };
        }).sort((a, b) => a.score - b.score);

        return NextResponse.json({
            resolvers: resolversWithScores,
            total_available: resolversWithScores.length,
        });
    } catch (error) {
        console.error('[resolvers/workload] Uncaught error:', error);
        return NextResponse.json({ error: 'Internal server error', details: String(error) }, { status: 500 });
    }
}
