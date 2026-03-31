import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { WhatsAppQueueService } from '@/backend/services/WhatsAppQueueService';

/**
 * GET /api/cron/ppm-reminders
 * Runs daily at 9:00 AM IST (03:30 UTC).
 * Finds all PPM tasks planned exactly 3 days from today (still pending)
 * and sends a WhatsApp reminder to property admins + org super admins.
 */
export async function GET(request: NextRequest) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Target date = today + 3 days (IST)
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const target = new Date(now);
    target.setDate(target.getDate() + 3);
    const targetDate = target.toISOString().split('T')[0]; // YYYY-MM-DD

    const dateLabel = target.toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        weekday: 'long',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });

    // Fetch all pending PPM tasks due in 3 days
    const { data: tasks, error } = await supabaseAdmin
        .from('ppm_schedules')
        .select('id, organization_id, property_id, system_name, detail_name, scope_of_work, vendor_name, location, frequency, planned_date')
        .eq('planned_date', targetDate)
        .eq('status', 'pending');

    if (error) {
        console.error('[PPM Cron] Fetch error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!tasks || tasks.length === 0) {
        return NextResponse.json({ message: 'No PPM tasks due in 3 days', date: targetDate });
    }

    // Group tasks by organization
    const byOrg: Record<string, typeof tasks> = {};
    for (const t of tasks) {
        const key = t.organization_id;
        if (!byOrg[key]) byOrg[key] = [];
        byOrg[key].push(t);
    }

    let totalSent = 0;

    for (const [orgId, orgTasks] of Object.entries(byOrg)) {
        // Collect recipients: org_super_admins + property_admins for affected properties
        const affectedPropertyIds = [...new Set(orgTasks.map(t => t.property_id).filter(Boolean))];

        const recipientIds = new Set<string>();

        // Org super admins
        const { data: orgAdmins } = await supabaseAdmin
            .from('organization_memberships')
            .select('user_id')
            .eq('organization_id', orgId)
            .in('role', ['org_super_admin', 'owner', 'admin', 'org_admin'])
            .neq('is_active', false);
        (orgAdmins || []).forEach(m => recipientIds.add(m.user_id));

        // Property admins for affected properties
        if (affectedPropertyIds.length > 0) {
            const { data: propAdmins } = await supabaseAdmin
                .from('property_memberships')
                .select('user_id')
                .in('property_id', affectedPropertyIds)
                .eq('role', 'property_admin')
                .eq('is_active', true);
            (propAdmins || []).forEach(m => recipientIds.add(m.user_id));
        }

        if (recipientIds.size === 0) continue;

        // Group tasks by property for cleaner message
        const byProperty: Record<string, typeof tasks> = {};
        for (const t of orgTasks) {
            const key = t.property_id || 'org';
            if (!byProperty[key]) byProperty[key] = [];
            byProperty[key].push(t);
        }

        // Build message
        const lines: string[] = [
            `🔧 *PPM Reminder — Tasks Due in 3 Days*`,
            `📅 *${dateLabel}*`,
            ``,
        ];

        for (const [, propTasks] of Object.entries(byProperty)) {
            for (const t of propTasks) {
                lines.push(`▪️ *${t.system_name}*${t.detail_name ? ` — ${t.detail_name}` : ''}`);
                if (t.scope_of_work) lines.push(`  📋 ${t.scope_of_work}`);
                if (t.vendor_name) lines.push(`  🏭 Vendor: ${t.vendor_name}`);
                if (t.location) lines.push(`  📍 ${t.location}`);
                lines.push('');
            }
        }

        lines.push(`Please ensure vendors and staff are notified in advance.`);
        const message = lines.join('\n');

        await WhatsAppQueueService.enqueue({
            userIds: [...recipientIds],
            message,
            eventType: 'PPM_REMINDER',
        });

        totalSent += recipientIds.size;
    }

    return NextResponse.json({
        success: true,
        targetDate,
        tasksFound: tasks.length,
        recipientsSent: totalSent,
    });
}
