/**
 * Ticket reclassification API.
 * Re-runs the classification pipeline on a ticket.
 * POST /api/tickets/[id]/reclassify
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

import { classifyTicket } from '@/backend/lib/ticketing';

/**
 * POST /api/tickets/[id]/reclassify
 * Re-run classification engine on ticket description
 */
export async function POST(
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

        // Get ticket
        const { data: ticket } = await supabase
            .from('tickets')
            .select('id, description, property_id, category_id, confidence_score')
            .eq('id', ticketId)
            .single();

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // Re-classify
        const classification = classifyTicket(ticket.description);

        let categoryId = null;
        let skillGroupId = null;

        if (classification.issue_code) {
            const { data: category } = await supabase
                .from('issue_categories')
                .select('id, skill_group_id')
                .eq('property_id', ticket.property_id)
                .eq('code', classification.issue_code)
                .single();

            if (category) {
                categoryId = category.id;
                skillGroupId = category.skill_group_id;
            }
        }

        const isVague = classification.confidence === 'low';

        // Update ticket
        const { data: updated, error } = await supabase
            .from('tickets')
            .update({
                category_id: categoryId,
                skill_group_id: skillGroupId,
                confidence: classification.confidence,
                classification_source: 'rules_reeval',
                is_vague: isVague,
                status: isVague ? 'waitlist' : 'open',
                updated_at: new Date().toISOString(),
            })
            .eq('id', ticketId)
            .select(`
        *,
        category:issue_categories(id, code, name)
      `)
            .single();

        if (error) {
            return NextResponse.json({ error: 'Failed to reclassify' }, { status: 500 });
        }

        // Log activity
        await supabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: 'reclassified',
            old_value: String(ticket.confidence_score),
            new_value: String(classification.confidence),
        });

        return NextResponse.json({
            success: true,
            ticket: updated,
            classification: {
                category: classification.issue_code,
                confidence: classification.confidence,
                isVague: isVague,
            },
        });
    } catch (error) {
        console.error('Reclassify error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
