# Walkthrough - Skill-Based Onboarding
I have implemented the skill-based onboarding flow as requested.

## Changes

### 1. Onboarding UI (`app/onboarding/page.tsx`)
- Updated **Role Descriptions**:
  - `mst` is now "**Maintenance Staff**" (Technical repairs & maintenance).
  - `staff` is now "**Soft Services Staff**" (Cleaning, hygiene, pantry & support).
- Added **Skill Selection Step**:
  - Appears only for `mst` and `staff` roles.
  - **MST Skills**: Technical, Plumbing, Vendor Coordination.
  - **Staff Skills**: Technical, Soft Services.
- Added **Completion Logic**:
  - When setup is complete, the selected skills are automatically saved to `resolver_stats`.

### 2. Database Migration (`migrations/seed_skill_groups.sql`)
- Created a migration file to seed the standard skill groups (`technical`, `plumbing`, `soft_services`, `vendor`) for all existing properties.
- **IMPORTANT**: You must run this SQL against your Supabase database for the new onboarding flow to work correctly, as it relies on these skill groups existing.

## Verification
- **New User Flow**:
  1. Signup -> Redirect to Onboarding.
  2. Enter Phone.
  3. Select Property.
  4. Select Role (e.g., MST).
  5. Select Skills (e.g., Plumbing).
  6. Complete -> `property_memberships` created + `resolver_stats` created for Plumbing.

## Next Steps
- Run the `migrations/seed_skill_groups.sql` script in your Supabase SQL Editor.
