import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { firebaseAdmin } from '@/backend/lib/firebase';
import { WhatsAppService } from './WhatsAppService';

export interface NotificationPayload {
    userId: string;
    ticketId?: string;
    bookingId?: string;
    propertyId: string;
    organizationId?: string;
    type: string;
    title: string;
    message: string;
    deepLink: string;
    /** Pre-built WhatsApp payload — skips ticket DB fetch inside send() entirely */
    whatsapp?: {
        message: string;
        mediaUrl?: string;
        mediaType?: 'image' | 'video';
    };
}

export interface Recipient {
    user_id: string;
    role: string;
}

export class NotificationService {
    static async afterTicketCreated(ticketId: string) {
        console.log('>>>>>>>>>> [NOTIFICATION TEST] afterTicketCreated starting for:', ticketId);
        try {
            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .select('*, properties(name), creator:users!raised_by(id, full_name), assignee:users!assigned_to(full_name)')
                .eq('id', ticketId)
                .single();

            if (ticketError || !ticket) {
                console.error('[NotificationService] Error fetching ticket:', ticketError);
                return;
            }

            const assigneeId = ticket.assigned_to ? String(ticket.assigned_to) : null;
            const assigneeName = ticket.assignee?.full_name || 'a team member';
            const creatorId = ticket.raised_by ? String(ticket.raised_by) : null;

            // Determine if the creator is a tenant
            const { data: creatorMembership } = await supabaseAdmin
                .from('property_memberships')
                .select('role')
                .eq('property_id', ticket.property_id)
                .eq('user_id', creatorId)
                .single();

            const isCreatorTenant = creatorMembership?.role?.toUpperCase() === 'TENANT';

            console.log('>>>>>>>>>> [NOTIFICATION TEST] Ticket Detail:', {
                id: ticket.id,
                title: ticket.title,
                assigneeId,
                creatorId,
                creatorRole: creatorMembership?.role || 'NONE',
                isCreatorTenant,
                propertyId: ticket.property_id
            });

            // 1. Resolve recipients with roles
            const prospectiveRecipients = await this.getRelevantRecipientsWithRoles(ticket.property_id);
            console.log('>>>>>>>>>> [NOTIFICATION TEST] Total prospective recipients found:', prospectiveRecipients.length);
            console.log('>>>>>>>>>> [NOTIFICATION TEST] Members Raw:', JSON.stringify(prospectiveRecipients));

            // Filter recipients based on user requirements:
            // "Tenant only receive the notification about the ticket created by himself and other tenant, not created by others"
            // If ticket is internal, tenants are excluded entirely
            const isInternal = !!ticket.is_internal;
            const recipients = prospectiveRecipients.filter((r: { userId: string; role: string }) => {
                const isRecipientTenant = r.role.toUpperCase() === 'TENANT';
                if (isRecipientTenant) {
                    // Internal tickets: never notify tenants
                    if (isInternal) {
                        console.log(`>>>>>>>>>> [NOTIFICATION TEST] Skipping tenant ${r.userId} — ticket is internal`);
                        return false;
                    }
                    // "Tenant only receive the notification about the ticket created by himself"
                    const shouldNotify = r.userId === creatorId;
                    console.log(`>>>>>>>>>> [NOTIFICATION TEST] Tenant recipient check for ${r.userId}: ${shouldNotify} (Is Creator: ${r.userId === creatorId})`);
                    return shouldNotify;
                }
                return true; // Staff/Admin/MST see everything
            }).map((r: { userId: string; role: string }) => r.userId);

            // 1b. Also include org_super_admin users for this organization
            if (ticket.organization_id) {
                const { data: orgAdmins } = await supabaseAdmin
                    .from('organization_memberships')
                    .select('user_id')
                    .eq('organization_id', ticket.organization_id)
                    .eq('role', 'org_super_admin');
                (orgAdmins || []).forEach((m: { user_id: string }) => {
                    if (!recipients.includes(String(m.user_id))) {
                        recipients.push(String(m.user_id));
                    }
                });
                console.log('>>>>>>>>>> [NOTIFICATION TEST] org_super_admin recipients added:', orgAdmins?.length || 0);
            }

            console.log('>>>>>>>>>> [NOTIFICATION TEST] Final recipients after filtering:', recipients);

            // 2. Pre-build WhatsApp payload ONCE — poll for media up to 3x (ticket creation
            //    triggers media upload in background so photo may not exist yet)
            let waTicket: any = { ...ticket, raiser: (ticket.creator as any) };
            if (!ticket.photo_before_url && !ticket.photo_after_url && !ticket.video_before_url && !ticket.video_after_url) {
                for (let i = 0; i < 3; i++) {
                    await new Promise(r => setTimeout(r, 3_000));
                    const { data: polled } = await supabaseAdmin
                        .from('tickets')
                        .select('photo_before_url, photo_after_url, video_before_url, video_after_url')
                        .eq('id', ticketId)
                        .single();
                    if (polled?.photo_before_url || polled?.photo_after_url || polled?.video_before_url || polled?.video_after_url) {
                        waTicket = { ...waTicket, ...polled };
                        break;
                    }
                }
            }
            await this.injectAssigneePhone(waTicket);
            const waBody = this.buildWhatsAppBody(waTicket);
            const { mediaUrl: waMediaUrl, mediaType: waMediaType } = this.extractMedia(waTicket);

            // 3. Broadcast Logic
            if (assigneeId) {
                console.log('>>>>>>>>>> [NOTIFICATION TEST] Flow: Created & Assigned');
                console.log('>>>>>>>>>> [NOTIFICATION TEST] Dispatching ASSIGNED to assignee:', assigneeId);
                await this.send({
                    userId: assigneeId,
                    ticketId: ticket.id,
                    propertyId: ticket.property_id,
                    organizationId: ticket.organization_id,
                    type: 'TICKET_ASSIGNED',
                    title: 'New Ticket Created & Assigned',
                    message: `A new ticket "${ticket.title}" has been created and assigned to you.`,
                    deepLink: `/tickets/${ticket.id}?from=requests`,
                    whatsapp: { message: `*New Ticket Created & Assigned*\n\n${waBody}`, mediaUrl: waMediaUrl, mediaType: waMediaType },
                });

                const others = recipients.filter((id: string) => id !== assigneeId);
                console.log(`>>>>>>>>>> [NOTIFICATION TEST] Dispatching CREATED to ${others.length} others.`);
                for (const userId of others) {
                    await this.send({
                        userId,
                        ticketId: ticket.id,
                        propertyId: ticket.property_id,
                        organizationId: ticket.organization_id,
                        type: 'TICKET_CREATED',
                        title: 'New Ticket Created & Assigned',
                        message: `A new ticket "${ticket.title}" has been created and assigned to ${assigneeName}.`,
                        deepLink: `/tickets/${ticket.id}?from=requests`,
                        whatsapp: { message: `*New Ticket Created & Assigned*\n\n${waBody}`, mediaUrl: waMediaUrl, mediaType: waMediaType },
                    });
                }
            } else {
                console.log('>>>>>>>>>> [NOTIFICATION TEST] Flow: Created (Unassigned)');
                console.log(`>>>>>>>>>> [NOTIFICATION TEST] Dispatching CREATED to all ${recipients.length} recipients.`);
                for (const userId of recipients) {
                    await this.send({
                        userId,
                        ticketId: ticket.id,
                        propertyId: ticket.property_id,
                        organizationId: ticket.organization_id,
                        type: 'TICKET_CREATED',
                        title: 'New Ticket Created',
                        message: `A new ticket "${ticket.title}" has been raised at ${ticket.properties?.name}.`,
                        deepLink: `/tickets/${ticket.id}?from=requests`,
                        whatsapp: { message: `*New Ticket Created*\n\n${waBody}`, mediaUrl: waMediaUrl, mediaType: waMediaType },
                    });
                }
            }
        } catch (error) {
            console.error('[NotificationService] afterTicketCreated CRASH:', error);
        }
    }

