# Walkthrough - Resolver Role & Skill Synchronization

This update implements dynamic synchronization between user roles and resolver statistics. It ensures that when a user's role is changed to or from a resolver role (MST or Staff), their entry in the resolver pool is automatically managed.

## Changes Made

### 1. User Creation API (`/api/users/create`)
- Added support for a `skills` array in the request body.
- When creating a user with the `mst` or `staff` role, the API now:
    - Maps the skills to their respective `skill_groups` for the property.
    - Inserts entries into `resolver_stats` for each skill (filtering out Technical for Staff).
    - Inserts entries into the `mst_skills` mapping table for all selected skills.

### 2. Role Update API (`/api/users/update-role`) [NEW]
- Created a dedicated endpoint for role updates that handles complex synchronization.
- **Role De-escalation**: If a user is moved from `mst` or `staff` to a non-resolver role, all their entries in `resolver_stats` and `mst_skills` are deleted.
- **Role Escalation/Change**: If a user is moved to `mst` or `staff`, or if their skills are changed, the endpoint:
    - Clears old skill mappings.
    - Batch inserts new skills.
    - Refreshes `resolver_stats` to match the new selection.

### 3. User Management UI (`UserDirectory.tsx`)
- Updated the "Edit Role" functionality to be state-aware of skills.
- When editing a user, the component now fetches their current skills from the database.
- If the role is changed to `mst` or `staff` during editing, a skill selection panel appears with checkboxes.
- Uses the new `update-role` API to ensure backend synchronization.

### 4. Member Invitation UI (`InviteMemberModal.tsx`)
- Added a skill selection section that conditionally appears for `mst` and `staff` roles.
- This UI mirrors the onboarding process to provide a consistent experience.
- Pass selected skills to the creation API.

### 5. Onboarding Sync (`onboarding/page.tsx`)
- Updated the onboarding flow to also insert into the `mst_skills` table, ensuring consistency across the entire platform.

## Verification Results

### Automated Tests
- Verified API routes (/api/users/create, /api/users/update-role) for correct database operations using Supabase admin client.
- Confirmed that `property_id` is correctly handled for property-scoped resolver pools.

### Manual Verification
- **Add Member**: Selecting MST role displays skill checkboxes. Creating user results in correct `resolver_stats` and `mst_skills`.
- **Edit Role**: Moving a Property Admin to MST reveals skill checkboxes. Clicking 'Check' updates role and populates stats.
- **Role Change**: Moving an MST to Tenant automatically removes them from the resolver list (verified via database and resolver workload views).
