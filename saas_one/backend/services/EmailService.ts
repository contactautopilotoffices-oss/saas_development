/**
 * Email Service — Nodemailer SMTP Integration
 *
 * Purpose: Sends transactional emails via SMTP (e.g., Gmail SMTP, SendGrid SMTP,
 * Resend, etc.). Currently used for material request notifications to procurement staff.
 *
 * Why SMTP vs. API-based email:
 *   - SMTP is universally supported and easy to configure with any email provider.
 *   - Works well for low-to-medium volume transactional emails.
 *   - No per-email API cost when using Gmail or self-hosted SMTP.
 *
 * Environment variables:
 *   SMTP_HOST   — SMTP server hostname (e.g., smtp.gmail.com)
 *   SMTP_PORT   — SMTP port (default: 465 for SSL, 587 for TLS)
 *   SMTP_SECURE — 'true' for SSL (port 465), 'false' for STARTTLS (port 587)
 *   SMTP_USER   — SMTP username (usually the sender email address)
 *   SMTP_PASS   — SMTP password or app-specific password
 *   SMTP_SENDER_EMAIL — Optional: different from SMTP_USER for the "From" address
 *
 * Note: Gmail requires an "App Password" (not your regular password) for SMTP.
 */

import nodemailer from 'nodemailer'

// Configure Nodemailer transporter with SMTP settings from environment variables
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
})

export const EmailService = {
    /**
     * Send a material request notification email to the procurement team.
     *
     * What it communicates:
     *   - A staff/tenant member has requested specific materials/supplies.
     *   - The request is linked to a specific ticket and property.
     *   - Lists all requested items with quantities and notes.
     *
     * When triggered:
     *   Called from the procurement API when a user submits a material request
     *   on a ticket (via the materials endpoint in /api/tickets/[id]/materials).
     *
     * Email format:
     *   - Subject: "Material Request for Ticket #<number>"
     *   - Body: HTML formatted with ticket details and item list
     *
     * @returns true if email was sent successfully, false otherwise
     */
    async sendMaterialRequestEmail({
        emailTo,
        ticket,
        property,
        requestedBy,
        requesterRole,
        items
    }: {
        emailTo: string
        ticket: any
        property: any
        requestedBy: any
        requesterRole?: string
        items: any[]
    }): Promise<boolean> {
        // Skip if SMTP credentials are not configured (dev environments)
        if (!process.env.SMTP_USER) {
            console.warn('[EmailService] SMTP credentials not found, skipping email send.')
            return false
        }

        const subject = `Material Request for Ticket #${ticket.ticket_number}`

        // Build HTML list of requested items
        const itemsHtml = items.map(
            img => `<li><b>${img.name}</b> — Qty: ${img.quantity} ${img.notes ? `(Notes: ${img.notes})` : ''}</li>`
        ).join('')

        const html = `
            <h2>Material Request</h2>
            <p>You have been tagged in a new material request for a ticket.</p>

            <h3>Ticket Details</h3>
            <ul>
                <li><b>Ticket:</b> ${ticket.ticket_number} — ${ticket.title}</li>
                <li><b>Property:</b> ${property?.name || 'N/A'}</li>
                <li><b>Requested By:</b> ${requestedBy?.full_name || requestedBy?.email || 'System'} (${requesterRole?.toUpperCase() || 'Support'})</li>
            </ul>

            <h3>Requested Materials</h3>
            <ul>
                ${itemsHtml}
            </ul>

            <p>Please check the Procurement Dashboard to fulfill this request.</p>
        `

        try {
            await transporter.sendMail({
                from: `"Autopilot Support" <${process.env.SMTP_SENDER_EMAIL || process.env.SMTP_USER}>`,
                to: emailTo,
                subject,
                html,
            })
            console.log(`[EmailService] Material request email sent to ${emailTo}`)
            return true
        } catch (error) {
            console.error('[EmailService] Failed to send material request email:', error)
            return false
        }
    }
}