    /**
     * Triggered after a before-photo is uploaded to a ticket.
     * Sends WhatsApp messages to all recipients with the photo attached (no push/DB).
     */
    static async afterTicketPhotoUploaded(ticketId: string) {
        console.log('>>>>>>>>>> [WHATSAPP] afterTicketPhotoUploaded for:', ticketId);
        try {
            const { data: ticket, error } = await supabaseAdmin
                .from('tickets')
                .select('id, title, status, priority, ticket_number, photo_before_url, photo_after_url, video_before_url, video_after_url, property_id, organization_id, raised_by, assigned_to, properties(name), assignee:users!assigned_to(full_name)')
                .eq('id', ticketId)
                .single();

            if (error || !ticket) {
                console.error('[NotificationService] afterTicketPhotoUploaded: ticket not found', error);
                return;
            }

            const photo = ticket.photo_before_url || ticket.photo_after_url;
            const video = ticket.video_before_url || ticket.video_after_url;
            if (!photo && !video) {
                console.log('[NotificationService] afterTicketPhotoUploaded: no media yet, skipping');
                return;
            }

            const creatorId = ticket.raised_by ? String(ticket.raised_by) : null;

            const prospectiveRecipients = await this.getRelevantRecipientsWithRoles(ticket.property_id);
            const recipients = prospectiveRecipients
                .filter((r: { userId: string; role: string }) => {
                    if (r.role.toUpperCase() === 'TENANT') return r.userId === creatorId;
                    return true;
                })
                .map((r: { userId: string; role: string }) => r.userId);

            const priorityEmoji: Record<string, string> = {
                critical: '🔴', high: '🟠', medium: '🟡', low: '🟢'
            };
            const statusEmoji: Record<string, string> = {
                open: '📬', assigned: '👷', in_progress: '⚙️',
                resolved: '✅', closed: '🔒', waitlist: '⏳', blocked: '🚫'
            };
            const pEmoji = priorityEmoji[(ticket as any).priority] || '⚪';
            const sEmoji = statusEmoji[(ticket as any).status] || '📋';
            const propName = (ticket.properties as any)?.name || '';
            const assigneeName = (ticket.assignee as any)?.full_name || '';

            const message = [
                `*New Ticket*`,
                ``,
                `📋 *${ticket.title}*`,
                propName ? `🏢 ${propName}` : '',
                ticket.ticket_number ? `🎫 ${ticket.ticket_number}` : '',
                `${pEmoji} Priority: *${(ticket as any).priority?.toUpperCase()}*`,
                `${sEmoji} Status: *${(ticket as any).status?.replace(/_/g, ' ').toUpperCase()}*`,
                assigneeName ? `👷 Assigned to: *${assigneeName}*` : '',
            ].filter(Boolean).join('\n');

            console.log('>>>>>>>>>> [WHATSAPP] Sending photo notification to', recipients.length, 'recipients');

            await WhatsAppService.sendToUsers(recipients, {
                message,
                deepLink: `/tickets/${ticket.id}?from=requests`,
                mediaUrl: photo || video || undefined,
                mediaType: photo ? 'image' : 'video',
            });
        } catch (err) {
            console.error('[NotificationService] afterTicketPhotoUploaded error:', err);
        }
    }

