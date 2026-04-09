/**
 * Procurement tickets API.
 * Lists tickets with material requests for procurement view.
 * GET /api/procurement/tickets
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const adminSupabase = createAdminClient();

        // Procurement Dashboard View:
        // We want all tickets where material_requests has assignee_uid = user.id
        // We will fetch material_requests joined with tickets
        
        const { data: requests, error } = await adminSupabase
            .from('material_requests')
            .select(`
                *,
                ticket:tickets (
                    id,
                    ticket_number,
                    title,
                    status,
                    priority,
                    created_at,
                    assigned_to,
                    assignee:users!tickets_assigned_to_fkey ( full_name )
                ),
                property:properties(id, name),
                requester:users!material_requests_requested_by_fkey(full_name, email)
            `)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching procurement tickets:', error);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        return NextResponse.json(requests || []);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
