import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { WhatsAppService } from '@/backend/services/WhatsAppService';
import { buildWelcomeMessage } from '@/backend/lib/whatsapp/welcomeMessage';

/**
 * POST /api/admin/whatsapp/send-welcome-all
 * Master-admin only. Sends the welcome/onboarding WhatsApp message to ALL users in the DB.
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Master admin only
    const { data: profile } = await supabaseAdmin
        .from('users')
        .select('is_master_admin')
        .eq('id', user.id)
        .single();

    if (!profile?.is_master_admin) {
        return NextResponse.json({ error: 'Forbidden — master admin only' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const customMessage: string | undefined = body.message;

    // Fetch all users with a phone number
    const { data: users, error: usersErr } = await supabaseAdmin
        .from('users')
        .select('id, full_name, phone')
        .not('phone', 'is', null);

    if (usersErr) {
        return NextResponse.json({ error: usersErr.message }, { status: 500 });
    }

    const allUsers = (users || []).filter(u => u.phone);
    if (allUsers.length === 0) {
        return NextResponse.json({ sent: 0, skipped: 0, message: 'No users with phone numbers found' });
    }

    let sent = 0;
    let skipped = 0;

    for (const u of allUsers) {
        try {
            const name = u.full_name || 'there';
            const message = customMessage
                ? customMessage.replace(/\{\{full_name\}\}/g, name)
                : buildWelcomeMessage(name);

            WhatsAppService.send(u.phone, { message });
            sent++;
        } catch {
            skipped++;
        }
    }

    return NextResponse.json({ sent, skipped, total: allUsers.length });
}