    /**
     * Triggered after a ticket is added to waitlist.
     */
    static async afterTicketWaitlisted(ticketId: string) {
        console.log('>>>>>>>>>> [NOTIFICATION TEST] afterTicketWaitlisted for:', ticketId);
        try {
            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .select('*, properties(name), assignee:users!assigned_to(full_name, phone), raiser:users!raised_by(full_name)')
                .eq('id', ticketId)
                .single();

            if (ticketError || !ticket) return;

            const creatorId = ticket.raised_by ? String(ticket.raised_by) : null;
            const prospectiveRecipients = await this.getRelevantRecipientsWithRoles(ticket.property_id);

            const recipients = prospectiveRecipients.filter((r: { userId: string; role: string }) => {
                if (r.role.toUpperCase() === 'TENANT') return r.userId === creatorId;
                return true;
            }).map((r: { userId: string; role: string }) => r.userId);

            await this.injectAssigneePhone(ticket);
            const waBody = this.buildWhatsAppBody(ticket);
            const { mediaUrl: waMediaUrl, mediaType: waMediaType } = this.extractMedia(ticket);

            console.log(`>>>>>>>>>> [NOTIFICATION TEST] Sending WAITLISTED notification to ${recipients.length} recipients.`);
            for (const userId of recipients) {
                await this.send({
                    userId,
                    ticketId: ticket.id,
                    propertyId: ticket.property_id,
                    organizationId: ticket.organization_id,
                    type: 'TICKET_WAITLISTED',
                    title: 'Ticket Waitlisted ⏳',
                    message: `Ticket "${ticket.title}" has been added to the waitlist at ${ticket.properties?.name}.`,
                    deepLink: `/tickets/${ticket.id}?from=requests`,
                    whatsapp: { message: `*Ticket Waitlisted ⏳*\n\n${waBody}`, mediaUrl: waMediaUrl, mediaType: waMediaType },
                });
            }
        } catch (error) {
            console.error('[NotificationService] afterTicketWaitlisted error:', error);
        }
    }

    /**
     * Triggered when a ticket is manually reassigned to a different person.
     * Sends WhatsApp + push only to the new assignee.
     */
    static async afterTicketReassigned(ticketId: string) {
        console.log('>>>>>>>>>> [NOTIFICATION] afterTicketReassigned for:', ticketId);
        try {
            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .select('*, properties(name), assignee:users!assigned_to(full_name, phone), raiser:users!raised_by(full_name)')
                .eq('id', ticketId)
                .single();

            if (ticketError || !ticket || !ticket.assigned_to) {
                console.error('[NotificationService] afterTicketReassigned: ticket not found or no assignee', ticketError);
                return;
            }

            const assigneeId = String(ticket.assigned_to);
            await this.injectAssigneePhone(ticket);
            const waBody = this.buildWhatsAppBody(ticket);
            const { mediaUrl: waMediaUrl, mediaType: waMediaType } = this.extractMedia(ticket);

            await this.send({
                userId: assigneeId,
                ticketId: ticket.id,
                propertyId: ticket.property_id,
                organizationId: ticket.organization_id,
                type: 'TICKET_ASSIGNED',
                title: 'Ticket Reassigned to You',
                message: `Ticket "${ticket.title}" has been reassigned to you.`,
                deepLink: `/tickets/${ticket.id}?from=requests`,
                whatsapp: { message: `*Ticket Reassigned to You*\n\n${waBody}`, mediaUrl: waMediaUrl, mediaType: waMediaType },
            });
        } catch (error) {
            console.error('[NotificationService] afterTicketReassigned error:', error);
        }
    }

