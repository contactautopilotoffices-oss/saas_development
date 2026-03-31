import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/organizations/[orgId]/tickets-summary
 * Organization-wide ticketing summary for Super Admin / Master Admin
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    try {
        const { orgId } = await params;
        const supabase = await createClient();
        const { searchParams } = new URL(request.url);

        const period = searchParams.get('period') || 'today'; // 'today' | 'week' | 'month'

        // Fetch all properties in the org
        const { data: properties, error: propError } = await supabase
            .from('properties')
            .select('id, name, code')
            .eq('organization_id', orgId);

        if (propError) {
            return NextResponse.json({ error: propError.message }, { status: 500 });
        }

        const propertyIds = properties?.map((p) => p.id) || [];

        // Fetch which properties have ticket_validation enabled
        const { data: validationFeatures } = await supabase
            .from('property_features')
            .select('property_id, is_enabled')
            .eq('feature_key', 'ticket_validation')
            .in('property_id', propertyIds);

        const validationMap = new Map((validationFeatures || []).map((f: any) => [f.property_id, f.is_enabled]));
        // Default to enabled if not explicitly set
        const propertiesWithValidation = propertyIds.filter(id => validationMap.get(id) !== false).length;

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

        // ── Paginate through all tickets to bypass Supabase's server-side max_rows cap ──
        // Supabase PostgREST enforces a max_rows limit (default 1000) server-side that
        // cannot be overridden by client .limit() calls. Pagination with .range() is the
        // only reliable way to fetch all rows regardless of org size.
        const PAGE_SIZE = 1000;
        let allTickets: any[] = [];
        let from = 0;

        while (true) {
            let pageQuery = supabase
                .from('tickets')
                .select('id, property_id, status, priority, sla_breached, created_at, resolved_at')
                .in('property_id', propertyIds)
                .range(from, from + PAGE_SIZE - 1);

            if (period !== 'all') {
                pageQuery = pageQuery.gte('created_at', startDate.toISOString());
            }

            const { data: page, error: pageErr } = await pageQuery;
            if (pageErr) break;
            if (!page || page.length === 0) break;

            allTickets = allTickets.concat(page);

            // If we got fewer rows than the page size, we've reached the end
            if (page.length < PAGE_SIZE) break;
            from += PAGE_SIZE;
        }

        const tickets = allTickets;

        // Calculate overall stats
        const totalTickets = tickets?.length || 0;
        const resolvedStatuses = ['resolved', 'closed'];

        const openTickets = tickets?.filter(t => t.status === 'open' || t.status === 'waitlist' || t.status === 'blocked').length || 0;
        const waitlist = tickets?.filter(t => t.status === 'waitlist').length || 0;
        const inProgress = tickets?.filter(t => t.status === 'assigned' || t.status === 'in_progress' || t.status === 'paused' || t.status === 'work_started').length || 0;
        const resolved = tickets?.filter(t => resolvedStatuses.includes(t.status || '')).length || 0;
        const pendingValidation = tickets?.filter(t => t.status === 'pending_validation').length || 0;
        const validatedClosed = tickets?.filter(t => t.status === 'closed').length || 0;
        const urgentOpen = tickets?.filter(t => (t.priority === 'urgent' || t.priority === 'high' || t.priority === 'critical') && !resolvedStatuses.includes(t.status || '') && t.status !== 'pending_validation').length || 0;
        const slaBreached = tickets?.filter(t => t.sla_breached).length || 0;

        // Calculate average resolution time
        const resolvedTickets = tickets?.filter(t => t.resolved_at) || [];
        let totalResolutionMs = 0;
        resolvedTickets.forEach(t => {
            const created = new Date(t.created_at);
            const resolvedAt = new Date(t.resolved_at);
            totalResolutionMs += resolvedAt.getTime() - created.getTime();
        });
        const avgResolutionHours = resolvedTickets.length > 0
            ? Math.round(totalResolutionMs / resolvedTickets.length / (1000 * 60 * 60))
            : 0;

        // Build property breakdown
        const propertyBreakdown = properties?.map(prop => {
            const propTickets = tickets?.filter(t => t.property_id === prop.id) || [];
            const validationOn = validationMap.get(prop.id) !== false;
            return {
                property_id: prop.id,
                property_name: prop.name,
                property_code: prop.code,
                validation_enabled: validationOn,
                total: propTickets.length,
                open: propTickets.filter(t => t.status === 'open' || t.status === 'waitlist' || t.status === 'blocked').length,
                waitlist: propTickets.filter(t => t.status === 'waitlist').length,
                in_progress: propTickets.filter(t => t.status === 'assigned' || t.status === 'in_progress' || t.status === 'paused' || t.status === 'work_started').length,
                resolved: propTickets.filter(t => resolvedStatuses.includes(t.status || '')).length,
                pending_validation: propTickets.filter(t => t.status === 'pending_validation').length,
                validated_closed: propTickets.filter(t => t.status === 'closed').length,
                urgent_open: propTickets.filter(t => (t.priority === 'urgent' || t.priority === 'high' || t.priority === 'critical') && !resolvedStatuses.includes(t.status || '') && t.status !== 'pending_validation').length,
                sla_breached: propTickets.filter(t => t.sla_breached).length,
            };
        }) || [];

        // Sort by total tickets descending
        propertyBreakdown.sort((a, b) => b.total - a.total);

        // ── TREND CALCULATION (Last 30 Days) ──
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        // Filter tickets for the last 30 days specifically for trends
        // (independent of the 'period' filter used for summary stats)
        const trendTickets = allTickets.filter(t => new Date(t.created_at) >= thirtyDaysAgo);

        const getDailyTrend = (ticketList: any[]) => {
            const days = Array.from({ length: 30 }, (_, i) => {
                const d = new Date(thirtyDaysAgo);
                d.setDate(d.getDate() + i);
                return d.toISOString().split('T')[0];
            });

            const totalTrend = new Array(30).fill(0);
            const resolvedTrend = new Array(30).fill(0);
            const activeTrend = new Array(30).fill(0);
            const pendingTrend = new Array(30).fill(0);

            ticketList.forEach(t => {
                const createdDate = new Date(t.created_at).toISOString().split('T')[0];
                const resolvedDate = t.resolved_at ? new Date(t.resolved_at).toISOString().split('T')[0] : null;
                const idx = days.indexOf(createdDate);
                const rIdx = resolvedDate ? days.indexOf(resolvedDate) : -1;

                if (idx !== -1) {
                    totalTrend[idx]++;
                    if (t.status === 'pending_validation') pendingTrend[idx]++;
                    if (!resolvedStatuses.includes(t.status || '')) activeTrend[idx]++;
                }
                if (rIdx !== -1) {
                    resolvedTrend[rIdx]++;
                }
            });

            return { total: totalTrend, resolved: resolvedTrend, active: activeTrend, pending: pendingTrend };
        };

        const globalTrends = getDailyTrend(trendTickets);

        // Add trends to property breakdown
        const propertyBreakdownWithTrends = propertyBreakdown.map(p => {
            const propTickets = trendTickets.filter(t => t.property_id === p.property_id);
            return {
                ...p,
                trends: getDailyTrend(propTickets)
            };
        });

        return NextResponse.json({
            organization_id: orgId,
            period,
            total_tickets: totalTickets,
            open_tickets: openTickets,
            waitlist,
            in_progress: inProgress,
            resolved,
            pending_validation: pendingValidation,
            validated_closed: validatedClosed,
            urgent_open: urgentOpen,
            sla_breached: slaBreached,
            avg_resolution_hours: avgResolutionHours,
            properties_with_validation: propertiesWithValidation,
            properties: propertyBreakdownWithTrends,
            trends: globalTrends
        });
    } catch (error) {
        console.error('Tickets summary error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
