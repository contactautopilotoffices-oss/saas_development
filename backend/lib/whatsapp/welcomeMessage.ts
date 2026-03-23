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
    );
}
