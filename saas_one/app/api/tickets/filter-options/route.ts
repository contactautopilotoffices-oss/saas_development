/**
 * Ticket filter options API.
 * Returns available filter values for ticket search UI.
 * GET /api/tickets/filter-options
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * GET /api/tickets/filter-options
 * Returns distinct creators and assignees for a given property or org.
 * Uses LIMIT to avoid scanning unbounded ticket tables.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const propertyId = searchParams.get('propertyId') || searchParams.get('property_id');
        const organizationId = searchParams.get('organizationId') || searchParams.get('organization_id');

        const queryClient = (organizationId && !propertyId) ? createAdminClient() : supabase;

        // Limit the query to avoid scanning unbounded tables.
        // 5000 rows is enough to capture all unique users in most orgs.
        const LIMIT = 5000;
        let ticketQuery = queryClient
            .from('tickets')
            .select('raised_by, assigned_to')
            .limit(LIMIT);

        if (propertyId) ticketQuery = ticketQuery.eq('property_id', propertyId);
        else if (organizationId) ticketQuery = ticketQuery.eq('organization_id', organizationId);

        const { data: ticketUsers, error } = await ticketQuery;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const creatorIds = [...new Set((ticketUsers || []).map((t: any) => t.raised_by).filter(Boolean))];
        const assigneeIds = [...new Set((ticketUsers || []).map((t: any) => t.assigned_to).filter(Boolean))];

        // Fetch names in parallel
        const [creatorsResult, assigneesResult] = await Promise.all([
            creatorIds.length > 0
                ? supabase.from('users').select('id, full_name').in('id', creatorIds)
                : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
            assigneeIds.length > 0
                ? supabase.from('users').select('id, full_name').in('id', assigneeIds)
                : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
        ]);

        return NextResponse.json({
            creators: (creatorsResult.data || []).filter((u: any) => u.full_name),
            assignees: (assigneesResult.data || []).filter((u: any) => u.full_name),
        });
    } catch (error) {
        console.error('filter-options error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