    static async afterTicketAssigned(ticketId: string, isAutoAssigned: boolean = false) {
        console.log('>>>>>>>>>> [NOTIFICATION TEST] afterTicketAssigned for:', ticketId);
        try {
            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .select('*, properties(name), assignee:users!assigned_to(full_name, phone), raiser:users!raised_by(full_name)')
                .eq('id', ticketId)
                .single();

            if (ticketError || !ticket || !ticket.assigned_to) {
                console.error('[NotificationService] Ticket not found or not assigned:', ticketError);
                return;
            }

            const assigneeId = String(ticket.assigned_to);
            const assigneeName = ticket.assignee?.full_name || 'a team member';
            const creatorId = ticket.raised_by ? String(ticket.raised_by) : null;

            const prospectiveRecipients = await this.getRelevantRecipientsWithRoles(ticket.property_id);
            const filteredRecipients = prospectiveRecipients.filter((r: { userId: string; role: string }) => {
                if (r.role.toUpperCase() === 'TENANT') return r.userId === creatorId;
                return true;
            }).map((r: { userId: string; role: string }) => r.userId);

            await this.injectAssigneePhone(ticket);
            const waBody = this.buildWhatsAppBody(ticket);
            const { mediaUrl: waMediaUrl, mediaType: waMediaType } = this.extractMedia(ticket);

            // 1. Notify Assignee
            await this.send({
                userId: assigneeId,
                ticketId: ticket.id,
                propertyId: ticket.property_id,
                organizationId: ticket.organization_id,
                type: 'TICKET_ASSIGNED',
                title: 'Ticket Assigned to You',
                message: isAutoAssigned
                    ? `A new ticket "${ticket.title}" has been created and auto-assigned to you.`
                    : `Ticket "${ticket.title}" has been assigned to you.`,
                deepLink: `/tickets/${ticket.id}?from=requests`,
                whatsapp: { message: `*Ticket Assigned to You*\n\n${waBody}`, mediaUrl: waMediaUrl, mediaType: waMediaType },
            });

            // 2. Notify Others
            const others = filteredRecipients.filter(id => id !== assigneeId);
            console.log(`>>>>>>>>>> [NOTIFICATION TEST] Sending ASSIGNED notification to ${others.length} others.`);
            for (const userId of others) {
                await this.send({
                    userId,
                    ticketId: ticket.id,
                    propertyId: ticket.property_id,
                    organizationId: ticket.organization_id,
                    type: 'TICKET_ASSIGNED',
                    title: 'Ticket Assigned',
                    message: `Ticket "${ticket.title}" has been assigned to ${assigneeName}.`,
                    deepLink: `/tickets/${ticket.id}?from=requests`,
                    whatsapp: { message: `*Ticket Assigned*\n\n${waBody}`, mediaUrl: waMediaUrl, mediaType: waMediaType },
                });
            }
        } catch (error) {
            console.error('[NotificationService] afterTicketAssigned error:', error);
        }
    }

    static async afterTicketCompleted(ticketId: string) {
        console.log('>>>>>>>>>> [NOTIFICATION TEST] afterTicketCompleted for:', ticketId);
        try {
            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .select('*, properties(name), assignee:users!assigned_to(full_name, phone), raiser:users!raised_by(full_name)')
                .eq('id', ticketId)
                .single();

            if (ticketError || !ticket) return;

            const creatorId = ticket.raised_by ? String(ticket.raised_by) : null;

            const prospectiveRecipients = await this.getRelevantRecipientsWithRoles(ticket.property_id);
            const recipients = prospectiveRecipients
                .filter((r: { userId: string; role: string }) => {
                    if (r.role.toUpperCase() === 'TENANT') return r.userId === creatorId;
                    return true;
                })
                .map((r: { userId: string; role: string }) => r.userId);

            await this.injectAssigneePhone(ticket);
            const waBody = this.buildWhatsAppBody(ticket);
            const { mediaUrl: waMediaUrl, mediaType: waMediaType } = this.extractMedia(ticket);

            console.log(`>>>>>>>>>> [NOTIFICATION TEST] Final COMPLETED recipients (${recipients.length}):`, recipients);
            for (const userId of recipients) {
                await this.send({
                    userId,
                    ticketId: ticket.id,
                    propertyId: ticket.property_id,
                    organizationId: ticket.organization_id,
                    type: 'TICKET_COMPLETED',
                    title: 'Ticket Completed ✅',
                    message: `Ticket "${ticket.title}" has been marked as completed.`,
                    deepLink: `/tickets/${ticket.id}?from=requests`,
                    whatsapp: { message: `*Ticket Completed ✅*\n\n${waBody}`, mediaUrl: waMediaUrl, mediaType: waMediaType },
                });
            }
        } catch (error) {
            console.error('[NotificationService] afterTicketCompleted error:', error);
        }
    }

