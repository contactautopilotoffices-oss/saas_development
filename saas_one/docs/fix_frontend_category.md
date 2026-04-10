# Fix: Frontend Category Display

I have fixed the issue where the frontend was showing "General" even though the database had the correct category (e.g., `ac_breakdown`).

## The Issue
- The API returns both `category` (the string code column) and `category` (the relation object from `issue_categories`).
- Supabase join syntax `category:issue_categories(...)` overwrites the `category` string field in the returned object if names collide, or puts it in a nested structure.
- Even if they don't collide, the frontend code was prioritizing `ticket.category.name`, which might be "General" if the linked ID is generic.

## The Fix
- **File**: `app/tickets/[ticketId]/page.tsx`
- **Logic**: 
  - I updated the display logic to check if `ticket.category` is a **string** first (the specific code like `ac_breakdown`).
  - If it is a string, we display that (formatted nicely: `AC Breakdown`).
  - If not, we fall back to the relation name.

## Why Assignment Failed?
- As discussed, auto-assignment requires the **MST to have a matching skill** in `resolver_stats`.
- If your MSTs do not have the skill group ID for `ac_breakdown` in their stats, the trigger puts the ticket in **Waitlist**.
- **Correction**: Access the database and check `resolver_stats` for your user. Use the `Claim Request` button to manually assign it to yourself if auto-assign failed.
