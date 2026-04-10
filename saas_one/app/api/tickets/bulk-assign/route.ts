/**
 * Bulk ticket assignment API.
 * Assigns tickets in bulk using assignment rules.
 * POST /api/tickets/bulk-assign
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { processIntelligentAssignment } from '@/backend/lib/ticketing/assignment';

/**
 * POST /api/tickets/bulk-assign
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { ticket_ids, property_id } = body;

        if (!ticket_ids || !Array.isArray(ticket_ids) || ticket_ids.length === 0) {
            return NextResponse.json({ error: 'Missing or empty ticket_ids array' }, { status: 400 });
        }

        if (!property_id) {
            return NextResponse.json({ error: 'Missing property_id' }, { status: 400 });
        }

        const validTicketIds = ticket_ids.filter((id: string) => !id.startsWith('temp-'));

        let ticketsToAssign = [];

        if (validTicketIds.length === 0) {
            const { data } = await supabase
                .from('tickets')
                .select('id, property_id, skill_group_code')
                .eq('property_id', property_id)
                .eq('status', 'open')
                .order('created_at', { ascending: false })
                .limit(ticket_ids.length);
            ticketsToAssign = data || [];
        } else {
            const { data } = await supabase
                .from('tickets')
                .select('id, property_id, skill_group_code')
                .in('id', validTicketIds);
            ticketsToAssign = data || [];
        }

        if (!ticketsToAssign || ticketsToAssign.length === 0) {
            return NextResponse.json({ error: 'No tickets found for assignment' }, { status: 404 });
        }

        const result = await processIntelligentAssignment(supabase, ticketsToAssign, property_id);
        return NextResponse.json({ success: true, ...result });

    } catch (error) {
        console.error('Bulk assign API error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
