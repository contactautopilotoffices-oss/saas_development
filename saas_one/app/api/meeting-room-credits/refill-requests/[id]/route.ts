/**
 * Single refill request management.
 * PATCH: Approve/reject | DELETE: Cancel.
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * PATCH /api/meeting-room-credits/refill-requests/[id]
 * Admin approves or rejects a refill request
 * Body: { action: 'approve' | 'reject', hours?: number, adminNote?: string }
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: requestId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { action, hours, adminNote } = body;

        if (!['approve', 'reject'].includes(action)) {
            return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 });
        }

        // Fetch the refill request
        const { data: refillReq, error: reqErr } = await supabaseAdmin
            .from('meeting_room_credit_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (reqErr || !refillReq) {
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        if (refillReq.status !== 'pending') {
            return NextResponse.json({ error: 'Request has already been reviewed' }, { status: 409 });
        }

        // Verify caller is admin of the property
        const { data: membership } = await supabaseAdmin
            .from('property_memberships')
            .select('role')
            .eq('property_id', refillReq.property_id)
            .eq('user_id', user.id)
            .single();

        if (!['property_admin', 'staff', 'org_admin'].includes(membership?.role || '')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Update request status
        const { error: updateErr } = await supabaseAdmin
            .from('meeting_room_credit_requests')
            .update({
                status: action === 'approve' ? 'approved' : 'rejected',
                admin_note: adminNote || null,
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
            })
            .eq('id', requestId);

        if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

        // If approved, add hours to the tenant's credit balance
        if (action === 'approve') {
            const refillHours = parseFloat(hours) || refillReq.requested_hours || 0;

            // Fetch current credit record
            const { data: credit } = await supabaseAdmin
                .from('meeting_room_credits')
                .select('id, remaining_hours, monthly_hours')
                .eq('property_id', refillReq.property_id)
                .eq('user_id', refillReq.user_id)
                .single();

            if (credit) {
                const newRemaining = credit.remaining_hours + (refillHours || credit.monthly_hours);

                await supabaseAdmin
                    .from('meeting_room_credits')
                    .update({
                        remaining_hours: newRemaining,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', credit.id);

                // Audit log
                await supabaseAdmin.from('meeting_room_credit_log').insert({
                    credit_id: credit.id,
                    user_id: refillReq.user_id,
                    action: 'request_approved',
                    hours_changed: refillHours || credit.monthly_hours,
                    hours_after: newRemaining,
                    request_id: requestId,
                    performed_by: user.id,
                    notes: adminNote || `Refill request approved by admin`,
                });
            }
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[Refill Request PATCH]', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