    /**
     * Triggered when MST completes a ticket — notifies the tenant to validate.
     */
    static async afterTicketPendingValidation(ticketId: string) {
        console.log('>>>>>>>>>> [NOTIFICATION TEST] afterTicketPendingValidation for:', ticketId);
        try {
            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .select('id, title, property_id, organization_id, raised_by')
                .eq('id', ticketId)
                .single();

            if (ticketError || !ticket) return;

            // Only notify the tenant who raised the ticket
            if (!ticket.raised_by) return;

            const { data: creatorMembership } = await supabaseAdmin
                .from('property_memberships')
                .select('role')
                .eq('property_id', ticket.property_id)
                .eq('user_id', ticket.raised_by)
                .single();

            if (creatorMembership?.role?.toUpperCase() === 'TENANT') {
                await this.send({
                    userId: String(ticket.raised_by),
                    ticketId: ticket.id,
                    propertyId: ticket.property_id,
                    organizationId: ticket.organization_id,
                    type: 'TICKET_PENDING_VALIDATION',
                    title: 'Request Completed — Your Approval Needed',
                    message: `Your request "${ticket.title}" has been resolved. Please review and confirm.`,
                    deepLink: `/tickets/${ticket.id}?from=requests`
                });
            }
        } catch (error) {
            console.error('[NotificationService] afterTicketPendingValidation error:', error);
        }
    }

    /**
     * Triggered when tenant validates (approves or rejects) a ticket.
     */
    static async afterTicketValidated(ticketId: string, approved: boolean) {
        console.log('>>>>>>>>>> [NOTIFICATION TEST] afterTicketValidated for:', ticketId, 'approved:', approved);
        try {
            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .select('id, title, property_id, organization_id, assigned_to')
                .eq('id', ticketId)
                .single();

            if (ticketError || !ticket) return;

            const recipientIds = new Set<string>();

            // Notify property admins
            const { data: team } = await supabaseAdmin
                .from('property_memberships')
                .select('user_id, role')
                .eq('property_id', ticket.property_id);

            if (team) {
                team.filter(t => t.role?.toLowerCase() === 'property_admin')
                    .forEach(t => recipientIds.add(String(t.user_id)));
            }

            // Notify assignee (MST)
            if (ticket.assigned_to) {
                recipientIds.add(String(ticket.assigned_to));
            }

            const message = approved
                ? `Ticket "${ticket.title}" has been approved and marked as resolved by the client.`
                : `Ticket "${ticket.title}" was rejected by the client and has been reopened.`;

            for (const userId of Array.from(recipientIds)) {
                await this.send({
                    userId,
                    ticketId: ticket.id,
                    propertyId: ticket.property_id,
                    organizationId: ticket.organization_id,
                    type: approved ? 'TICKET_VALIDATED' : 'TICKET_REJECTED',
                    title: approved ? 'Ticket Validated by Client' : 'Ticket Rejected by Client',
                    message,
                    deepLink: `/tickets/${ticket.id}?from=requests`
                });
            }
        } catch (error) {
            console.error('[NotificationService] afterTicketValidated error:', error);
        }
    }

    /**
     * Triggered when a tenant raises a CRITICAL priority ticket.
     * Sends an urgent alert to all property staff/admins/MST — not to tenants.
     */
    static async afterCriticalTicketCreated(ticketId: string) {
        console.log('>>>>>>>>>> [NOTIFICATION] afterCriticalTicketCreated for:', ticketId);
        try {
            const { data: ticket, error: ticketError } = await supabaseAdmin
                .from('tickets')
                .select('*, properties(name), creator:users!raised_by(full_name)')
                .eq('id', ticketId)
                .single();

            if (ticketError || !ticket) {
                console.error('[NotificationService] afterCriticalTicketCreated: ticket not found', ticketError);
                return;
            }

            const creatorName = (ticket.creator as any)?.full_name || 'A client';
            const propertyName = (ticket.properties as any)?.name || 'the property';

            // Notify all staff, admins, MST, security — exclude tenants
            const { data: members } = await supabaseAdmin
                .from('property_memberships')
                .select('user_id, role')
                .eq('property_id', ticket.property_id)
                .in('role', ['property_admin', 'staff', 'mst', 'security']);

            const recipientIds = (members || []).map(m => String(m.user_id));
            console.log(`>>>>>>>>>> [NOTIFICATION] Sending CRITICAL alert to ${recipientIds.length} staff/admin recipients`);

            for (const userId of recipientIds) {
                await this.send({
                    userId,
                    ticketId: ticket.id,
                    propertyId: ticket.property_id,
                    organizationId: ticket.organization_id,
                    type: 'TICKET_CRITICAL',
                    title: 'Critical Request — Immediate Action Required',
                    message: `${creatorName} raised a CRITICAL request at ${propertyName}: "${ticket.title}". Please resolve this urgently.`,
                    deepLink: `/tickets/${ticket.id}?from=requests`,
                });
            }
        } catch (error) {
            console.error('[NotificationService] afterCriticalTicketCreated error:', error);
        }
    }

