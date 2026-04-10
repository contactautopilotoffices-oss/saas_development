# Implementation Plan - Fix Ticket Deletion Permissions

The user is encountering a 403 Forbidden error when trying to delete certain tickets. This is because the current deletion logic is restricted to the ticket creator, Property Admins, and Org Super Admins (with strict case-sensitive matching). Master Admins are currently not explicitly granted permission to delete tickets.

## Proposed Changes

### [Backend] Ticket API
Update the DELETE handler for tickets to include Master Admin permissions and make role checks more robust.

#### [MODIFY] [route.ts](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/api/tickets/[id]/route.ts)
- Add a check for `is_master_admin` from the `users` table.
- Update role checks for `PROPERTY_ADMIN` and `ORG_SUPER_ADMIN` to be case-insensitive or include common variations.
- Ensure Master Admins can delete any ticket regardless of property or organization membership.

## Verification Plan

### Manual Verification
- Test deleting a ticket as the creator (should still work).
- Test deleting a ticket as a Property Admin (should still work).
- Test deleting a ticket as a Master Admin for a ticket created by another user (should now work).
- Test deleting a ticket as a regular user who did not create the ticket (should still be forbidden).
