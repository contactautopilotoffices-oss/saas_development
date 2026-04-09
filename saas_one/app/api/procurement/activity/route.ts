/**
 * Procurement activity log API.
 * GET: List procurement activity | POST: Log activity.
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

        // Fetch latest activities with rich context
        const { data: activities, error: logError } = await adminSupabase
            .from('procurement_activity_log')
            .select(`
                *,
                user:users!procurement_activity_log_user_id_fkey(full_name),
                material_request:material_requests(
                    id,
                    ticket:tickets(ticket_number, title),
                    property:properties(name)
                )
            `)
            .order('created_at', { ascending: false })
            .limit(10);

        if (logError) {
            console.error('Error fetching activities:', logError);
            
            // Fallback for foreign key name issues if they exist
            const { data: fallback, error: fbError } = await adminSupabase
                .from('procurement_activity_log')
                .select(`
                    *,
                    material_request:material_requests(
                        id,
                        ticket:tickets(ticket_number, title),
                        property:properties(name)
                    )
                `)
                .order('created_at', { ascending: false })
                .limit(10);
            
            if (fbError) throw fbError;
            return NextResponse.json(fallback || []);
        }

        return NextResponse.json(activities || []);
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