    static async afterRoomBooked(bookingId: string) {
        console.log('>>>>>>>>>> [NOTIFICATION TEST] afterRoomBooked starting for:', bookingId);
        try {
            const { data: booking, error: bookingError } = await supabaseAdmin
                .from('meeting_room_bookings')
                .select('*, meeting_room:meeting_rooms(name), booker:users!user_id(full_name)')
                .eq('id', bookingId)
                .single();

            if (bookingError || !booking) {
                console.error('[NotificationService] Error fetching booking:', bookingError);
                return;
            }

            const bookerName = booking.booker?.full_name || 'A tenant';
            const roomName = booking.meeting_room?.name || 'a meeting room';
            const date = booking.booking_date;
            const startTime = booking.start_time;
            const endTime = booking.end_time;

            const message = `${bookerName} has booked "${roomName}" for ${date} from ${startTime} to ${endTime}.`;

            // Get relevant recipients (Role based)
            // Note: 'technical' is a skill/team, not an app_role enum value.
            const { data: members, error: membersError } = await supabaseAdmin
                .from('property_memberships')
                .select('user_id, role')
                .eq('property_id', booking.property_id)
                .in('role', ['property_admin', 'staff', 'mst', 'security']);

            if (membersError) {
                console.error('[NotificationService] Error fetching property members for booking notification:', membersError);
                return;
            }

            const memberIds = (members || []).map(m => String(m.user_id));

            // Fetch users with 'technical' skill
            const { data: technicalSkills } = await supabaseAdmin
                .from('mst_skills')
                .select('user_id')
                .eq('skill_code', 'technical')
                .in('user_id', memberIds);

            const technicalUserIds = new Set((technicalSkills || []).map(s => String(s.user_id)));

            const finalRecipients = (members || []).filter(m => {
                const role = m.role?.toLowerCase();
                // 1. Property Admins always get notified
                if (role === 'property_admin') return true;
                // 2. ONLY Staff members get notified if they have the 'technical' skill
                // (MST members are excluded even if they have technical skill)
                if (role === 'staff') {
                    return technicalUserIds.has(String(m.user_id));
                }
                return false;
            }).map(m => String(m.user_id));

            const uniqueRecipients = Array.from(new Set(finalRecipients));

            console.log(`>>>>>>>>>> [NOTIFICATION TEST] Found ${members?.length || 0} members, ${technicalUserIds.size} technical ones.`);
            console.log(`>>>>>>>>>> [NOTIFICATION TEST] Sending BOOKING notification to ${uniqueRecipients.length} recipients.`);

            for (const userId of uniqueRecipients) {
                await this.send({
                    userId,
                    bookingId: booking.id,
                    propertyId: booking.property_id,
                    type: 'ROOM_BOOKED',
                    title: 'New Room Booking',
                    message,
                    deepLink: `/property-admin/bookings?date=${date}`
                });
            }
        } catch (error) {
            console.error('[NotificationService] afterRoomBooked error:', error);
        }
    }

    private static async getRelevantRecipientsWithRoles(propertyId: string) {
        console.log('>>>>>>>>>> [NOTIFICATION TEST] getRelevantRecipientsWithRoles for:', propertyId);

        // 1. Log ALL roles for this property to see what's actually in DB
        const { data: allMembers } = await supabaseAdmin
            .from('property_memberships')
            .select('role')
            .eq('property_id', propertyId);
        console.log('>>>>>>>>>> [NOTIFICATION TEST] ALL roles in property:', allMembers?.map(m => m.role) || 'NONE');

        // 2. Fetch target roles
        const { data: members, error } = await supabaseAdmin
            .from('property_memberships')
            .select('user_id, role')
            .eq('property_id', propertyId)
            .in('role', ['mst', 'property_admin', 'security', 'staff', 'tenant']);

        if (error) console.error('[NotificationService] Recipients query error:', error);

        const results = (members || []).map((m: { user_id: string; role: string }) => ({
            userId: String(m.user_id),
            role: String(m.role)
        }));

        console.log('>>>>>>>>>> [NOTIFICATION TEST] Filtered Query Result:', JSON.stringify(results));
        return results;
    }



    /** Fetch assignee phone directly if the join didn't return it */
    private static async injectAssigneePhone(ticket: any): Promise<void> {
        if (!ticket?.assigned_to || ticket?.assignee?.phone) return;
        const { data } = await supabaseAdmin
            .from('users')
            .select('phone')
            .eq('id', ticket.assigned_to)
            .single();
        if (data?.phone && ticket.assignee) {
            ticket.assignee.phone = data.phone;
        }
    }

    /** Build the shared ticket body lines for WhatsApp messages */
    private static buildWhatsAppBody(ticket: any): string {
        const priorityEmoji: Record<string, string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🟢' };
        const statusEmoji: Record<string, string> = { open: '📬', assigned: '👷', in_progress: '⚙️', resolved: '✅', closed: '🔒', waitlist: '⏳', blocked: '🚫' };
        return [
            `📋 *${ticket.title}*`,
            ticket.properties?.name ? `🏢 ${ticket.properties.name}` : '',
            ticket.ticket_number ? `🎫 ${ticket.ticket_number}` : '',
            ticket.priority ? `${priorityEmoji[ticket.priority] || '⚪'} Priority: *${ticket.priority.toUpperCase()}*` : '',
            ticket.status ? `${statusEmoji[ticket.status] || '📋'} Status: *${ticket.status.replace(/_/g, ' ').toUpperCase()}*` : '',
            ticket.assignee?.full_name ? `👷 Assigned to: *${ticket.assignee.full_name}*${ticket.assignee.phone ? ` (${ticket.assignee.phone})` : ''}` : '',
            ticket.raiser?.full_name ? `👤 Raised by: *${ticket.raiser.full_name}*` : '',
        ].filter(Boolean).join('\n');
    }

