'use client';

import { useState } from 'react';
import {
    MessageCircle, Plus, Edit2, Trash2, Eye, X, Save,
    CheckCircle2, AlertCircle, Zap, Copy, Search, Loader2, Users
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type TemplateCategory = 'report' | 'ticket' | 'sop' | 'booking' | 'system';

interface WhatsAppTemplate {
    id: string;
    name: string;
    category: TemplateCategory;
    description: string;
    trigger: string;
    recipients: string;
    body: string;
    variables: string[];   // e.g. ["{{org_name}}", "{{date}}"]
    source: string;        // file path this originates from
    isSystem: boolean;     // system templates can't be deleted
}

// ─── Default Templates (mirrors current codebase) ────────────────────────────

const DEFAULT_TEMPLATES: WhatsAppTemplate[] = [
    {
        id: 'welcome',
        name: 'Welcome / Onboarding Message',
        category: 'system',
        description: 'Sent automatically when a new user is created, and can be broadcast to all users via the "Send to All" button.',
        trigger: 'Auto — new user created | Manual — "Send Welcome to All Users" button',
        recipients: 'The newly created user (auto) or all users with a phone number (manual)',
        variables: ['{{full_name}}'],
        source: 'app/api/admin/whatsapp/send-welcome-all/route.ts',
        isSystem: true,
        body:
`👋 *Welcome to AutoPilot, {{full_name}}!*

You're now connected to the *AutoPilot Property Management* platform via WhatsApp. Here's what you can do right here in this chat:

━━━━━━━━━━━━━━━━━━
✨ *WHAT YOU CAN DO*
━━━━━━━━━━━━━━━━━━

📋 *Raise a Request*
Just send us a message describing your issue — our system will automatically create a ticket and assign it to the right team.

📸 *Attach Photos or Videos*
Send images or videos along with your message for faster resolution.

🔔 *Real-Time Notifications*
Get instant WhatsApp alerts when your ticket is assigned, work starts, or it's completed.

✅ *Approve Completed Work*
We'll notify you when work is done. Simply confirm to close the ticket.

📊 *Stay Updated*
Receive daily summaries and important property updates directly here.

━━━━━━━━━━━━━━━━━━

To get started, just type your request and send it — our team is ready! 🚀

_AutoPilot Property Management_`,
    },
    {
        id: 'daily-report',
        name: 'Daily Ticket Report',
        category: 'report',
        description: 'Daily summary of open tickets sent automatically every night at 12:00 AM IST.',
        trigger: 'Cron — every day at 12:00 AM IST',
        recipients: 'All org_super_admin / owner / admin of every organization',
        variables: ['{{org_name}}', '{{date}}', '{{time}}', '{{critical}}', '{{high}}', '{{medium}}', '{{low}}', '{{active_open}}', '{{awaiting_signoff}}', '{{unassigned}}', '{{property_lines}}'],
        source: 'app/api/cron/daily-whatsapp-report/route.ts',
        isSystem: true,
        body:
`🏢 *{{org_name}} — Ticket Report*
📅 {{date}} | {{time}}

━━━━━━━━━━━━━━━━━━
📊 *OPEN TICKETS SUMMARY*
━━━━━━━━━━━━━━━━━━

🔴 Critical    →  {{critical}}
🟠 High        →  {{high}}
🟡 Medium      →  {{medium}}
🟢 Low         →  {{low}}

📌 *Active Open:* {{active_open}}
✅ *Awaiting Tenant Sign-off:* {{awaiting_signoff}}
👤 *Unassigned:* {{unassigned}}

━━━━━━━━━━━━━━━━━━
🏠 *BY PROPERTY*
━━━━━━━━━━━━━━━━━━
{{property_lines}}

_Sent from AutoPilot Property Management_`,
    },
    {
        id: 'on-demand-report',
        name: 'On-Demand Ticket Report',
        category: 'report',
        description: 'Same as Daily Report but triggered manually by clicking "Send Report on WhatsApp" button.',
        trigger: 'Manual — "Send Report on WhatsApp" button in Reports tab',
        recipients: 'All org_super_admin / owner / admin of the selected organization',
        variables: ['{{org_name}}', '{{date}}', '{{time}}', '{{critical}}', '{{high}}', '{{medium}}', '{{low}}', '{{active_open}}', '{{awaiting_signoff}}', '{{unassigned}}', '{{property_lines}}'],
        source: 'app/api/reports/send-whatsapp-summary/route.ts',
        isSystem: true,
        body:
`🏢 *{{org_name}} — Ticket Report*
📅 {{date}} | {{time}}

━━━━━━━━━━━━━━━━━━
📊 *OPEN TICKETS SUMMARY*
━━━━━━━━━━━━━━━━━━

🔴 Critical    →  {{critical}}
🟠 High        →  {{high}}
🟡 Medium      →  {{medium}}
🟢 Low         →  {{low}}

📌 *Active Open:* {{active_open}}
✅ *Awaiting Tenant Sign-off:* {{awaiting_signoff}}
👤 *Unassigned:* {{unassigned}}

━━━━━━━━━━━━━━━━━━
🏠 *BY PROPERTY*
━━━━━━━━━━━━━━━━━━
{{property_lines}}

_Sent from AutoPilot Property Management_`,
    },
    {
        id: 'ticket-created-assigned',
        name: 'Ticket Created & Assigned',
        category: 'ticket',
        description: 'Sent when a new ticket is created and assigned to an MST.',
        trigger: 'Automatic — ticket creation',
        recipients: 'Assignee + ticket raiser + property admin',
        variables: ['{{ticket_title}}', '{{property_name}}', '{{ticket_number}}', '{{priority_emoji}}', '{{priority}}', '{{status_emoji}}', '{{status}}', '{{assignee_name}}', '{{assignee_phone}}', '{{raiser_name}}'],
        source: 'backend/services/NotificationService.ts',
        isSystem: true,
        body:
`*New Ticket Created & Assigned*

📋 *{{ticket_title}}*
🏢 {{property_name}}
🎫 {{ticket_number}}
{{priority_emoji}} Priority: *{{PRIORITY}}*
{{status_emoji}} Status: *{{STATUS}}*
👷 Assigned to: *{{assignee_name}}* ({{assignee_phone}})
👤 Raised by: *{{raiser_name}}*`,
    },
    {
        id: 'ticket-reassigned',
        name: 'Ticket Reassigned',
        category: 'ticket',
        description: 'Sent when a ticket is manually reassigned to a different MST.',
        trigger: 'Automatic — ticket reassignment',
        recipients: 'New assignee + ticket raiser + property admin',
        variables: ['{{ticket_title}}', '{{property_name}}', '{{ticket_number}}', '{{priority_emoji}}', '{{priority}}', '{{status_emoji}}', '{{status}}', '{{assignee_name}}', '{{assignee_phone}}', '{{raiser_name}}'],
        source: 'backend/services/NotificationService.ts',
        isSystem: true,
        body:
`*Ticket Reassigned to You*

📋 *{{ticket_title}}*
🏢 {{property_name}}
🎫 {{ticket_number}}
{{priority_emoji}} Priority: *{{PRIORITY}}*
{{status_emoji}} Status: *{{STATUS}}*
👷 Assigned to: *{{assignee_name}}* ({{assignee_phone}})
👤 Raised by: *{{raiser_name}}*`,
    },
    {
        id: 'ticket-completed',
        name: 'Ticket Completed',
        category: 'ticket',
        description: 'Sent when an MST marks a ticket as completed (pending tenant validation).',
        trigger: 'Automatic — ticket status → pending_validation',
        recipients: 'Ticket raiser + property admin + org super admin',
        variables: ['{{ticket_title}}', '{{property_name}}', '{{ticket_number}}', '{{priority_emoji}}', '{{priority}}', '{{status_emoji}}', '{{status}}', '{{assignee_name}}', '{{assignee_phone}}', '{{raiser_name}}'],
        source: 'backend/services/NotificationService.ts',
        isSystem: true,
        body:
`*Ticket Completed ✅*

📋 *{{ticket_title}}*
🏢 {{property_name}}
🎫 {{ticket_number}}
{{priority_emoji}} Priority: *{{PRIORITY}}*
{{status_emoji}} Status: *{{STATUS}}*
👷 Assigned to: *{{assignee_name}}* ({{assignee_phone}})
👤 Raised by: *{{raiser_name}}*`,
    },
    {
        id: 'ticket-waitlisted',
        name: 'Ticket Waitlisted',
        category: 'ticket',
        description: 'Sent when a ticket is added to the department queue.',
        trigger: 'Automatic — ticket status → waitlist',
        recipients: 'Ticket raiser',
        variables: ['{{ticket_title}}', '{{property_name}}', '{{ticket_number}}', '{{priority_emoji}}', '{{priority}}', '{{status_emoji}}', '{{status}}'],
        source: 'backend/services/NotificationService.ts',
        isSystem: true,
        body:
`*Ticket Waitlisted ⏳*

📋 *{{ticket_title}}*
🏢 {{property_name}}
🎫 {{ticket_number}}
{{priority_emoji}} Priority: *{{PRIORITY}}*
{{status_emoji}} Status: *{{STATUS}}*

Our team will attend to your request shortly.`,
    },
    {
        id: 'whatsapp-ticket-reply',
        name: 'WhatsApp Ticket Creation Reply',
        category: 'ticket',
        description: 'Auto-reply sent to user after they create a ticket via WhatsApp chat.',
        trigger: 'Automatic — incoming WhatsApp message creates a ticket',
        recipients: 'The user who sent the WhatsApp message',
        variables: ['{{ticket_number}}', '{{title}}', '{{property_name}}', '{{category}}', '{{priority_emoji}}', '{{priority}}'],
        source: 'app/api/webhooks/whatsapp/route.ts',
        isSystem: true,
        body:
`✅ *Request Created Successfully!*

🎫 *{{ticket_number}}*
📋 {{title}}
🏢 {{property_name}}
🔧 Category: *{{CATEGORY}}*
{{priority_emoji}} Priority: *{{PRIORITY}}*

Our team will look into it shortly.`,
    },
    {
        id: 'room-booking',
        name: 'Room Booking Notification',
        category: 'booking',
        description: 'Sent to property technical staff when a meeting room is booked.',
        trigger: 'Automatic — meeting room booking confirmed',
        recipients: 'Property admin staff with "technical" skill group',
        variables: ['{{booker_name}}', '{{room_name}}', '{{date}}', '{{start_time}}', '{{end_time}}'],
        source: 'backend/services/NotificationService.ts',
        isSystem: true,
        body:
`*Meeting Room Booked 📅*

👤 *{{booker_name}}* has booked *"{{room_name}}"*
📅 Date: {{date}}
⏰ Time: {{start_time}} – {{end_time}}

Please ensure the room is ready.`,
    },
    {
        id: 'sop-rating',
        name: 'SOP Completion Rating',
        category: 'sop',
        description: 'Sent to an MST when an admin rates their SOP checklist completion.',
        trigger: 'Automatic — admin rates an SOP completion item',
        recipients: 'The MST who completed the SOP checklist',
        variables: ['{{rater_name}}', '{{template_title}}', '{{rating_label}}'],
        source: 'backend/services/NotificationService.ts',
        isSystem: true,
        body:
`*SOP Completion Rated*

👤 *{{rater_name}}* rated your SOP completion:
📋 *"{{template_title}}"*

⭐ Rating: *{{rating_label}}*

(Needs Work / Acceptable / Excellent)`,
    },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_CONFIG: Record<TemplateCategory, { label: string; color: string; bg: string }> = {
    report:  { label: 'Report',  color: 'text-blue-700',  bg: 'bg-blue-100'   },
    ticket:  { label: 'Ticket',  color: 'text-orange-700', bg: 'bg-orange-100' },
    sop:     { label: 'SOP',     color: 'text-purple-700', bg: 'bg-purple-100' },
    booking: { label: 'Booking', color: 'text-green-700',  bg: 'bg-green-100'  },
    system:  { label: 'System',  color: 'text-slate-700',  bg: 'bg-slate-100'  },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function TemplateModal({
    template,
    onClose,
    onSave,
    onDelete,
    isNew,
}: {
    template: WhatsAppTemplate;
    onClose: () => void;
    onSave: (t: WhatsAppTemplate) => void;
    onDelete?: (id: string) => void;
    isNew?: boolean;
}) {
    const [editing, setEditing] = useState(isNew ?? false);
    const [draft, setDraft] = useState<WhatsAppTemplate>({ ...template });
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(draft.body);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const handleSave = () => {
        onSave(draft);
        setEditing(false);
    };

    const cat = CATEGORY_CONFIG[draft.category];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-2xl flex items-center justify-center">
                            <MessageCircle className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                            {editing ? (
                                <input
                                    className="text-lg font-black text-slate-900 border-b-2 border-green-400 outline-none bg-transparent w-64"
                                    value={draft.name}
                                    onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                                />
                            ) : (
                                <h3 className="text-lg font-black text-slate-900">{draft.name}</h3>
                            )}
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
                                {cat.label}
                            </span>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {/* Meta */}
                    <div className="grid grid-cols-1 gap-3">
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</label>
                            {editing ? (
                                <textarea
                                    className="mt-1 w-full text-sm text-slate-700 border border-slate-200 rounded-xl p-2 resize-none outline-none focus:border-green-400"
                                    rows={2}
                                    value={draft.description}
                                    onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                                />
                            ) : (
                                <p className="mt-1 text-sm text-slate-700">{draft.description}</p>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trigger</label>
                                {editing ? (
                                    <input
                                        className="mt-1 w-full text-sm text-slate-700 border border-slate-200 rounded-xl p-2 outline-none focus:border-green-400"
                                        value={draft.trigger}
                                        onChange={e => setDraft(d => ({ ...d, trigger: e.target.value }))}
                                    />
                                ) : (
                                    <p className="mt-1 text-sm text-slate-700">{draft.trigger}</p>
                                )}
                            </div>
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Recipients</label>
                                {editing ? (
                                    <input
                                        className="mt-1 w-full text-sm text-slate-700 border border-slate-200 rounded-xl p-2 outline-none focus:border-green-400"
                                        value={draft.recipients}
                                        onChange={e => setDraft(d => ({ ...d, recipients: e.target.value }))}
                                    />
                                ) : (
                                    <p className="mt-1 text-sm text-slate-700">{draft.recipients}</p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Variables */}
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Variables</label>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {draft.variables.map(v => (
                                <span key={v} className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">{v}</span>
                            ))}
                        </div>
                    </div>

                    {/* Template Body */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Message Body</label>
                            <button
                                onClick={handleCopy}
                                className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                            >
                                {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                                {copied ? 'Copied!' : 'Copy'}
                            </button>
                        </div>
                        {editing ? (
                            <textarea
                                className="w-full font-mono text-sm bg-slate-50 border border-slate-200 rounded-2xl p-4 resize-none outline-none focus:border-green-400 leading-relaxed"
                                rows={14}
                                value={draft.body}
                                onChange={e => setDraft(d => ({ ...d, body: e.target.value }))}
                            />
                        ) : (
                            <pre className="w-full font-mono text-sm bg-slate-50 border border-slate-100 rounded-2xl p-4 whitespace-pre-wrap leading-relaxed text-slate-800">
                                {draft.body}
                            </pre>
                        )}
                    </div>

                    {/* Source */}
                    {!isNew && (
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Source File</label>
                            <p className="mt-1 text-xs font-mono text-slate-400">{draft.source}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between p-6 border-t border-slate-100">
                    <div className="flex gap-2">
                        {!template.isSystem && onDelete && !isNew && (
                            <button
                                onClick={() => { onDelete(template.id); onClose(); }}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete
                            </button>
                        )}
                        {template.isSystem && !isNew && (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
                                <AlertCircle className="w-3.5 h-3.5" />
                                System template — cannot be deleted
                            </span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        {editing ? (
                            <>
                                <button
                                    onClick={() => { setDraft({ ...template }); setEditing(false); if (isNew) onClose(); }}
                                    className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-xl transition-colors"
                                >
                                    <Save className="w-4 h-4" />
                                    Save Template
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={() => setEditing(true)}
                                className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors"
                            >
                                <Edit2 className="w-4 h-4" />
                                Edit Template
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Flow Diagram ─────────────────────────────────────────────────────────────

const FLOW_ROWS: {
    trigger: string;
    triggerColor: string;
    template: string;
    templateColor: string;
    recipients: { label: string; color: string }[];
}[] = [
    {
        trigger: '🆕 New user created',
        triggerColor: 'bg-blue-50 border-blue-200 text-blue-800',
        template: 'Welcome / Onboarding',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '👤 New user (if has phone)', color: 'bg-purple-100 text-purple-700' },
        ],
    },
    {
        trigger: '📱 User sets phone number',
        triggerColor: 'bg-blue-50 border-blue-200 text-blue-800',
        template: 'Welcome / Onboarding',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '👤 That user', color: 'bg-purple-100 text-purple-700' },
        ],
    },
    {
        trigger: '🕛 Every day 12:00 AM IST (cron)',
        triggerColor: 'bg-orange-50 border-orange-200 text-orange-800',
        template: 'Daily Ticket Report',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '👑 All Org Super Admins', color: 'bg-red-100 text-red-700' },
            { label: '🔑 All Owners / Admins', color: 'bg-red-100 text-red-700' },
        ],
    },
    {
        trigger: '🖱️ "Send Report" button clicked',
        triggerColor: 'bg-orange-50 border-orange-200 text-orange-800',
        template: 'On-Demand Ticket Report',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '👑 Org Super Admins', color: 'bg-red-100 text-red-700' },
            { label: '🔑 Owners / Admins', color: 'bg-red-100 text-red-700' },
        ],
    },
    {
        trigger: '🎫 Ticket created → assigned',
        triggerColor: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        template: 'Ticket Created & Assigned',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '👷 Assignee (any property staff)', color: 'bg-indigo-100 text-indigo-700' },
            { label: '👤 Ticket raiser', color: 'bg-purple-100 text-purple-700' },
            { label: '🏢 Property admin', color: 'bg-slate-100 text-slate-700' },
            { label: '👑 Org Super Admin', color: 'bg-red-100 text-red-700' },
        ],
    },
    {
        trigger: '🔄 Ticket reassigned',
        triggerColor: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        template: 'Ticket Reassigned',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '👷 New assignee (any property staff)', color: 'bg-indigo-100 text-indigo-700' },
            { label: '👤 Ticket raiser', color: 'bg-purple-100 text-purple-700' },
            { label: '🏢 Property admin', color: 'bg-slate-100 text-slate-700' },
            { label: '👑 Org Super Admin', color: 'bg-red-100 text-red-700' },
        ],
    },
    {
        trigger: '✅ MST marks ticket done',
        triggerColor: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        template: 'Ticket Completed',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '👤 Ticket raiser', color: 'bg-purple-100 text-purple-700' },
            { label: '🏢 Property admin', color: 'bg-slate-100 text-slate-700' },
            { label: '👑 Org Super Admin', color: 'bg-red-100 text-red-700' },
        ],
    },
    {
        trigger: '⏳ Ticket added to queue',
        triggerColor: 'bg-yellow-50 border-yellow-200 text-yellow-800',
        template: 'Ticket Waitlisted',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '👤 Ticket raiser', color: 'bg-purple-100 text-purple-700' },
            { label: '🏢 Property admin', color: 'bg-slate-100 text-slate-700' },
            { label: '👑 Org Super Admin', color: 'bg-red-100 text-red-700' },
        ],
    },
    {
        trigger: '💬 User messages on WhatsApp',
        triggerColor: 'bg-teal-50 border-teal-200 text-teal-800',
        template: 'WhatsApp Ticket Reply',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '📱 Same user (auto-reply)', color: 'bg-teal-100 text-teal-700' },
        ],
    },
    {
        trigger: '📅 Meeting room booked',
        triggerColor: 'bg-pink-50 border-pink-200 text-pink-800',
        template: 'Room Booking Notification',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '🔧 Technical staff at property', color: 'bg-indigo-100 text-indigo-700' },
        ],
    },
    {
        trigger: '⭐ Admin rates SOP completion',
        triggerColor: 'bg-violet-50 border-violet-200 text-violet-800',
        template: 'SOP Completion Rating',
        templateColor: 'bg-green-50 border-green-300 text-green-800',
        recipients: [
            { label: '👷 MST who completed SOP', color: 'bg-indigo-100 text-indigo-700' },
        ],
    },
];

