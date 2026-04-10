/**
 * GET /api/tickets/[id]/activity
 * Get full activity log for a ticket
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
 * Get full activity log for a ticket
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();

        const { data: activities, error } = await supabase
            .from('ticket_activity_log')
            .select(`
        *,
        user:users(id, full_name, email)
      `)
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Activity fetch error:', error);
            return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
        }

        return NextResponse.json({ activities: activities || [] });
    } catch (error) {
        console.error('Activity error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
