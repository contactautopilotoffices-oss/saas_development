# Walkthrough - User Deletion & Re-registration Fix

I have identified and fixed the issue where users could not be deleted properly, which prevented them from signing up again with the same email.

## The Issue
The database had several foreign key constraints referencing the `users` table that did not specify `ON DELETE CASCADE` or `ON DELETE SET NULL`. When a user had created tickets, comments, or meter readings, these records would block the user's deletion from Supabase Auth. Because the deletion failed, the email remained registered in the system, causing the "user already registered" error on subsequent sign-up attempts.

## Changes Made

### Database Migration
I created a new migration file: [20260213_fix_user_deletion_cascades.sql](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/backend/db/migrations/20260213_fix_user_deletion_cascades.sql)

This migration:
- Makes `tickets.raised_by` nullable to allow for anonymous archiving.
- Updates foreign keys for the following tables to use `ON DELETE SET NULL` or `ON DELETE CASCADE`:
    - `tickets`
    - `ticket_comments`
    - `ticket_activity_log`
    - `electricity_readings`
    - `diesel_readings`
    - `property_activities`
    - `vms_tickets`
    - `vendors`
    - `meter_multipliers`
    - `grid_tariffs`
    - `dg_tariffs`

## How to Apply the Fix
1. Open your **Supabase Dashboard**.
2. Go to the **SQL Editor**.
3. Copy the contents of [`backend/db/migrations/20260213_fix_user_deletion_cascades.sql`](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/backend/db/migrations/20260213_fix_user_deletion_cascades.sql).
4. Run the script.

Once applied, you will be able to delete users even if they have existing history in the system, and those users (or the same email) will be able to sign up fresh again.
