/**
 * Org-level tickets summary API.
 * Aggregated ticket stats across all org properties.
 * GET /api/organizations/[orgId]/tickets-summary
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/organizations/[orgId]/tickets-summary
 *
 * Organization-wide ticketing summary for Super Admin / Master Admin.
 *
 * Returns ticket counts by status (total, open, waitlist, in_progress, resolved,
 * pending_validation, sla_breached, urgent_open) and a per-property breakdown with
 * 30-day trend arrays (total, resolved, active, pending per day). Uses parallel
 * SQL-side count queries (count: exact, head: true) for O(1) network payload
 * regardless of ticket volume. Accepts optional ?period= query param:
 * today (default), week, month, or all.
 *
 * Auth: Supabase session (user must be authenticated).
 */

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    try {
        const { orgId } = await params;
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);

        const period = searchParams.get('period') || 'today';

        // Fetch all properties in the org
        const { data: properties, error: propError } = await supabase
            .from('properties')
            .select('id, name, code')
            .eq('organization_id', orgId);

        if (propError) {
            return NextResponse.json({ error: propError.message }, { status: 500 });
        }

        const propertyIds = properties?.map((p) => p.id) || [];
        if (propertyIds.length === 0) {
            return NextResponse.json({
                organization_id: orgId,
                period,
                total_tickets: 0,
                open_tickets: 0,
                in_progress: 0,
                resolved: 0,
                pending_validation: 0,
                validated_closed: 0,
                sla_breached: 0,
                avg_resolution_hours: 0,
                properties_with_validation: 0,
                properties: [],
            });
        }

        // Calculate date range
        let startDate = new Date();
        if (period === 'today') {
            startDate.setHours(0, 0, 0, 0);
        } else if (period === 'week') {
            startDate.setDate(startDate.getDate() - 7);
        } else if (period === 'month') {
            startDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
        }

        const periodFilter = period !== 'all' ? startDate.toISOString() : null;

        // --- HIGH PERFORMANCE AGGREGATION (SQL-SIDE) ---
        // Instead of fetching all rows and iterating in JS, we use parallel count queries.
        // This is O(1) for network traffic regardless of ticket volume.
        
        const resolvedStatuses = ['closed', 'satisfied', 'resolved', 'completed', 'cancelled', 'duplicate', 'rejected'];
        const openStatuses = ['open', 'waitlist', 'blocked'];
        const inProgressStatuses = ['assigned', 'in_progress', 'paused', 'work_started'];
        const urgentPriorities = ['urgent', 'high', 'critical'];

        const [
            totalCountRes,
            openCountRes,
            waitlistCountRes,
            inProgressCountRes,
            pendingValCountRes,
            resolvedCountRes,
            slaBreachCountRes,
            urgentOpenCountRes,
            validationFeaturesRes,
            trendDataRes
        ] = await Promise.all([
            // 1. Total (created in period)
            supabase.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', periodFilter || '1970-01-01'),
            // 2. Open (created in period AND still open/blocked)
            supabase.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', periodFilter || '1970-01-01').in('status', ['open', 'blocked']),
            // 3. Waitlist specifically
            supabase.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', periodFilter || '1970-01-01').eq('status', 'waitlist'),
            // 4. In Progress
            supabase.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', periodFilter || '1970-01-01').in('status', inProgressStatuses),
            // 5. Pending Validation
            supabase.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', periodFilter || '1970-01-01').eq('status', 'pending_validation'),
            // 6. Resolved/Closed (Every non-active outcome in the cohort)
            supabase.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', periodFilter || '1970-01-01').in('status', resolvedStatuses),
            // 7. SLA Breached
            supabase.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', periodFilter || '1970-01-01').eq('sla_breached', true),
            // 8. Urgent Open
            supabase.from('tickets').select('id', { count: 'exact', head: true }).in('property_id', propertyIds).gte('created_at', periodFilter || '1970-01-01').in('priority', urgentPriorities).not('status', 'in', `(${resolvedStatuses.map(s => `"${s}"`).join(',')},"pending_validation")`),
            // 9. Validation Features
            supabase.from('property_features').select('property_id, is_enabled').eq('feature_key', 'ticket_validation').in('property_id', propertyIds),
            // 10. Trend Data (always last 30 days for charts)
            supabase.from('tickets').select('status, priority, created_at, resolved_at, property_id').in('property_id', propertyIds).gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).limit(100000)
        ]);

        const totalCount = totalCountRes.count || 0;
        const openCount = (openCountRes.count || 0) + (waitlistCountRes.count || 0);
        const inProgressCount = inProgressCountRes.count || 0;
        const pendingCount = pendingValCountRes.count || 0;
        const resolvedCount = resolvedCountRes.count || 0;
        const slaBreachCount = slaBreachCountRes.count || 0;
        const urgentOpenCount = urgentOpenCountRes.count || 0;
        
        // Waitlist specifically for display
        const waitlistCountSpecific = waitlistCountRes.count || 0;

        const validationMap = new Map((validationFeaturesRes.data || []).map((f: any) => [f.property_id, f.is_enabled]));
        const validationEnabledIds = new Set(propertyIds.filter(id => validationMap.get(id) === true));

        // Processing Trend (last 30 days window)
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const days = Array.from({ length: 30 }, (_, i) => {
            const d = new Date(thirtyDaysAgo);
            d.setDate(d.getDate() + i);
            return d.toISOString().split('T')[0];
        });

        const totalTrend = new Array(30).fill(0), resolvedTrend = new Array(30).fill(0), activeTrend = new Array(30).fill(0), pendingTrend = new Array(30).fill(0);
        const propTrends = new Map<string, { total: number[], resolved: number[], active: number[], pending: number[] }>();

        (trendDataRes.data || []).forEach((t: any) => {
            const cDate = new Date(t.created_at).toISOString().split('T')[0];
            const cIdx = days.indexOf(cDate);
            
            if (!propTrends.has(t.property_id)) {
                propTrends.set(t.property_id, { total: new Array(30).fill(0), resolved: new Array(30).fill(0), active: new Array(30).fill(0), pending: new Array(30).fill(0) });
            }
            const pt = propTrends.get(t.property_id)!;

            if (cIdx !== -1) {
                totalTrend[cIdx]++;
                pt.total[cIdx]++;
                if (t.status === 'pending_validation') { pendingTrend[cIdx]++; pt.pending[cIdx]++; }
                if (!resolvedStatuses.includes(t.status)) { activeTrend[cIdx]++; pt.active[cIdx]++; }
            }
            if (t.resolved_at) {
                const rDate = new Date(t.resolved_at).toISOString().split('T')[0];
                const rIdx = days.indexOf(rDate);
                if (rIdx !== -1) { resolvedTrend[rIdx]++; pt.resolved[rIdx]++; }
            }
        });

        // Perform exact counts per property via concurrent count queries.
        // This scales beautifully without fetching hundreds of thousands of rows into memory and avoids 1000 max-rows limit.
        const propertyBreakdownPromises = properties.map(async (p) => {
            const [
                 pTotal,
                 pOpenRes,
                 pWaitlist,
                 pInProgress,
                 pResolved,
                 pPending,
                 pUrgent
            ] = await Promise.all([
                 supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', p.id).gte('created_at', periodFilter || '1970-01-01'),
                 supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', p.id).gte('created_at', periodFilter || '1970-01-01').in('status', ['open', 'blocked']),
                 supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', p.id).gte('created_at', periodFilter || '1970-01-01').eq('status', 'waitlist'),
                 supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', p.id).gte('created_at', periodFilter || '1970-01-01').in('status', inProgressStatuses),
                 supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', p.id).gte('created_at', periodFilter || '1970-01-01').in('status', resolvedStatuses),
                 supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', p.id).gte('created_at', periodFilter || '1970-01-01').eq('status', 'pending_validation'),
                 supabase.from('tickets').select('id', { count: 'exact', head: true }).eq('property_id', p.id).gte('created_at', periodFilter || '1970-01-01').in('priority', urgentPriorities).not('status', 'in', `(${resolvedStatuses.map(s => `"${s}"`).join(',')},"pending_validation")`)
            ]);
            
            const trends = propTrends.get(p.id) || { total: new Array(30).fill(0), resolved: new Array(30).fill(0), active: new Array(30).fill(0), pending: new Array(30).fill(0) };

            return {
                property_id: p.id,
                property_name: p.name,
                property_code: p.code,
                validation_enabled: validationMap.get(p.id) !== false,
                total: pTotal.count || 0,
                open: (pOpenRes.count || 0) + (pWaitlist.count || 0),
                waitlist: pWaitlist.count || 0,
                in_progress: pInProgress.count || 0,
                resolved: pResolved.count || 0,
                pending_validation: pPending.count || 0,
                urgent_open: pUrgent.count || 0,
                trends
            };
        });

        const propertyBreakdown = await Promise.all(propertyBreakdownPromises);

        propertyBreakdown.sort((a, b) => b.total - a.total);

        return NextResponse.json({
            organization_id: orgId,
            period,
            total_tickets: totalCount,
            open_tickets: openCount,
            waitlist: waitlistCountSpecific,
            in_progress: inProgressCount,
            resolved: resolvedCount,
            pending_validation: pendingCount,
            sla_breached: slaBreachCount,
            urgent_open: urgentOpenCount,
            avg_resolution_hours: 0,
            properties_with_validation: validationEnabledIds.size,
            properties: propertyBreakdown,
            trends: { total: totalTrend, resolved: resolvedTrend, active: activeTrend, pending: pendingTrend },
        });
    } catch (error) {
        console.error('Tickets summary error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
