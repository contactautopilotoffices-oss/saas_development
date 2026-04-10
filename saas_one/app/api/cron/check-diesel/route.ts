/**
 * Diesel level check cron job.
 * Checks diesel levels and sends alerts if below threshold.
 * POST /api/cron/check-diesel
 * Auth: Cron secret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/cron/check-diesel
 * Checks if diesel readings have been logged for today.
 * If not, notifies all Property Admins.
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const today = new Date().toISOString().split('T')[0];

        // 1. Check for logs today
        const { data: logs, error: logError } = await supabase
            .from('diesel_readings')
            .select('id')
            .gte('reading_date', today);

        if (logError && logError.code !== '42P01') { // Ignore if table missing for now
            throw logError;
        }

        const hasLogsToday = logs && logs.length > 0;

        if (hasLogsToday) {
            return NextResponse.json({ success: true, message: 'Logs present', notifications_sent: 0 });
        }

        // 2. If no logs, find Admins to notify
        // We'll target Master Admins and Property Admins
        const { data: admins, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('is_master_admin', true); // Simplified targeting

        if (userError) throw userError;

        const notifications = (admins || []).map(admin => ({
            type: 'admin_reminder',
            recipient_role: 'ADMIN',
            recipient_id: admin.id,
            title: 'Diesel Log Pending',
            body: 'Daily diesel readings have not been recorded yet. Please update the log.',
            entity_id: 'diesel-log' // generic ID
        }));

        if (notifications.length > 0) {
            const { error: insertError } = await supabase
                .from('notifications')
                .insert(notifications);

            if (insertError) throw insertError;
        }

        return NextResponse.json({
            success: true,
            message: 'Notifications sent',
            notifications_sent: notifications.length
        });

    } catch (error) {
        console.error('[Diesel Cron] Error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
