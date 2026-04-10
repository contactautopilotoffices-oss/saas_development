/**
 * Audit Logging Service
 *
 * Purpose: Writes an immutable, append-only record of significant system events
 * to the `audit_logs` database table.
 *
 * Why it exists:
 *   - Compliance & accountability: Every user action (ticket created, role changed,
 *     vendor approved) should be traceable to a specific user and timestamp.
 *   - Forensic analysis: When something goes wrong, auditors need a reliable
 *     chronological record of who did what.
 *   - Non-repudiation: The audit log provides proof of actions taken.
 *
 * Design decisions:
 *   - Uses the admin Supabase client (bypasses RLS) so audit writes succeed
 *     regardless of the caller's permission level.
 *   - Errors are swallowed — audit logging MUST NEVER break the main request flow.
 *     If DB is down, the application should continue, not crash.
 *   - Payload is flexible (Record<string, unknown>) so any event can store
 *     relevant context without schema changes.
 *
 * Usage:
 *   import { logAudit } from '@/backend/lib/audit';
 *   logAudit({ eventBy: userId, objectType: 'ticket', objectId: ticketId, action: 'created' });
 *
 * Database table: audit_logs
 *   - event_by   : UUID of the user who performed the action
 *   - object_type: The entity type (ticket, user, property, vendor, etc.)
 *   - object_id  : UUID of the affected entity
 *   - action     : The action taken (created, updated, deleted, assigned, etc.)
 *   - payload    : JSONB blob with additional context (what changed, old/new values)
 */

import { createAdminClient } from '@/frontend/utils/supabase/admin';

// Parameters accepted by the audit logging function
interface AuditParams {
    eventBy: string      // User ID of who performed the action
    objectType: string   // Type of entity being acted upon (e.g., 'ticket', 'user')
    objectId: string     // Unique ID of the specific entity instance
    action: string       // The action verb (e.g., 'created', 'assigned', 'closed')
    payload?: Record<string, unknown>  // Additional context (before/after values, metadata)
}

/**
 * Write a single audit log entry to the database.
 *
 * What it does:
 *   1. Creates an admin Supabase client (bypasses RLS).
 *   2. Inserts a row into the audit_logs table.
 *   3. Silently catches and logs any DB errors — never throws.
 *
 * Why silent failures: Audit logging is a secondary concern. If the database is
 * temporarily unavailable, the main business operation (e.g., creating a ticket)
 * should still succeed. A missed audit entry is better than a failed request.
 */
export async function logAudit({ eventBy, objectType, objectId, action, payload = {} }: AuditParams): Promise<void> {
    try {
        const adminSupabase = createAdminClient()
        await adminSupabase.from('audit_logs').insert({
            event_by: eventBy,
            object_type: objectType,
            object_id: objectId,
            action,
            payload,  // Stored as JSONB — flexible key-value store for event metadata
        })
    } catch (err) {
        // Log the failure but don't re-throw — audit must not impact main flow
        console.error('[audit] Failed to write audit log:', err)
    }
}
