## Feature Updates

### 1. Diesel Logger: Generator Deletion
Added the ability for staff/admins to remove Diesel Generators (DGs) directly from the logger dashboard.

*   **UI Change**: A new trash icon button has been added to the top-right corner of each [DieselLoggerCard](file:///c:/Users/harsh\OneDrive\Desktop\autopilot\saas_one/frontend/components/diesel/DieselLoggerCard.tsx).
*   **Logic**: Clicking the delete button triggers a confirmation dialog. Upon approval, it calls the `DELETE` method on the `generators` API, removing the record from Supabase and refreshing the dashboard list.
*   **Safety**: Included a browser confirmation prompt to prevent accidental deletions.

---

### 1. MST Shift API 500 Error
Resolved the `Internal Server Error (500)` occurring on the `/api/mst/shift` endpoint.

*   **Cause**: The API was using `.single()` on a Supabase query for `resolver_stats`. If a user (MST) was visiting a property for the first first time and didn't have a record in `resolver_stats` yet, Supabase would return a 0-row error, causing the API to crash.
*   **Fix**: 
    *   Updated [app/api/mst/shift/route.ts](file:///c:/Users/harsh\OneDrive/Desktop\autopilot\saas_one/app/api/mst/shift/route.ts) to use `.limit(1)` instead of `.maybeSingle()`. This ensures that even if duplicate `resolver_stats` records exist for a user/property combination, the API won't crash with "multiple rows returned".
    *   Applied same fix to the Staff check-in API.
    *   Added descriptive error logging and stack traces in development mode.
    *   Created [fix_resolver_stats_rls.sql](file:///c:/Users/harsh\OneDrive/Desktop\autopilot\saas_one/backend/db/migrations/fix_resolver_stats_rls.sql) to ensure proper `SELECT` and `UPDATE` policies exist for the `resolver_stats` table.
*   **Front-end Resilience**: Updated [MstDashboard.tsx](file:///c:/Users/harsh\OneDrive\Desktop\autopilot\saas_one/frontend/components/dashboard/MstDashboard.tsx) to handle non-ok responses from the shift API without hanging the UI.

---

This walkthrough details the verification and improvements made to the notification system to ensure it aligns with the required business rules.

## Requirements Verified
1.  **Ticket Creation**: Notifications are sent to all relevant users (MST, PROPERTY_ADMIN, SECURITY, STAFF, ORG_SUPER_ADMIN) except the ticket creator.
2.  **Ticket Assignment/Reassignment**: Notifications are sent specifically to the newly assigned MST.
3.  **Ticket Completion**: Notifications are sent only to the creator of the ticket when it is marked as 'Resolved' or 'Closed'.

## Changes Made

### 1. Specialized Messaging for Auto-Assignment vs Reassignment
Updated `afterTicketAssigned` in [NotificationService.ts](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/backend/services/NotificationService.ts) to distinguish between new auto-assigned tickets and reassignments.

*   **Auto-Assigned at Creation**: "A new ticket [Title] has been created and assigned to you."
*   **Reassigned**: "Ticket [Title] has been reassigned to you."

The [Ticket Creation API](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/api/tickets/route.ts) and [Intelligent Assignment Engine](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/backend/lib/ticketing/assignment.ts) now explicitly trigger the "created and assigned" version of the message.

### 2. Unified Creation and Assignment Notifications
Modified [app/api/tickets/route.ts](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/api/tickets/route.ts) to ensure that when a ticket is auto-assigned at creation, both the "Ticket Created" (to the staff pool) and "Ticket Created & Assigned" (to the assignee) notifications are triggered.

### 3. Enabled Notifications for Intelligent (Bulk) Assignment
Updated [backend/lib/ticketing/assignment.ts](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/backend/lib/ticketing/assignment.ts) to trigger the `afterTicketAssigned` notification when tickets are assigned via the intelligent assignment engine (used for bulk assignment).

### 4. FCM Notification Branding & Error Handling
Improved push notification delivery and visual presentation in [NotificationService.ts](file:///c:/Users/harsh\OneDrive\Desktop\autopilot\saas_one/backend/services/NotificationService.ts).

*   **Branding**: Notifications now explicitly show "Autopilot FMS | [Title]" to ensure users know where the alert is coming from. Added the official logo as both the `icon` and `badge` for web push.
*   **Interaction**: Enabled `requireInteraction: true` and added a "View Request" action button to web notifications.
*   **Automatic Token Cleanup**: Fixed the `Requested entity was not found` error by implementing automatic deactivation of stale FCM tokens. When a token is reported as invalid by Google, it is marked as `is_active: false` in our database to prevent future failed dispatch attempts.

```diff
+import { NotificationService } from '@/backend/services/NotificationService';
+
+// ... inside loops ...
+if (assignedTo) {
+    NotificationService.afterTicketAssigned(ticket.id).catch(err => { ... });
+}
```

### 3. Verification of Existing Flows
- **Reassign Box / Flow Map**: Verified that [app/api/tickets/reassign/route.ts](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/api/tickets/reassign/route.ts) and [app/api/tickets/batch-assign/route.ts](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/api/tickets/batch-assign/route.ts) correctly call `NotificationService.afterTicketAssigned`.
- **Status Updates**: Verified that [app/api/tickets/update-status/route.ts](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/api/tickets/update-status/route.ts) correctly triggers both assignment and completion notifications.
- **Completion Rules**: Confirmed that `afterTicketCompleted` in `NotificationService.ts` only targets the `raised_by` (creator) user ID.

## Summary of Notification Recipients

| Event | Recipient(s) | Exclusions |
| :--- | :--- | :--- |
| **Ticket Created** | MST, Property Admin, Security, Staff, Org Super Admin | Creator (`raised_by`) |
| **Ticket Assigned** | Assigned MST (`assigned_to`) | Creator (if they assigned themselves) |
| **Ticket Completed** | Ticket Creator (`raised_by`) | - |

## Testing Proof
The `NotificationService.ts` contains extensive debug logs (prefixed with `>>>>>>>>>> [NOTIFICATION TEST]`) which can be monitored in the server terminal to verify recipient resolution and delivery status in real-time.
