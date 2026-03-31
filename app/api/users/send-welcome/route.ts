import { NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { WhatsAppService } from '@/backend/services/WhatsAppService';
import { buildWelcomeMessage } from '@/backend/lib/whatsapp/welcomeMessage';

/**
 * POST /api/users/send-welcome
 * Sends the welcome WhatsApp message to the currently authenticated user.
 * Called after a user sets their phone number for the first time.
 */
export async function POST() {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
        .from('users')
        .select('full_name, phone')
        .eq('id', user.id)
        .single();

    if (!profile?.phone) {
        return NextResponse.json({ error: 'No phone number on file' }, { status: 400 });
    }

    WhatsAppService.send(profile.phone, {
        message: buildWelcomeMessage(profile.full_name || 'there'),
    });

    return NextResponse.json({ success: true });
}