    /** Extract media URL + type from a ticket row */
    private static extractMedia(ticket: any): { mediaUrl?: string; mediaType?: 'image' | 'video' } {
        const photo = ticket?.photo_before_url || ticket?.photo_after_url;
        const video = ticket?.video_before_url || ticket?.video_after_url;
        if (photo) return { mediaUrl: photo, mediaType: 'image' };
        if (video) return { mediaUrl: video, mediaType: 'video' };
        return {};
    }

    /**
     * Core send logic: DB insert + Push dispatch
     */
    static async send(payload: NotificationPayload) {
        try {
            console.log('>>>>>>>>>> [NOTIFICATION TEST] send() executing for user:', payload.userId);

            // 1. Insert into notifications table
            const { data: notification, error: notifError } = await supabaseAdmin
                .from('notifications')
                .insert({
                    user_id: payload.userId,
                    ticket_id: payload.ticketId || null,
                    booking_id: payload.bookingId || null,
                    property_id: payload.propertyId,
                    organization_id: payload.organizationId,
                    notification_type: payload.type,
                    title: payload.title,
                    message: payload.message,
                    deep_link: payload.deepLink,
                    is_read: false
                })
                .select()
                .single();

            if (notifError) {
                console.error('>>>>>>>>>> [NOTIFICATION TEST] !!! DATABASE INSERT FAILED !!!');
                console.error('>>>>>>>>>> Error Details:', JSON.stringify(notifError));
                console.error('>>>>>>>>>> Payload tried:', JSON.stringify(payload));
                return;
            }

            console.log('>>>>>>>>>> [NOTIFICATION TEST] DB Insert Success. Notification ID:', notification.id);
            console.log('>>>>>>>>>> Verification: Checking if notification exists in DB...');

            const { data: verif } = await supabaseAdmin
                .from('notifications')
                .select('id')
                .eq('id', notification.id)
                .single();

            if (verif) {
                console.log('>>>>>>>>>> [NOTIFICATION TEST] Verification CONFIRMED. Row exists.');
            } else {
                console.error('>>>>>>>>>> [NOTIFICATION TEST] Verification FAILED. Row not found immediately after insert!');
            }

            // 2. Fetch push tokens for user
            const { data: allTokens } = await supabaseAdmin
                .from('push_tokens')
                .select('token, browser, updated_at, is_active')
                .eq('user_id', payload.userId)
                .order('updated_at', { ascending: false });

            const activeTokens = allTokens?.filter(t => t.is_active) || [];
            const inactiveCount = (allTokens?.length || 0) - activeTokens.length;

            console.log(`[NotificationService] Tokens for ${payload.userId}: ${activeTokens.length} active, ${inactiveCount} inactive.`);

            if (activeTokens.length > 0) {
                const seenBrowsers = new Set<string>();
                for (const t of activeTokens) {
                    // Deduplicate by browser instance to prevent double notifications on the same device
                    // if browse is null, we treat it as unique (likely from a legacy or non-browser client)
                    if (t.browser) {
                        if (seenBrowsers.has(t.browser)) {
                            console.log(`[NotificationService] Skipping duplicate token for browser: ${t.browser.substring(0, 30)}...`);
                            continue;
                        }
                        seenBrowsers.add(t.browser);
                    }

                    await this.dispatchPushNotification(t.token, notification);
                }
            } else {
                console.log('[NotificationService] No active tokens for user, skipping push.');
            }

            // 3. Send WhatsApp — uses pre-built payload when available (no extra DB query)
            (async () => {
                try {
                    let waMessage: string;
                    let waMediaUrl: string | undefined;
                    let waMediaType: 'image' | 'video' | undefined;

                    if (payload.whatsapp) {
                        // Caller pre-built the message — use directly, zero extra DB queries
                        waMessage = payload.whatsapp.message;
                        waMediaUrl = payload.whatsapp.mediaUrl;
                        waMediaType = payload.whatsapp.mediaType;
                    } else if (payload.ticketId) {
                        // Fallback: single immediate fetch, no waiting or retrying
                        const { data: ticket } = await supabaseAdmin
                            .from('tickets')
                            .select('title, status, priority, ticket_number, photo_before_url, photo_after_url, video_before_url, video_after_url, properties(name), assignee:users!assigned_to(full_name, phone), raiser:users!raised_by(full_name)')
                            .eq('id', payload.ticketId)
                            .single();
                        if (ticket) {
                            waMessage = `*${payload.title}*\n\n${this.buildWhatsAppBody(ticket)}`;
                            ({ mediaUrl: waMediaUrl, mediaType: waMediaType } = this.extractMedia(ticket));
                        } else {
                            waMessage = payload.message;
                        }
                    } else {
                        waMessage = payload.message;
                    }

                    await WhatsAppService.sendToUser(payload.userId, {
                        message: waMessage,
                        deepLink: payload.deepLink,
                        mediaUrl: waMediaUrl,
                        mediaType: waMediaType,
                    });
                } catch (err) {
                    console.error('[NotificationService] WhatsApp dispatch error:', err);
                }
            })();

        } catch (error) {
            console.error('[NotificationService] Global send error:', error);
        }
    }

