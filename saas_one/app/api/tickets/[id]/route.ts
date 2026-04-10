/**
 * Single ticket detail, update, workflow actions, and deletion.
 *
 * HTTP Methods: GET (ticket detail), PATCH (update/status/workflow), DELETE (soft delete)
 *
 * GET — Returns full ticket record with joined relations (category, skill_group, creator,
 *   assignee, organization, property) plus comments, activity log, escalation logs,
 *   and a computed timeline array with an optional "Pending Approval" step controlled
 *   by the ticket_validation feature flag.
 *   URL params: id (ticket UUID)
 *   Returns: { ticket, comments, activities, escalationLogs, timeline, validationEnabled }
 *
 * PATCH — Updates ticket fields or executes named MST workflow actions.
 *   URL params: id (ticket UUID)
 *   Body fields:
 *     Standard: status, assigned_to, priority, resolution_notes,
 *               photo_before_url, photo_after_url, rating, title, description
 *     Workflow actions (action string): self_assign | start_work | pause_work |
 *               resume_work | complete | validate
 *     Action extras: work_pause_reason, validation_approved, validation_note
 *   Returns: { success: true, ticket: Ticket }
 *
 * DELETE — Removes a ticket and its cascading records (notifications, delivery logs).
 *   Allowed for: master admin, ticket creator, property admin/manager/staff/mst, org super admin.
 *   URL params: id (ticket UUID)
 *   Returns: { success: true }
 *
 * Depends on:
 *   - Supabase auth (session required for PATCH and DELETE)
 *   - Supabase admin client (bypasses RLS for reads, updates, and deletes)
 *   - NotificationService (fires on assignment, waitlist, pending_validation, completion, validation)
 *   - Audit logging (logAudit) on status changes, assignments, completion, validation, deletion
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';
import { logAudit } from '@/backend/lib/audit';

/**
 * GET /api/tickets/[id]
 * Get ticket detail with timeline, comments, and activity
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();

        const { data: ticket, error } = await supabase
            .from('tickets')
            .select(`
        *,
        category:issue_categories(id, code, name, icon),
        skill_group:skill_groups(id, code, name),
        creator:users!raised_by(id, full_name, email, user_photo_url),
        assignee:users!assigned_to(id, full_name, email, user_photo_url),
        organization:organizations(id, name, code),
        property:properties(id, name, code)
      `)
            .eq('id', ticketId)
            .single();

        if (error || !ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        // Get comments
        const { data: comments } = await supabase
            .from('ticket_comments')
            .select(`*, user:users(id, full_name, email, user_photo_url)`)
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        const adminSupabase = createAdminClient();

        // Get activity log (use admin client to bypass RLS so all users' upload activities are visible)
        const { data: activities } = await adminSupabase
            .from('ticket_activity_log')
            .select(`*, user:users(id, full_name)`)
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: false })
            .limit(50);

        // Get escalation logs
        const { data: escalationLogs } = await adminSupabase
            .from('ticket_escalation_logs')
            .select(`*, from_employee:users!from_employee_id(id, full_name, user_photo_url), to_employee:users!to_employee_id(id, full_name, user_photo_url)`)
            .eq('ticket_id', ticketId)
            .order('escalated_at', { ascending: true });

        // Check if validation is enabled for this property
        const { data: feature } = await adminSupabase
            .from('property_features')
            .select('is_enabled')
            .eq('property_id', ticket.property_id)
            .eq('feature_key', 'ticket_validation')
            .maybeSingle();
        const validationEnabled = feature ? feature.is_enabled : true;

        // Build timeline — conditionally include validation step
        const timeline = [
            { step: 'Requested', completed: true, time: ticket.created_at },
            { step: 'Assigned', completed: !!ticket.assigned_at, time: ticket.assigned_at },
            { step: 'In Progress', completed: !!ticket.work_started_at, time: ticket.work_started_at },
            { step: 'Photos Uploaded', completed: !!ticket.photo_after_url, time: null },
            ...(validationEnabled ? [{ step: 'Pending Approval', completed: ['pending_validation', 'resolved', 'closed'].includes(ticket.status), time: ticket.status === 'pending_validation' ? ticket.resolved_at : null }] : []),
            { step: 'Completed', completed: ticket.status === 'resolved' || ticket.status === 'closed', time: ticket.resolved_at },
        ];

        return NextResponse.json({ ticket, comments: comments || [], activities: activities || [], escalationLogs: escalationLogs || [], timeline, validationEnabled });
    } catch (error) {
        console.error('Ticket detail error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/tickets/[id]
 * Update ticket status, assignment, SLA, photos
 * Supports MST-driven workflow actions: self_assign, start_work, pause_work, resume_work, complete
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();
        const adminSupabase = createAdminClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            // Standard fields
            status,
            assigned_to,
            priority,
            resolution_notes,
            photo_before_url,
            photo_after_url,
            rating,
            // Editable content fields
            title,
            description,
            // MST workflow actions
            action, // 'self_assign' | 'start_work' | 'pause_work' | 'resume_work' | 'complete' | 'validate'
            work_pause_reason,
            // Validation fields (for 'validate' action)
            validation_approved,
            validation_note,
        } = body;

        // Get current ticket
        const { data: currentTicket } = await supabase
            .from('tickets')
            .select('*')
            .eq('id', ticketId)
            .single();

        if (!currentTicket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
        }

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

        // Handle MST workflow actions
        if (action) {
            switch (action) {
                case 'self_assign':
                    // MST assigns ticket to themselves
                    if (currentTicket.assigned_to && currentTicket.assigned_to !== user.id) {
                        return NextResponse.json({
                            error: 'Ticket already assigned to another MST'
                        }, { status: 400 });
                    }
                    updates.assigned_to = user.id;
                    updates.assigned_at = new Date().toISOString();
                    updates.status = 'assigned';
                    updates.sla_started = true;
                    const slaHoursAssign = currentTicket.sla_hours || 24;
                    updates.sla_deadline = new Date(Date.now() + slaHoursAssign * 60 * 60 * 1000).toISOString();

                    await supabase.from('ticket_activity_log').insert({
                        ticket_id: ticketId,
                        user_id: user.id,
                        action: 'self_assigned',
                        new_value: user.id,
                    });
                    break;

                case 'start_work':
                    // MST starts working on ticket
                    if (currentTicket.assigned_to !== user.id) {
                        return NextResponse.json({
                            error: 'You must be assigned to this ticket to start work'
                        }, { status: 400 });
                    }
                    updates.status = 'in_progress';
                    updates.work_started_at = new Date().toISOString();
                    updates.work_paused = false;

                    await supabase.from('ticket_activity_log').insert({
                        ticket_id: ticketId,
                        user_id: user.id,
                        action: 'work_started',
                        old_value: currentTicket.status,
                        new_value: 'in_progress',
                    });
                    break;

                case 'pause_work':
                    // MST pauses work on ticket (requires reason)
                    if (currentTicket.assigned_to !== user.id) {
                        return NextResponse.json({
                            error: 'You must be assigned to this ticket to pause work'
                        }, { status: 400 });
                    }
                    if (!work_pause_reason) {
                        return NextResponse.json({
                            error: 'Pause reason is required'
                        }, { status: 400 });
                    }
                    updates.work_paused = true;
                    updates.work_paused_at = new Date().toISOString();
                    updates.work_pause_reason = work_pause_reason;
                    updates.work_paused_by = user.id;
                    updates.status = 'paused';

                    await supabase.from('ticket_activity_log').insert({
                        ticket_id: ticketId,
                        user_id: user.id,
                        action: 'work_paused',
                        new_value: work_pause_reason,
                    });
                    break;

                case 'resume_work':
                    // MST resumes paused work
                    if (currentTicket.assigned_to !== user.id) {
                        return NextResponse.json({
                            error: 'You must be assigned to this ticket to resume work'
                        }, { status: 400 });
                    }
                    updates.work_paused = false;
                    updates.work_paused_at = null;
                    updates.work_pause_reason = null;
                    updates.status = 'in_progress';

                    await supabase.from('ticket_activity_log').insert({
                        ticket_id: ticketId,
                        user_id: user.id,
                        action: 'work_resumed',
                        old_value: currentTicket.work_pause_reason,
                        new_value: 'in_progress',
                    });
                    break;

                case 'complete':
                    // MST marks ticket as done
                    if (currentTicket.assigned_to !== user.id) {
                        return NextResponse.json({
                            error: 'You must be assigned to this ticket to complete it'
                        }, { status: 400 });
                    }
                    updates.resolved_at = new Date().toISOString();
                    updates.work_paused = false;

                    {
                        // Check if this property has validation enabled via feature flags
                        const { data: feature } = await adminSupabase
                            .from('property_features')
                            .select('is_enabled')
                            .eq('property_id', currentTicket.property_id)
                            .eq('feature_key', 'ticket_validation')
                            .maybeSingle();

                        // Default to true if not specifically configured, to maintain existing behavior
                        const validationEnabled = feature ? feature.is_enabled : true;

                        if (currentTicket.internal || !validationEnabled) {
                            // Internal tickets OR properties without validation → close directly
                            updates.status = 'closed';
                            await supabase.from('ticket_activity_log').insert({
                                ticket_id: ticketId,
                                user_id: user.id,
                                action: 'completed',
                                old_value: currentTicket.status,
                                new_value: 'closed',
                            });
                            logAudit({
                                eventBy: user.id,
                                objectType: 'ticket',
                                objectId: ticketId,
                                action: 'ticket_completed',
                                payload: {
                                    ticket_title: currentTicket.title,
                                    property_id: currentTicket.property_id,
                                    closed_directly: true,
                                },
                            });
                        } else {
                            // Non-internal tickets with validation enabled → pending_validation
                            updates.status = 'pending_validation';
                            updates.validation_status = 'pending';
                            await supabase.from('ticket_activity_log').insert({
                                ticket_id: ticketId,
                                user_id: user.id,
                                action: 'pending_validation',
                                old_value: currentTicket.status,
                                new_value: 'pending_validation',
                            });
                            logAudit({
                                eventBy: user.id,
                                objectType: 'ticket',
                                objectId: ticketId,
                                action: 'ticket_completed',
                                payload: {
                                    ticket_title: currentTicket.title,
                                    property_id: currentTicket.property_id,
                                    closed_directly: false,
                                    awaiting_validation: true,
                                },
                            });
                        }
                    }
                    break;

                case 'validate': {
                    // Any tenant in the property can validate
                    const { data: validatorMembership } = await supabase
                        .from('property_memberships')
                        .select('role')
                        .eq('property_id', currentTicket.property_id)
                        .eq('user_id', user.id)
                        .eq('is_active', true)
                        .maybeSingle();

                    if (!validatorMembership || validatorMembership.role?.toUpperCase() !== 'TENANT') {
                        return NextResponse.json({
                            error: 'Only tenants can validate tickets'
                        }, { status: 403 });
                    }
                    if (currentTicket.status !== 'pending_validation') {
                        return NextResponse.json({
                            error: 'Ticket is not pending validation'
                        }, { status: 400 });
                    }
                    const isApproved = validation_approved === true;
                    updates.validated_by = user.id;
                    updates.validated_at = new Date().toISOString();
                    updates.validation_status = isApproved ? 'approved' : 'rejected';

                    if (isApproved) {
                        updates.status = 'resolved';
                    } else {
                        updates.status = 'open';
                        updates.resolved_at = null;
                        if (validation_note) updates.validation_note = validation_note;
                    }

                    await supabase.from('ticket_activity_log').insert({
                        ticket_id: ticketId,
                        user_id: user.id,
                        action: isApproved ? 'validated_approved' : 'validated_rejected',
                        old_value: 'pending_validation',
                        new_value: isApproved ? 'resolved' : (validation_note || 'rejected by client'),
                    });
                    logAudit({
                        eventBy: user.id,
                        objectType: 'ticket',
                        objectId: ticketId,
                        action: isApproved ? 'ticket_validated_approved' : 'ticket_validated_rejected',
                        payload: {
                            ticket_title: currentTicket.title,
                            property_id: currentTicket.property_id,
                            validation_note: validation_note || null,
                        },
                    });
                    break;
                }

                default:
                    return NextResponse.json({
                        error: `Unknown action: ${action}`
                    }, { status: 400 });
            }
        }

        // Handle standard status changes (if no action specified)
        if (!action && status && status !== currentTicket.status) {
            updates.status = status;

            if (status === 'in_progress' && !currentTicket.work_started_at) {
                updates.work_started_at = new Date().toISOString();
            }
            if (status === 'resolved' || status === 'closed') {
                if (!currentTicket.resolved_at) {
                    updates.resolved_at = new Date().toISOString();
                }
            }

            // Clear resolution metadata if moving back to an incomplete state
            if (['open', 'assigned', 'in_progress', 'waitlist'].includes(status)) {
                updates.resolved_at = null;
                updates.validation_status = null;
                updates.validated_at = null;
                updates.validated_by = null;
            }

            // If admin reopens from pending_validation, clear validation state
            if (status === 'open' && currentTicket.status === 'pending_validation') {
                updates.validation_status = null;
                updates.validated_at = null;
            }

            await supabase.from('ticket_activity_log').insert({
                ticket_id: ticketId,
                user_id: user.id,
                action: 'status_change',
                old_value: currentTicket.status,
                new_value: status,
            });
            logAudit({
                eventBy: user.id,
                objectType: 'ticket',
                objectId: ticketId,
                action: 'ticket_status_changed',
                payload: {
                    ticket_title: currentTicket.title,
                    property_id: currentTicket.property_id,
                    old_status: currentTicket.status,
                    new_status: status,
                },
            });
        }

        // Handle assignment (admin reassignment)
        if (!action && assigned_to !== undefined && assigned_to !== currentTicket.assigned_to) {
            updates.assigned_to = assigned_to;
            updates.assigned_at = new Date().toISOString();
            updates.status = 'assigned';
            updates.sla_started = true;

            const slaHours = currentTicket.sla_hours || 24;
            updates.sla_deadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

            await supabase.from('ticket_activity_log').insert({
                ticket_id: ticketId,
                user_id: user.id,
                action: 'assigned',
                new_value: assigned_to,
            });
            logAudit({
                eventBy: user.id,
                objectType: 'ticket',
                objectId: ticketId,
                action: 'ticket_assigned',
                payload: {
                    ticket_title: currentTicket.title,
                    property_id: currentTicket.property_id,
                    assigned_from: currentTicket.assigned_to || null,
                    assigned_to: assigned_to,
                },
            });
        }

        if (priority) updates.priority = priority;
        if (resolution_notes) updates.resolution_notes = resolution_notes;
        if (photo_before_url) updates.photo_before_url = photo_before_url;
        if (photo_after_url) updates.photo_after_url = photo_after_url;
        if (rating) updates.rating = rating;

        // Allow editing title and description for Creator, Property Admin, or MST
        if (title || description) {
            let canEditContent = false;

            if (currentTicket.raised_by === user.id) {
                canEditContent = true;
            } else {
                // Check Property Membership (Admin or MST/Staff)
                const { data: member } = await supabase
                    .from('property_memberships')
                    .select('role')
                    .eq('user_id', user.id)
                    .eq('property_id', currentTicket.property_id)
                    .eq('is_active', true)
                    .maybeSingle();

                if (member && ['PROPERTY_ADMIN', 'property_admin', 'MST', 'mst', 'STAFF', 'staff'].includes(member.role)) {
                    canEditContent = true;
                }

                // Check Org Super Admin
                if (!canEditContent && currentTicket.organization_id) {
                    const { data: om } = await supabase
                        .from('organization_memberships')
                        .select('role')
                        .eq('user_id', user.id)
                        .eq('organization_id', currentTicket.organization_id)
                        .eq('is_active', true)
                        .eq('role', 'ORG_SUPER_ADMIN')
                        .maybeSingle();

                    if (om) canEditContent = true;
                }
            }

            if (!canEditContent) {
                return NextResponse.json({ error: 'You do not have permission to edit the ticket content' }, { status: 403 });
            }

            if (title) updates.title = title;
            if (description) updates.description = description;

            // Log edit activity
            await supabase.from('ticket_activity_log').insert({
                ticket_id: ticketId,
                user_id: user.id,
                action: 'ticket_edited',
                old_value: 'Content updated',
                new_value: title || currentTicket.title // Store new title in logs
            });
        }

        const { data: ticket, error } = await adminSupabase
            .from('tickets')
            .update(updates)
            .eq('id', ticketId)
            .select()
            .single();

        if (error) {
            console.error('Update error:', error);
            return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 });
        }

        // Trigger Web Push Notifications asynchronously
        try {
            console.log('[Ticket Update API] update successful. Triggering notifications checks...');
            console.log('[Ticket Update API] Updates:', JSON.stringify(updates));

            const { NotificationService } = await import('@/backend/services/NotificationService');

            // Check for assignment
            if (updates.assigned_to) {
                console.log('[Ticket Update API] Triggering afterTicketAssigned...');
                NotificationService.afterTicketAssigned(ticketId).catch(err => {
                    console.error('[Ticket Update API] Notification trigger error (Assigned):', err);
                });
            } else {
                console.log('[Ticket Update API] skipping assignment notification (assigned_to not in updates)');
            }

            // Check for waitlist
            if (updates.status === 'waitlist') {
                console.log('[Ticket Update API] Triggering afterTicketWaitlisted...');
                NotificationService.afterTicketWaitlisted(ticketId).catch(err => {
                    console.error('[Ticket Update API] Notification trigger error (Waitlisted):', err);
                });
            }

            // Check for pending validation (non-internal MST complete, awaiting tenant approval)
            if (updates.status === 'pending_validation') {
                console.log('[Ticket Update API] Triggering afterTicketPendingValidation...');
                NotificationService.afterTicketPendingValidation(ticketId).catch(err => {
                    console.error('[Ticket Update API] Notification trigger error (PendingValidation):', err);
                });
            }

            // Check for completion (admin-forced or tenant-validated)
            if (updates.status === 'closed' || updates.status === 'resolved') {
                console.log('[Ticket Update API] Triggering afterTicketCompleted...');
                NotificationService.afterTicketCompleted(ticketId).catch(err => {
                    console.error('[Ticket Update API] Notification trigger error (Completed):', err);
                });
            }

            // Check for validation outcome (approved or rejected)
            if (action === 'validate') {
                console.log('[Ticket Update API] Triggering afterTicketValidated...');
                NotificationService.afterTicketValidated(ticketId, validation_approved === true).catch(err => {
                    console.error('[Ticket Update API] Notification trigger error (Validated):', err);
                });
            }
        } catch (err) {
            console.error('[Ticket Update API] Failed to load NotificationService:', err);
        }

        return NextResponse.json({ success: true, ticket });
    } catch (error) {
        console.error('Ticket update error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient(); // User client for auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch ticket details with admin client to bypass RLS for permission check
        const adminSupabase = createAdminClient();
        const { data: ticket, error: ticketError } = await adminSupabase
            .from('tickets')
            .select('id, property_id, organization_id, raised_by')
            .eq('id', ticketId)
            .single();

        if (ticketError || !ticket) {
            console.error('Delete permission check failed: Ticket not found or access denied', ticketError);
            return NextResponse.json({ error: 'Ticket not found or access denied' }, { status: 404 });
        }

        // Permission Logic:
        // 1. Master Admin can delete
        // 2. Creator can delete
        // 3. Property Admin (and variations) can delete
        // 4. Org Super Admin can delete
        let canDelete = false;

        // Fetch User Profile for Master Admin
        const { data: userProfile } = await adminSupabase
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .maybeSingle();

        // LOGGING FOR DEBUGGING
        const { data: allPMs } = await adminSupabase.from('property_memberships').select('*').eq('user_id', user.id);
        const { data: allOMs } = await adminSupabase.from('organization_memberships').select('*').eq('user_id', user.id);

        console.log(`[DELETE TICKET] User: ${user.id}, Master: ${userProfile?.is_master_admin}`);
        console.log(`[DELETE TICKET] Ticket: ${ticketId}, Property: ${ticket.property_id}, Org: ${ticket.organization_id}`);
        console.log(`[DELETE TICKET] User All PMs:`, allPMs);
        console.log(`[DELETE TICKET] User All OMs:`, allOMs);

        if (userProfile?.is_master_admin === true) {
            canDelete = true;
        }

        // Check if user is the creator
        if (!canDelete && ticket.raised_by === user.id) {
            canDelete = true;
        }

        const adminRoles = ['PROPERTY_ADMIN', 'property_admin', 'ORG_ADMIN', 'org_admin', 'org_super_admin', 'ORG_SUPER_ADMIN', 'admin', 'ADMIN', 'manager', 'MANAGER', 'manager_executive', 'super_admin', 'SUPER_ADMIN', 'staff', 'STAFF', 'mst', 'MST'];

        // Check Property Admin/Manager Roles
        if (!canDelete && ticket.property_id) {
            const { data: pmList } = await adminSupabase
                .from('property_memberships')
                .select('role, is_active')
                .eq('user_id', user.id)
                .eq('property_id', ticket.property_id);

            console.log(`[DELETE TICKET] Found PMs for this property:`, pmList);

            const validPm = pmList?.find(m =>
                adminRoles.includes(m.role) ||
                adminRoles.includes(m.role?.toLowerCase()) ||
                adminRoles.includes(m.role?.toUpperCase())
            );

            if (validPm) {
                console.log(`[DELETE TICKET] Found valid PM:`, validPm);
                canDelete = true;
            } else {
                console.log(`[DELETE TICKET] No valid PM found in list of ${pmList?.length || 0} memberships`);
            }
        }

        // Check Org Super Admin
        if (!canDelete && ticket.organization_id) {
            const { data: omList } = await adminSupabase
                .from('organization_memberships')
                .select('role, is_active')
                .eq('user_id', user.id)
                .eq('organization_id', ticket.organization_id);

            console.log(`[DELETE TICKET] Found OMs for this org:`, omList);

            const validOm = omList?.find(m =>
                adminRoles.includes(m.role) ||
                adminRoles.includes(m.role?.toLowerCase()) ||
                adminRoles.includes(m.role?.toUpperCase())
            );

            if (validOm) {
                console.log(`[DELETE TICKET] Found valid OM:`, validOm);
                canDelete = true;
            } else {
                console.log(`[DELETE TICKET] No valid OM found in list of ${omList?.length || 0} memberships`);
            }
        }

        if (!canDelete) {
            console.log(`[DELETE TICKET] Final Decision: Permission Denied for user ${user.id} on ticket ${ticketId}`);
            return NextResponse.json({ error: 'You do not have permission to delete this ticket' }, { status: 403 });
        }

        // Log deletion before it happens so we preserve ticket details
        logAudit({
            eventBy: user.id,
            objectType: 'ticket',
            objectId: ticketId,
            action: 'ticket_deleted',
            payload: {
                property_id: ticket.property_id,
                organization_id: ticket.organization_id,
                raised_by: ticket.raised_by,
            },
        });

        // Perform deletion using Admin Client to bypass RLS on cascaded tables
        // 1. Manually delete notifications (and rely on their cascade to delivery, or do strictly manual)
        const { error: notifDeleteError } = await adminSupabase
            .from('notifications')
            .delete()
            .eq('ticket_id', ticketId);

        // If the above failed due to FK from notification_delivery, we try deleting that first
        if (notifDeleteError && notifDeleteError.code === '23503') {
            console.log('Cascade blocked by notification_delivery, cleaning that up first...');
            const { data: notifIds } = await adminSupabase
                .from('notifications')
                .select('id')
                .eq('ticket_id', ticketId);

            if (notifIds && notifIds.length > 0) {
                const ids = notifIds.map(n => n.id);
                await adminSupabase
                    .from('notification_delivery')
                    .delete()
                    .in('notification_id', ids);

                // Retry notification delete
                await adminSupabase
                    .from('notifications')
                    .delete()
                    .eq('ticket_id', ticketId);
            }
        }

        // 2. Delete the Ticket
        const { error: deleteError } = await adminSupabase
            .from('tickets')
            .delete()
            .eq('id', ticketId);

        if (deleteError) {
            console.error('Admin delete error:', deleteError);
            return NextResponse.json({ error: 'Failed to delete ticket' }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Delete handler exception:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
