/**
 * Firebase Admin SDK Initialization
 *
 * Purpose: Initialize Firebase Admin for server-side operations.
 * Used for sending Web Push notifications to browsers (FCM — Firebase Cloud Messaging).
 *
 * Why Firebase Admin (vs. client SDK):
 *   - Client SDKs (used in browsers) cannot send push notifications — they can only receive.
 *   - The server needs elevated permissions to send messages via FCM.
 *   - Firebase Admin SDK provides those server credentials and APIs.
 *
 * What this enables:
 *   - Sending push notifications to subscribed browsers when tickets are created/updated.
 *   - Works even when the user has closed the browser tab (via Service Worker).
 *
 * Environment variables required:
 *   FIREBASE_PROJECT_ID     — Your Firebase project identifier
 *   FIREBASE_CLIENT_EMAIL    — Service account email address
 *   FIREBASE_PRIVATE_KEY     — RSA private key (stored as env var, newlines escaped as \\n)
 *
 * Note: The old client SDK imports are commented out — Firebase client-side auth
 * is handled by Supabase Auth instead of Firebase Auth in this application.
 */

import * as admin from 'firebase-admin'

/**
 * Initialize the Firebase Admin app (singleton pattern).
 *
 * What it does:
 *   - Checks if Firebase is already initialized to avoid "default app already exists" errors.
 *   - Initializes with Service Account credentials from environment variables.
 *   - Logs success/failure to console for deployment visibility.
 *
 * Why singleton: Firebase doesn't allow multiple initializeApp() calls with the
 * same project. The `!admin.apps.length` check prevents re-initialization.
 */
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // The private key contains newlines; env vars escape them as \\n
                // Replace them back to actual newlines so the cert parser accepts it
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            }),
        })
        console.log('[Firebase Admin] Initialized successfully')
    } catch (error) {
        // Log but don't throw — Firebase is optional (notifications degrade gracefully)
        console.error('[Firebase Admin] Initialization error:', error)
    }
}

// Export the initialized Firebase Admin instance for use in NotificationService
export const firebaseAdmin = admin