    /**
     * Dispatch to FCM
     */
    private static async dispatchPushNotification(token: string, notification: any) {
        // Log delivery attempt
        const { data: delivery } = await supabaseAdmin
            .from('notification_delivery')
            .insert({
                notification_id: notification.id,
                push_token: token,
                delivery_status: 'PENDING'
            })
            .select()
            .single();

        try {
            console.log('[FCM] Dispatching to token:', token.substring(0, 10) + '...');
            // Integrate with FCM Admin SDK
            await firebaseAdmin.messaging().send({
                token: token,
                data: {
                    title: String(notification.title || ''),
                    message: String(notification.message || ''),
                    deep_link: String(notification.deep_link || ''),
                    url: String(notification.deep_link || ''),
                    notification_id: String(notification.id || '')
                },
                android: {
                    priority: 'high',
                    notification: {
                        icon: 'stock_ticker_update',
                        color: '#2563eb',
                        sound: 'default'
                    }
                },
                webpush: {
                    headers: {
                        Urgency: 'high'
                    },
                    notification: {
                        title: `Autopilot FMS | ${notification.title}`,
                        body: notification.message,
                        icon: '/autopilot-logo.png',
                        badge: '/autopilot-logo.png',
                        requireInteraction: true,
                        tag: String(notification.id || 'autopilot-fms'),
                        renotify: true,
                        actions: [
                            {
                                action: 'view',
                                title: 'View Request'
                            }
                        ]
                    }
                }
            });

            console.log(`[FCM] Sent push successfully to ${token.substring(0, 10)}...`);

            // Mark as delivered
            if (delivery) {
                await supabaseAdmin
                    .from('notification_delivery')
                    .update({
                        delivery_status: 'DELIVERED',
                        delivered_at: new Date().toISOString()
                    })
                    .eq('id', delivery.id);
            }
        } catch (error: any) {
            // Check for stale/unregistered token FIRST before logging
            const errorCode = error?.code || error?.errorInfo?.code || '';
            const errorMessage = error?.message || '';
            const isStale =
                errorCode === 'messaging/registration-token-not-registered' ||
                errorCode === 'messaging/unregistered' ||
                errorCode === 'messaging/invalid-registration-token' ||
                errorMessage.includes('NotRegistered') ||
                errorMessage.includes('Requested entity was not found') ||
                errorMessage.includes('not a valid FCM registration token');

            if (isStale) {
                // Known case — token expired/uninstalled, not a real error
                console.warn('[FCM] Stale token detected, deactivating:', token.substring(0, 10) + '...');
                await supabaseAdmin
                    .from('push_tokens')
                    .update({ is_active: false })
                    .eq('token', token);
            } else {
                // Genuinely unexpected failure
                console.error('[FCM] Push dispatch failed:', error);
            }

            if (delivery) {
                await supabaseAdmin
                    .from('notification_delivery')
                    .update({ delivery_status: isStale ? 'STALE_TOKEN' : 'FAILED' })
                    .eq('id', delivery.id);
            }
        }
    }

    /**
     * Notify the SOP checklist completer when an admin rates one of their items.
     */
    static async afterSOPItemRated(
        completionId: string,
        _completionItemId: string,
        rating: 1 | 2 | 3,
        ratedByUserId: string
    ) {
        try {
            const RATING_LABELS: Record<number, string> = { 1: 'Needs Work', 2: 'Acceptable', 3: 'Excellent' };

            // Fetch the completion (to get who did it and the property/org info)
            const { data: completion, error: completionError } = await supabaseAdmin
                .from('sop_completions')
                .select('completed_by, property_id, organization_id, template:sop_templates(title)')
                .eq('id', completionId)
                .single();

            if (completionError || !completion) {
                console.error('[NotificationService] afterSOPItemRated: could not fetch completion', completionError);
                return;
            }

            const completedBy = String(completion.completed_by);

            // Don't notify the admin if they rated their own entry
            if (completedBy === ratedByUserId) return;

            // Fetch the admin's name
            const { data: rater } = await supabaseAdmin
                .from('users')
                .select('full_name')
                .eq('id', ratedByUserId)
                .single();

            const raterName = rater?.full_name || 'An admin';
            const templateTitle = (completion.template as any)?.title || 'SOP Checklist';
            const ratingLabel = RATING_LABELS[rating];

            await this.send({
                userId: completedBy,
                propertyId: String(completion.property_id),
                organizationId: completion.organization_id ? String(completion.organization_id) : undefined,
                type: 'SOP_RATING',
                title: `Your checklist was rated: ${ratingLabel}`,
                message: `${raterName} rated your completion of "${templateTitle}" as "${ratingLabel}".`,
                deepLink: `/properties/${completion.property_id}/sop?completion=${completionId}`,
            });
        } catch (err) {
            console.error('[NotificationService] afterSOPItemRated error:', err);
        }
    }
}
