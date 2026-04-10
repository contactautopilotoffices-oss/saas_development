/**
 * PATCH /api/tickets/[id]/override
 * Override ticket department/skill group classification
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
 * Override ticket department/skill group classification
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id: ticketId } = await params;
        const body = await request.json();
        const { skill_group_id, skill_group_code } = body;

        if (!skill_group_id && !skill_group_code) {
            return NextResponse.json({ error: 'Missing skill_group_id or skill_group_code' }, { status: 400 });
        }

        // Get current ticket to preserve original skill group
        const { data: currentTicket, error: fetchError } = await supabase
            .from('tickets')
            .select('skill_group_id')
            .eq('id', ticketId)
            .single();

        if (fetchError || !currentTicket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // Resolve skill_group_id if only code provided
        let resolvedSkillGroupId = skill_group_id;
        if (!resolvedSkillGroupId && skill_group_code) {
            const { data: skillGroup } = await supabase
                .from('skill_groups')
                .select('id')
                .eq('code', skill_group_code)
                .limit(1)
                .maybeSingle();

            if (!skillGroup) {
                return NextResponse.json({ error: 'Invalid skill_group_code' }, { status: 400 });
            }
            resolvedSkillGroupId = skillGroup.id;
        }

        // Update ticket with override tracking
        const { data: updatedTicket, error: updateError } = await supabase
            .from('tickets')
            .update({
                skill_group_id: resolvedSkillGroupId,
                classification_override: true,
                override_by: user.id,
                override_at: new Date().toISOString(),
                original_skill_group_id: currentTicket.skill_group_id,
                // Reset assignment since department changed
                assigned_to: null,
                assigned_at: null,
                status: 'open',
            })
            .eq('id', ticketId)
            .select('*, skill_group:skill_groups(id, code, name)')
            .single();

        if (updateError) {
            console.error('Error updating ticket:', updateError);
            return NextResponse.json({ error: 'Failed to override classification' }, { status: 500 });
        }

        // Log to activity log
        await supabase
            .from('ticket_activity_log')
            .insert({
                ticket_id: ticketId,
                user_id: user.id,
                action: 'classification_override',
                old_value: currentTicket.skill_group_id,
                new_value: resolvedSkillGroupId,
            });

        return NextResponse.json({
            success: true,
            ticket: updatedTicket,
        });

    } catch (error) {
        console.error('Override API error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
