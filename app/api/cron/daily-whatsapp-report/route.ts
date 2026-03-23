import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { WhatsAppService } from '@/backend/services/WhatsAppService';

/**
 * GET /api/cron/daily-whatsapp-report
 * Runs daily at 12:00 AM IST (18:30 UTC previous day).
 * Sends open-ticket summary to all org_super_admin users of every active organization.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all organizations
    const { data: orgs, error: orgsErr } = await supabaseAdmin
        .from('organizations')
        .select('id, name');

    if (orgsErr) {
        return NextResponse.json({ error: orgsErr.message }, { status: 500 });
    }

    const ACTIVE_STATUSES = ['open', 'waitlist', 'assigned', 'in_progress', 'paused', 'blocked'];
    const SUPER_ROLES = ['org_super_admin', 'owner', 'admin', 'org_admin'];
    const results: { orgId: string; orgName: string; recipients: number; sent: boolean; error?: string }[] = [];

    const now = new Date();
    const dateLabel = now.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
    const timeLabel = now.toLocaleTimeString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });

    for (const org of orgs || []) {
        try {
            // Fetch properties
            const { data: properties } = await supabaseAdmin
                .from('properties')
                .select('id, name')
                .eq('organization_id', org.id);

            const { data: tickets } = await supabaseAdmin
                .from('tickets')
                .select('id, status, priority, assigned_to, property_id')
                .eq('organization_id', org.id)
                .not('status', 'in', '(resolved,closed)');

            const allTickets = tickets || [];
            const activeTickets = allTickets.filter(t => ACTIVE_STATUSES.includes((t as any).status ?? ''));
            const pendingValidation = allTickets.filter(t => (t as any).status === 'pending_validation');

            // Skip org if nothing to report
            if (allTickets.length === 0) {
                results.push({ orgId: org.id, orgName: org.name, recipients: 0, sent: false });
                continue;
            }

            // Aggregate per property_id
            const priorityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
            const propertyActive: Record<string, number> = {};
            const propertyPending: Record<string, number> = {};
            let unassignedCount = 0;

            for (const t of activeTickets) {
                const p = ((t as any).priority || 'medium').toLowerCase();
                if (p in priorityCounts) priorityCounts[p]++;
                const pid = (t as any).property_id || 'unknown';
                propertyActive[pid] = (propertyActive[pid] || 0) + 1;
                if (!(t as any).assigned_to) unassignedCount++;
            }
            for (const t of pendingValidation) {
                const pid = (t as any).property_id || 'unknown';
                propertyPending[pid] = (propertyPending[pid] || 0) + 1;
            }

            // Build property lines (all properties, sorted by total desc)
            const sortedProperties = (properties || []).sort((a: any, b: any) => {
                const totalA = (propertyActive[a.id] || 0) + (propertyPending[a.id] || 0);
                const totalB = (propertyActive[b.id] || 0) + (propertyPending[b.id] || 0);
                return totalB - totalA;
            });

            const propertyLines = sortedProperties
                .map((prop: any) => {
                    const active = propertyActive[prop.id] || 0;
                    const pending = propertyPending[prop.id] || 0;
                    const parts: string[] = [];
                    if (active > 0) parts.push(`${active} open`);
                    if (pending > 0) parts.push(`${pending} awaiting sign-off`);
                    const detail = parts.length > 0 ? parts.join(' | ') : 'No open tickets';
                    return `• ${prop.name}  →  ${detail}`;
                })
                .join('\n');

            const message =
                `🏢 *${org.name} — Ticket Report*\n` +
                `📅 ${dateLabel} | ${timeLabel}\n\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `📊 *OPEN TICKETS SUMMARY*\n` +
                `━━━━━━━━━━━━━━━━━━\n\n` +
                `🔴 Critical    →  ${priorityCounts.critical}\n` +
                `🟠 High        →  ${priorityCounts.high}\n` +
                `🟡 Medium      →  ${priorityCounts.medium}\n` +
                `🟢 Low         →  ${priorityCounts.low}\n\n` +
                `📌 *Active Open:* ${activeTickets.length}\n` +
                `✅ *Awaiting Tenant Sign-off:* ${pendingValidation.length}\n` +
                `👤 *Unassigned:* ${unassignedCount}\n\n` +
                (propertyLines
                    ? `━━━━━━━━━━━━━━━━━━\n🏠 *BY PROPERTY*\n━━━━━━━━━━━━━━━━━━\n${propertyLines}\n\n`
                    : '') +
                `_Sent from AutoPilot Property Management_`;

            const deepLink = `/dashboard?tab=requests&org=${org.id}`;

            // Find super admin recipients
            const { data: admins } = await supabaseAdmin
                .from('organization_memberships')
                .select('user_id, role')
                .eq('organization_id', org.id)
                .or('is_active.eq.true,is_active.is.null');

            const recipientIds = (admins || [])
                .filter(a => SUPER_ROLES.includes((a.role ?? '').toLowerCase()))
                .map(a => a.user_id);

            if (recipientIds.length === 0) {
                results.push({ orgId: org.id, orgName: org.name, recipients: 0, sent: false });
                continue;
            }

            await WhatsAppService.sendToUsers(recipientIds, { message, deepLink });
            results.push({ orgId: org.id, orgName: org.name, recipients: recipientIds.length, sent: true });

        } catch (err: any) {
            results.push({ orgId: org.id, orgName: org.name, recipients: 0, sent: false, error: err.message });
        }
    }

    return NextResponse.json({ success: true, results });
}
