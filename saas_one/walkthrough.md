# Walkthrough - Fix Ticket Deletion Permissions

I have fixed the issue where some tickets could not be deleted by Master Admins or Org Super Admins due to restrictive permission checks.

## Changes Made

### backend
#### [route.ts](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/api/tickets/[id]/route.ts)
- Introduced a check for `is_master_admin` from the `users` table to allow global deletion of tickets by Master Admins.
- Updated `organization_memberships` role check to be case-insensitive, supporting both `ORG_SUPER_ADMIN` and `org_super_admin`.
- Refactored the permission logic to handle Master Admin status as the primary override.

render_diffs(file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/api/tickets/[id]/route.ts)

## Verification Results

### Permission Logic Test
- **Creator**: Can still delete their own tickets.
- **Property Admin**: Can delete any ticket in their property (verified `PROPERTY_ADMIN` and `property_admin` roles).
- **Org Super Admin**: Can delete any ticket in their organization (verified `ORG_SUPER_ADMIN` and `org_super_admin` roles).
- **Master Admin**: Can delete any ticket in the system regardless of membership.

The 403 Forbidden error seen in the console logs should now be resolved for users with administrative roles.
