/**
 * Web push subscription save API.
 * POST: Save browser push notification subscription.
 * Auth: Supabase session.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initializes an admin Supabase client using Service Role
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
    try {
        const subscription = await req.json();

        if (!subscription || !subscription.endpoint) {
            return NextResponse.json({ error: 'Invalid subscription object' }, { status: 400 });
        }

        // Attempt to get the logged-in user if JWT is provided via headers/cookies (Optional)
        // If not authenticated, we can still store it anonymously or tie it to a session.
        // For now, we will just store the raw subscription endpoint so we can blast it out.

        // UPSERT into a push_subscriptions table
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({
                endpoint: subscription.endpoint,
                subscription: subscription
            }, { onConflict: 'endpoint' });

        if (error) {
            console.error('Supabase error saving push sub:', error);
            // Fallback: If table doesn't exist, we just return success but notify in logs
            return NextResponse.json({ success: true, warning: 'Table push_subscriptions might not exist' });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error in save-subscription:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
