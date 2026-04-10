/**
 * Ticket classification override API.
 * Manually overrides the AI-classified category/skill group.
 * PATCH /api/tickets/[id]/override-classification
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * PATCH /api/tickets/[id]/override-classification
 * Manual category override with feedback loop
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { category_id, skill_group_id, reason } = body;

        if (!category_id) {
            return NextResponse.json({ error: 'category_id is required' }, { status: 400 });
        }

        // Get current ticket for logging
        const { data: ticket } = await supabase
            .from('tickets')
            .select('category_id, skill_group_id, confidence_score')
            .eq('id', ticketId)
            .single();

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // Update ticket with manual classification
        const { data: updated, error } = await supabase
            .from('tickets')
            .update({
                category_id,
                skill_group_id: skill_group_id || null,
                classification_source: 'manual',
                confidence_score: 100, // Manual = 100% confidence
                is_vague: false,
                updated_at: new Date().toISOString(),
            })
            .eq('id', ticketId)
            .select(`
        *,
        category:issue_categories(id, code, name)
      `)
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to override classification' }, { status: 500 });
        }

        // Log activity
        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: 'classification_override',
            old_value: ticket.category_id,
            new_value: category_id,
        });

        return NextResponse.json({
            success: true,
            ticket: updated,
            message: 'Classification overridden successfully',
        });
    } catch (error) {
        console.error('Override classification error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
