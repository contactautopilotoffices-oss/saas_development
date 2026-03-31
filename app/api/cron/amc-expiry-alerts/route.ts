import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { WhatsAppQueueService } from '@/backend/services/WhatsAppQueueService';

/**
 * GET /api/cron/amc-expiry-alerts
 * Checks for AMC contracts expiring in 30, 15, or 7 days and sends WhatsApp alerts.
 * Auth: Bearer CRON_SECRET
 */
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Get today's date in IST
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        nowIST.setHours(0, 0, 0, 0);

        const ALERT_DAYS = [30, 15, 7];
        let totalAlerts = 0;

        for (const days of ALERT_DAYS) {
            const targetDate = new Date(nowIST);
            targetDate.setDate(targetDate.getDate() + days);
            const targetDateStr = targetDate.toISOString().split('T')[0];

            const { data: contracts, error } = await supabaseAdmin
                .from('amc_contracts')
                .select('*')
                .eq('contract_end_date', targetDateStr)
                .not('status', 'in', '("expired","renewed")');

            if (error) {
                console.error(`[AMC Cron] Error fetching contracts for ${days}d alert:`, error.message);
                continue;
            }

            for (const contract of (contracts || [])) {
                const recipientIds = new Set<string>();

                // Org admins
                const { data: orgAdmins } = await supabaseAdmin
                    .from('organization_memberships')
                    .select('user_id')
                    .eq('organization_id', contract.organization_id)
                    .in('role', ['org_super_admin', 'owner', 'admin', 'org_admin'])
                    .neq('is_active', false);
                (orgAdmins || []).forEach((m: { user_id: string }) => recipientIds.add(m.user_id));

                // Property admins
                if (contract.property_id) {
                    const { data: propAdmins } = await supabaseAdmin
                        .from('property_memberships')
                        .select('user_id')
                        .eq('property_id', contract.property_id)
                        .eq('role', 'property_admin')
                        .eq('is_active', true);
                    (propAdmins || []).forEach((m: { user_id: string }) => recipientIds.add(m.user_id));
                }

                if (recipientIds.size === 0) continue;

                const expiryLabel = new Date(contract.contract_end_date + 'T12:00:00').toLocaleDateString('en-IN', {
                    day: '2-digit', month: 'short', year: 'numeric',
                });

                const lines = [
                    `⚠️ *AMC Contract Expiring Soon*`,
                    ``,
                    `📋 *${contract.system_name}*`,
                    `🏭 Vendor: ${contract.vendor_name}`,
                    `📅 Expiry: ${expiryLabel}`,
                    `⏰ Expires in: ${days} days`,
                    contract.scope_of_work ? contract.scope_of_work : '',
                    ``,
                    `Please initiate renewal or replacement before expiry.`,
                ].filter(l => l !== undefined && (l !== '' || l === '')).join('\n');

                await WhatsAppQueueService.enqueue({
                    ticketId: '',
                    userIds: [...recipientIds],
                    message: lines,
                    eventType: 'AMC_EXPIRY_ALERT',
                });

                totalAlerts++;
            }
        }

        console.log(`[AMC Cron] Sent ${totalAlerts} expiry alerts`);
        return NextResponse.json({ success: true, alerts_sent: totalAlerts });
    } catch (err) {
        console.error('[AMC Cron] Error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