function FlowDiagram() {
    return (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 overflow-x-auto">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_40px_1fr_40px_1fr] gap-0 mb-4 min-w-[720px]">
                <div className="text-center text-xs font-black text-slate-500 uppercase tracking-widest py-2 bg-slate-50 rounded-xl">
                    ⚡ Trigger / Event
                </div>
                <div />
                <div className="text-center text-xs font-black text-slate-500 uppercase tracking-widest py-2 bg-slate-50 rounded-xl">
                    📨 WhatsApp Template
                </div>
                <div />
                <div className="text-center text-xs font-black text-slate-500 uppercase tracking-widest py-2 bg-slate-50 rounded-xl">
                    👥 Recipients
                </div>
            </div>

            <div className="space-y-3 min-w-[720px]">
                {FLOW_ROWS.map((row, i) => (
                    <div key={i} className="grid grid-cols-[1fr_40px_1fr_40px_1fr] items-center gap-0">
                        {/* Trigger */}
                        <div className={`border rounded-2xl px-4 py-3 text-sm font-bold ${row.triggerColor}`}>
                            {row.trigger}
                        </div>

                        {/* Arrow 1 */}
                        <div className="flex items-center justify-center">
                            <div className="flex items-center gap-0">
                                <div className="h-0.5 w-4 bg-slate-300" />
                                <div className="w-0 h-0 border-t-4 border-b-4 border-l-6 border-transparent border-l-slate-400" style={{ borderLeftWidth: 6 }} />
                            </div>
                        </div>

                        {/* Template */}
                        <div className={`border-2 rounded-2xl px-4 py-3 text-sm font-black text-center shadow-sm ${row.templateColor}`}>
                            <MessageCircle className="w-4 h-4 inline mr-1.5 -mt-0.5" />
                            {row.template}
                        </div>

                        {/* Arrow 2 */}
                        <div className="flex items-center justify-center">
                            <div className="flex items-center gap-0">
                                <div className="h-0.5 w-4 bg-slate-300" />
                                <div className="w-0 h-0 border-t-4 border-b-4 border-transparent" style={{ borderLeftWidth: 6, borderLeftColor: '#94a3b8' }} />
                            </div>
                        </div>

                        {/* Recipients */}
                        <div className="flex flex-wrap gap-1.5">
                            {row.recipients.map((r, j) => (
                                <span key={j} className={`text-xs font-bold px-2.5 py-1 rounded-full ${r.color}`}>
                                    {r.label}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Legend */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-4 text-xs font-bold text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-blue-200 inline-block" />User event</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-200 inline-block" />Scheduled / Manual</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-yellow-200 inline-block" />Ticket event</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-teal-200 inline-block" />WhatsApp webhook</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-pink-200 inline-block" />Booking event</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-violet-200 inline-block" />SOP event</span>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function WhatsAppTemplatesManager() {
    const [templates, setTemplates] = useState<WhatsAppTemplate[]>(DEFAULT_TEMPLATES);
    const [selected, setSelected] = useState<WhatsAppTemplate | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState<TemplateCategory | 'all'>('all');
    const [sendingAll, setSendingAll] = useState(false);
    const [sendAllResult, setSendAllResult] = useState<{ sent: number; skipped: number } | null>(null);
    const [view, setView] = useState<'list' | 'diagram'>('list');

    const handleSendToAll = async () => {
        if (!confirm('Send the Welcome message to ALL users in the database who have a phone number?')) return;
        setSendingAll(true);
        setSendAllResult(null);
        try {
            const res = await fetch('/api/admin/whatsapp/send-welcome-all', { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                setSendAllResult({ sent: data.sent, skipped: data.skipped });
            } else {
                alert(data.error || 'Failed to send');
            }
        } catch {
            alert('Network error');
        } finally {
            setSendingAll(false);
        }
    };

    const filtered = templates.filter(t => {
        const matchSearch = t.name.toLowerCase().includes(search.toLowerCase()) ||
            t.description.toLowerCase().includes(search.toLowerCase());
        const matchCat = filterCat === 'all' || t.category === filterCat;
        return matchSearch && matchCat;
    });

    const handleSave = (updated: WhatsAppTemplate) => {
        setTemplates(prev => {
            const exists = prev.find(t => t.id === updated.id);
            if (exists) return prev.map(t => t.id === updated.id ? updated : t);
            return [...prev, updated];
        });
        setSelected(null);
        setIsNew(false);
    };

    const handleDelete = (id: string) => {
        setTemplates(prev => prev.filter(t => t.id !== id));
    };

    const handleNewTemplate = () => {
        const blank: WhatsAppTemplate = {
            id: `custom-${Date.now()}`,
            name: 'New Template',
            category: 'system',
            description: '',
            trigger: '',
            recipients: '',
            body: '',
            variables: [],
            source: 'custom',
            isSystem: false,
        };
        setSelected(blank);
        setIsNew(true);
    };

    const catCounts = templates.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-green-100 rounded-2xl flex items-center justify-center">
                        <MessageCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900">WhatsApp Templates</h2>
                        <p className="text-sm text-slate-500">{templates.length} templates · {templates.filter(t => !t.isSystem).length} custom</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* Send Welcome to All button */}
                    <div className="flex flex-col items-end gap-1">
                        <button
                            onClick={handleSendToAll}
                            disabled={sendingAll}
                            className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-2xl transition-colors shadow-lg shadow-emerald-200"
                        >
                            {sendingAll
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Users className="w-4 h-4" />
                            }
                            {sendingAll ? 'Sending…' : 'Send Welcome to All Users'}
                        </button>
                        {sendAllResult && (
                            <span className="text-xs font-bold text-emerald-600">
                                ✅ Sent to {sendAllResult.sent} users
                                {sendAllResult.skipped > 0 && `, ${sendAllResult.skipped} skipped`}
                            </span>
                        )}
                    </div>

                    {/* View toggle */}
                    <div className="flex items-center bg-slate-100 rounded-xl p-1">
                        <button
                            onClick={() => setView('list')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            List
                        </button>
                        <button
                            onClick={() => setView('diagram')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${view === 'diagram' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Flow Diagram
                        </button>
                    </div>

                    <button
                        onClick={handleNewTemplate}
                        className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 rounded-2xl transition-colors shadow-lg shadow-green-200"
                    >
                        <Plus className="w-4 h-4" />
                        New Template
                    </button>
                </div>
            </div>

            {view === 'list' && (<>
            {/* Stats row */}
            <div className="grid grid-cols-5 gap-4">
                {(Object.keys(CATEGORY_CONFIG) as TemplateCategory[]).map(cat => {
                    const cfg = CATEGORY_CONFIG[cat];
                    return (
                        <button
                            key={cat}
                            onClick={() => setFilterCat(filterCat === cat ? 'all' : cat)}
                            className={`p-4 rounded-2xl border-2 transition-all text-left ${
                                filterCat === cat
                                    ? `border-current ${cfg.bg} ${cfg.color}`
                                    : 'border-slate-100 bg-white hover:border-slate-200'
                            }`}
                        >
                            <div className={`text-2xl font-black ${filterCat === cat ? cfg.color : 'text-slate-800'}`}>
                                {catCounts[cat] || 0}
                            </div>
                            <div className={`text-xs font-bold mt-1 ${filterCat === cat ? cfg.color : 'text-slate-500'}`}>
                                {cfg.label}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    className="w-full pl-11 pr-4 py-3 text-sm bg-white border border-slate-200 rounded-2xl outline-none focus:border-green-400 transition-colors"
                    placeholder="Search templates..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Template Cards */}
            <div className="grid grid-cols-1 gap-4">
                {filtered.map(template => {
                    const cat = CATEGORY_CONFIG[template.category];
                    const preview = template.body.split('\n').slice(0, 3).join(' ').replace(/\*/g, '').trim();
                    return (
                        <div
                            key={template.id}
                            className="bg-white border border-slate-100 rounded-2xl p-5 hover:border-slate-200 hover:shadow-sm transition-all"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-start gap-4 flex-1 min-w-0">
                                    <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                                        <MessageCircle className="w-5 h-5 text-green-500" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-black text-slate-900 text-sm">{template.name}</h3>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
                                                {cat.label}
                                            </span>
                                            {template.isSystem && (
                                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                                                    System
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-1">{template.description}</p>
                                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-400">
                                            <span className="flex items-center gap-1">
                                                <Zap className="w-3 h-3" />
                                                {template.trigger}
                                            </span>
                                        </div>
                                        <p className="text-xs font-mono text-slate-300 mt-2 truncate">{preview}…</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        onClick={() => { setSelected(template); setIsNew(false); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                                    >
                                        <Eye className="w-3.5 h-3.5" />
                                        View
                                    </button>
                                    <button
                                        onClick={() => { setSelected(template); setIsNew(false); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors"
                                    >
                                        <Edit2 className="w-3.5 h-3.5" />
                                        Edit
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {filtered.length === 0 && (
                    <div className="text-center py-16 text-slate-400">
                        <MessageCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
                        <p className="font-bold">No templates found</p>
                        <p className="text-sm mt-1">Try adjusting your search or filter</p>
                    </div>
                )}
            </div>
            </>)}

            {/* ── Flow Diagram ── */}
            {view === 'diagram' && <FlowDiagram />}

            {/* Modal */}
            {selected && (
                <TemplateModal
                    template={selected}
                    onClose={() => { setSelected(null); setIsNew(false); }}
                    onSave={handleSave}
                    onDelete={handleDelete}
                    isNew={isNew}
                />
            )}
        </div>
    );
}
