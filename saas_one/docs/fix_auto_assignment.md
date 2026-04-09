# Fix: Ticket Auto-Assignment & Classification

I have updated the backend logic to correctly identify request types, map them to skill groups, and ensure tickets are auto-assigned to the correct MST.

## Changes

### 1. Database Migration: `seed_issue_categories.sql`
- **Created a map** of common issues (AC, Plumbing, etc.) to Skill Groups.
- Example: "Water Leakage" -> Mapped to **Plumbing** Skill Group.
- **Action Required**: Run this SQL in Supabase.

### 2. API Logic Update: `api/tickets/route.ts`
- **Implemented Granular Classification**:
  - The API now scans the ticket description not just for "Technical" or "Soft Services", but specifically for "AC", "Leakage", "Cleaning", etc.
- **DB Lookup**:
  - It finds the matching `issue_category` in the database.
  - It retrieves the correct `skill_group_id`.
- **Assignment**:
  - It sets `skill_group_id` on the ticket before insertion.
  - This allows the `auto_assign_ticket` trigger in the database to find an available MST with that matching skill.

## Verification
1. **Run the SQL Migration** (`migrations/seed_issue_categories.sql`).
2. Create a new ticket (e.g., "Water leaking in washroom").
3. Check the ticket in the database or UI.
   - It should have `category_id` (Water Leakage).
   - It should have `skill_group_id` (Plumbing).
   - It should be **assigned** to an MST who has the Plumbing skill (if one exists and is available).
