/**
 * Send WhatsApp summary report API.
 * POST: Trigger WhatsApp summary report for a property.
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { WhatsAppService } from '@/backend/services/WhatsAppService';

/**
 * POST /api/reports/send-whatsapp-summary
 * Sends a formatted open-tickets summary to all org_super_admin users of an org via WhatsApp.
 * Body: { organizationId: string, propertyId?: string }
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { organizationId, propertyId } = body;

    if (!organizationId) {
        return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
    }

    // Only org_super_admin / master_admin may trigger this
    const { data: membership } = await supabaseAdmin
        .from('organization_memberships')
        .select('role')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .or('is_active.eq.true,is_active.is.null')
        .maybeSingle();

    const { data: isMasterAdmin } = await supabaseAdmin
        .from('users')
        .select('is_master_admin')
        .eq('id', user.id)
        .single();

    const memberRole = membership?.role?.toLowerCase() ?? '';
    const allowed =
        isMasterAdmin?.is_master_admin === true ||
        memberRole === 'org_super_admin' ||
        memberRole === 'owner' ||
        memberRole === 'admin' ||
        memberRole === 'org_admin';

    if (!allowed) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // ── 1. Fetch org name + all properties ──────────────────────────────────
    const [{ data: org }, { data: allProperties }] = await Promise.all([
        supabaseAdmin.from('organizations').select('name').eq('id', organizationId).single(),
        supabaseAdmin.from('properties').select('id, name').eq('organization_id', organizationId),
    ]);

    // ── 2. Fetch all non-closed tickets for this org ──────────────────────────
    let ticketQuery = supabaseAdmin
        .from('tickets')
        .select('id, status, priority, assigned_to, property_id')
        .eq('organization_id', organizationId)
        .not('status', 'in', '(resolved,closed)');

    if (propertyId) ticketQuery = ticketQuery.eq('property_id', propertyId);

    const { data: tickets, error: ticketsErr } = await ticketQuery;
    if (ticketsErr) {
        return NextResponse.json({ error: ticketsErr.message }, { status: 500 });
    }

    const allTickets = tickets || [];

    // Split: active (our side) vs awaiting tenant sign-off
    const ACTIVE_STATUSES = ['open', 'waitlist', 'assigned', 'in_progress', 'paused', 'blocked'];
    const activeTickets = allTickets.filter(t => ACTIVE_STATUSES.includes(t.status ?? ''));
    const pendingValidation = allTickets.filter(t => t.status === 'pending_validation');

    // ── 3. Aggregate stats — keyed by property_id (reliable, no join needed) ──
    const priorityCounts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const propertyActive: Record<string, number> = {};   // property_id → count
    const propertyPending: Record<string, number> = {};  // property_id → count
    let unassignedCount = 0;

    for (const t of activeTickets) {
        const p = (t.priority || 'medium').toLowerCase();
        if (p in priorityCounts) priorityCounts[p]++;
        const pid = (t as any).property_id || 'unknown';
        propertyActive[pid] = (propertyActive[pid] || 0) + 1;
        if (!t.assigned_to) unassignedCount++;
    }

    for (const t of pendingValidation) {
        const pid = (t as any).property_id || 'unknown';
        propertyPending[pid] = (propertyPending[pid] || 0) + 1;
    }

    // ── 4. Format WhatsApp message ───────────────────────────────────────────
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

    // Show ALL properties, sorted by total tickets descending
    const sortedProperties = (allProperties || []).sort((a: any, b: any) => {
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
        `🏢 *${org?.name ?? 'Organisation'} — Ticket Report*\n` +
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

    const deepLink = `/dashboard?tab=requests&org=${organizationId}`;

    // ── 5. Resolve org_super_admin recipients ────────────────────────────────
    const { data: admins } = await supabaseAdmin
        .from('organization_memberships')
        .select('user_id, role')
        .eq('organization_id', organizationId)
        .or('is_active.eq.true,is_active.is.null');

    const SUPER_ROLES = ['org_super_admin', 'owner', 'admin', 'org_admin'];
    const filteredAdmins = (admins || []).filter(a =>
        SUPER_ROLES.includes((a.role ?? '').toLowerCase())
    );

    const recipientIds = filteredAdmins.map(a => a.user_id);
    if (recipientIds.length === 0) {
        return NextResponse.json({ error: 'No org super admins found to notify' }, { status: 404 });
    }

    // ── 6. Send WhatsApp to all recipients ──────────────────────────────────
    await WhatsAppService.sendToUsers(recipientIds, { message, deepLink });

    return NextResponse.json({
        success: true,
        recipients: recipientIds.length,
        active_tickets: activeTickets.length,
        pending_validation: pendingValidation.length,
    });
}
