import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { WhatsAppQueueService } from '@/backend/services/WhatsAppQueueService';

const STATUS_EMOJI: Record<string, string> = {
    done: '✅',
    postponed: '⏸️',
    skipped: '⏭️',
    pending: '⏳',
};

/**
 * PATCH /api/ppm/schedules/[id]
 * Update status, done_date, remark for a PPM schedule entry.
 * Sends WhatsApp to property admins + org super admins on status change.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { status, done_date, remark, verification_status } = body;

        const validStatuses = ['pending', 'done', 'postponed', 'skipped'];
        if (status && !validStatuses.includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        // Fetch current record to detect status change
        const { data: existing } = await supabaseAdmin
            .from('ppm_schedules')
            .select('*')
            .eq('id', id)
            .single();

        const { data, error } = await supabase
            .from('ppm_schedules')
            .update({
                ...(status !== undefined && { status }),
                ...(done_date !== undefined && { done_date }),
                ...(remark !== undefined && { remark }),
                ...(verification_status !== undefined && { verification_status }),
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        // Send WhatsApp notification if status actually changed
        if (existing && status && status !== existing.status) {
            sendPPMUpdateNotification(data, existing.status, user.id).catch(err =>
                console.error('[PPM] Update notification error:', err)
            );
        }

        return NextResponse.json({ schedule: data });
    } catch (err) {
        console.error('PPM update error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

async function sendPPMUpdateNotification(
    schedule: any,
    previousStatus: string,
    updatedByUserId: string
) {
    const recipientIds = new Set<string>();

    // Org super admins
    const { data: orgAdmins } = await supabaseAdmin
        .from('organization_memberships')
        .select('user_id')
        .eq('organization_id', schedule.organization_id)
        .in('role', ['org_super_admin', 'owner', 'admin', 'org_admin'])
        .neq('is_active', false);
    (orgAdmins || []).forEach((m: any) => recipientIds.add(m.user_id));

    // Property admins
    if (schedule.property_id) {
        const { data: propAdmins } = await supabaseAdmin
            .from('property_memberships')
            .select('user_id')
            .eq('property_id', schedule.property_id)
            .eq('role', 'property_admin')
            .eq('is_active', true);
        (propAdmins || []).forEach((m: any) => recipientIds.add(m.user_id));
    }

    // Fetch updater name
    const { data: updater } = await supabaseAdmin
        .from('users')
        .select('full_name')
        .eq('id', updatedByUserId)
        .single();
    const updaterName = updater?.full_name || 'A team member';

    if (recipientIds.size === 0) return;

    const emoji = STATUS_EMOJI[schedule.status] || '📋';
    const plannedLabel = new Date(schedule.planned_date + 'T12:00:00').toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    });

    const lines = [
        `${emoji} *PPM Task Updated*`,
        ``,
        `📋 *${schedule.system_name}*${schedule.detail_name ? ` — ${schedule.detail_name}` : ''}`,
        schedule.scope_of_work ? `🔧 ${schedule.scope_of_work}` : '',
        schedule.vendor_name ? `🏭 Vendor: ${schedule.vendor_name}` : '',
        schedule.location ? `📍 ${schedule.location}` : '',
        `📅 Planned: ${plannedLabel}`,
        ``,
        `📊 Status: *${previousStatus.toUpperCase()}* → *${schedule.status.toUpperCase()}*`,
        schedule.done_date ? `✅ Completed on: ${new Date(schedule.done_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}` : '',
        schedule.remark ? `💬 Remark: "${schedule.remark}"` : '',
        ``,
        `👤 Updated by: ${updaterName}`,
    ].filter(Boolean).join('\n');

    await WhatsAppQueueService.enqueue({
        userIds: [...recipientIds],
        message: lines,
        eventType: 'PPM_STATUS_UPDATE',
    });
}
