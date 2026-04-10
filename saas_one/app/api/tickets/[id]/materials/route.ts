/**
 * POST /api/tickets/[id]/materials
 * Create a material request for a ticket. Logs an internal comment, sends email to procurement assignee.
 * Body: { items: [{name, quantity, ...}], assignee_uid }
 *
 * PATCH /api/tickets/[id]/materials
 * Update material request status (pending → ordered → delivered → cancelled).
 * On 'ordered': creates procurement_orders record. On 'delivered': updates order delivery status.
 * Logs to procurement_activity_log and ticket_activity_log.
 * Body: { material_id, status: 'pending'|'ordered'|'delivered'|'cancelled' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';
import { EmailService } from '@/backend/services/EmailService';
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { items, assignee_uid } = body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ error: 'Items required' }, { status: 400 });
        }
        if (!assignee_uid) {
            return NextResponse.json({ error: 'Procurement assignee required' }, { status: 400 });
        }

        const adminSupabase = createAdminClient();

        // 1. Fetch Ticket details
        const { data: ticket } = await adminSupabase
            .from('tickets')
            .select('*, property:properties(name)')
            .eq('id', ticketId)
            .single();

        if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });

        // 2. Fetch User Profile (Requested By)
        const { data: requester } = await adminSupabase
            .from('users')
            .select('id, full_name, email')
            .eq('id', user.id)
            .single();

        const { data: reqMembership } = await adminSupabase
            .from('property_memberships')
            .select('role')
            .eq('user_id', user.id)
            .eq('property_id', ticket.property_id)
            .maybeSingle();

        // Fetch User Profile (Assignee / Procurement)
        const { data: assignee } = await adminSupabase
            .from('users')
            .select('id, full_name, email')
            .eq('id', assignee_uid)
            .single();

        // 3. Create Material Request
        const { data: materialReq, error: reqError } = await adminSupabase
            .from('material_requests')
            .insert({
                ticket_id: ticketId,
                property_id: ticket.property_id,
                requested_by: user.id,
                assignee_uid,
                items,
                status: 'pending'
            })
            .select()
            .single();

        if (reqError) {
            console.error('Failed to create material request:', reqError);
            return NextResponse.json({ error: 'Failed to create request' }, { status: 500 });
        }

        // 4. Create Chat Message (Structured Comment)
        const commentText = `Material requested: ${items.map(i => `${i.quantity}x ${i.name}`).join(', ')}`;
        
        await adminSupabase.from('ticket_comments').insert({
            ticket_id: ticketId,
            user_id: user.id,
            comment: commentText,
            is_internal: true, // Keep material requests internal by default so tenants don't see procurement chatter
            metadata: {
                mentions: [{ 
                    user_id: assignee_uid, 
                    name: assignee?.full_name || 'Procurement User',
                    role: 'Procurement' 
                }],
                material_request_id: materialReq.id
            }
        });

        // 5. Send Automated Email
        if (assignee?.email) {
            // Non-blocking email trigger
            EmailService.sendMaterialRequestEmail({
                emailTo: assignee.email,
                ticket,
                property: ticket.property,
                requestedBy: requester,
                requesterRole: reqMembership?.role || 'Staff',
                items
            }).catch(e => console.error('SMTP Failure (Async):', e));
        }

        return NextResponse.json({ success: true, material_request: materialReq });
    } catch (error) {
        console.error('POST Material Request Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/tickets/[id]/materials
 * Update status of an existing material request
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { material_id, status } = body;

        if (!['pending', 'ordered', 'delivered', 'cancelled'].includes(status)) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
        }

        const adminSupabase = createAdminClient();

        const { data: requestRecord, error: fetchErr } = await adminSupabase
            .from('material_requests')
            .select('*')
            .eq('id', material_id)
            .eq('ticket_id', ticketId)
            .single();

        if (fetchErr || !requestRecord) {
            return NextResponse.json({ error: 'Request not found' }, { status: 404 });
        }

        // Only allow update if assignee, requester, or master admin
        // But since this is from specific UI we'll rely on RLS logic parity here and use Admin
        // Wait, to be safe: Let's do user permissions check
        const isAssignee = requestRecord.assignee_uid === user.id;
        const isRequester = requestRecord.requested_by === user.id;
        const { data: masterAdmin } = await adminSupabase.from('users').select('is_master_admin').eq('id', user.id).single();
        
        if (!isAssignee && !isRequester && !(masterAdmin?.is_master_admin)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { data: updatedReq, error: updateErr } = await adminSupabase
            .from('material_requests')
            .update({ 
                status,
                ordered_at: status === 'ordered' ? new Date().toISOString() : undefined,
                delivered_at: status === 'delivered' ? new Date().toISOString() : undefined,
                cancelled_at: status === 'cancelled' ? new Date().toISOString() : undefined
            })
            .eq('id', material_id)
            .select()
            .single();

        if (updateErr) {
            return NextResponse.json({ error: 'Failed to update' }, { status: 500 });
        }

        // --- NEW: Procurement Tracking Integration ---
        
        // 1. Log to procurement_activity_log
        await adminSupabase.from('procurement_activity_log').insert({
            material_request_id: material_id,
            user_id: user.id,
            action: status === 'ordered' ? 'ordered' : (status === 'delivered' ? 'delivered' : (status === 'cancelled' ? 'cancelled' : 'updated')),
            old_value: requestRecord.status,
            new_value: status,
            metadata: { 
                ticket_id: ticketId,
                client_ip: request.headers.get('x-forwarded-for') || 'unknown'
            }
        });

        // 2. Automate Procurement Order record
        if (status === 'ordered') {
            await adminSupabase.from('procurement_orders').insert({
                material_request_id: material_id,
                property_id: requestRecord.property_id,
                organization_id: requestRecord.organization_id,
                ordered_by: user.id,
                vendor_name: 'Pending Assignment', // Could be updated later via full PO flow
                items: requestRecord.items,
                total_amount: requestRecord.total_estimated_cost || 0,
                delivery_status: 'pending'
            });
        } else if (status === 'delivered') {
            // Update order status if it exists
            await adminSupabase.from('procurement_orders')
                .update({ 
                    delivery_status: 'delivered',
                    actual_delivery: new Date().toISOString().split('T')[0]
                })
                .eq('material_request_id', material_id);
        }

        // 3. Add a timeline update or comment
        await adminSupabase.from('ticket_comments').insert({
            ticket_id: ticketId,
            user_id: user.id,
            comment: `📦 Material Request Status Updated: ${status.toUpperCase()}${status === 'ordered' ? ' (Order Generated)' : ''}`,
            is_internal: true,
            metadata: {
                system_update: true,
                material_request_id: material_id,
                status_change: status
            }
        });

        // 4. Also add log activity to ticket
        await adminSupabase.from('ticket_activity_log').insert({
            ticket_id: ticketId,
            user_id: user.id,
            action: 'material_status_changed',
            old_value: requestRecord.status,
            new_value: status
        });

        return NextResponse.json({ success: true, material_request: updatedReq });
    } catch (error) {
        console.error('PATCH Material Request Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
