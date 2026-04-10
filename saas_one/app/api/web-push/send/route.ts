/**
 * Web push send API.
 * POST: Send push notification to a user.
 * Auth: Master Admin.
 */

import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || '';
const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:test@example.com';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(
        vapidSubject,
        vapidPublicKey,
        vapidPrivateKey
    );
}

export async function POST(req: Request) {
    try {
        if (!vapidPublicKey || !vapidPrivateKey) {
            return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });
        }

        const { title, body, url } = await req.json();

        // Fetch all stored subscriptions
        const { data: subs, error } = await supabase
            .from('push_subscriptions')
            .select('subscription');

        if (error || !subs) {
            return NextResponse.json({ error: 'Could not fetch subscriptions' }, { status: 500 });
        }

        const payload = JSON.stringify({
            title: title || 'New Autopilot Update!',
            body: body || 'You have a new message',
            url: url || '/'
        });

        const sendPromises = subs.map((subItem) => {
            const pushSubscription = subItem.subscription;
            return webpush.sendNotification(pushSubscription, payload).catch((err) => {
                console.error('Error sending notification, perhaps expired:', err);
                // Optionally delete expired subscriptions here
            });
        });

        await Promise.allSettled(sendPromises);

        return NextResponse.json({ success: true, sentCount: sendPromises.length });
    } catch (error) {
        console.error('Error sending push:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
