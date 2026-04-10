/**
 * WhatsApp Welcome Message Template
 *
 * Purpose: Generates the automated welcome message sent to new users when they
 * connect their WhatsApp to the Autopilot platform.
 *
 * Why WhatsApp onboarding:
 *   - WhatsApp is a primary communication channel for tenants and staff.
 *   - Users need to know what they can do before submitting their first request.
 *   - Setting expectations upfront reduces support queries.
 *
 * What the message communicates:
 *   - Platform introduction and purpose.
 *   - Core capabilities (raise requests, attach media, receive updates).
 *   - Real-time notification behavior.
 *   - How to get started immediately.
 *
 * @param fullName — The user's first name (inserted for personalization)
 * @returns Formatted WhatsApp message string with Markdown-style bold markers
 *
 * API used: WasenderAPI — sends this message when a new user record is created
 * or when a user links their WhatsApp number for the first time.
 */

export function buildWelcomeMessage(fullName: string): string {
    return (
        `👋 *Welcome to AutoPilot, ${fullName}!*\n\n` +
        `You're now connected to the *AutoPilot Property Management* platform via WhatsApp. Here's what you can do right here in this chat:\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `✨ *WHAT YOU CAN DO*\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `📋 *Raise a Request*\n` +
        `Just send us a message describing your issue — our system will automatically create a ticket and assign it to the right team.\n\n` +
        `📸 *Attach Photos or Videos*\n` +
        `Send images or videos along with your message for faster resolution.\n\n` +
        `🔔 *Real-Time Notifications*\n` +
        `Get instant WhatsApp alerts when your ticket is assigned, work starts, or it's completed.\n\n` +
        `✅ *Approve Completed Work*\n` +
        `We'll notify you when work is done. Simply confirm to close the ticket.\n\n` +
        `📊 *Stay Updated*\n` +
        `Receive daily summaries and important property updates directly here.\n\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `To get started, just type your request and send it — our team is ready! 🚀\n\n` +
        `_AutoPilot Property Management_`
    )
}
