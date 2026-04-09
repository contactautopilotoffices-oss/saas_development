# Fix: Category Code Persistence

I have updated the ticket creation API to ensure the `category` field in the database is populated with the specific issue classification code (e.g., 'ac_breakdown') instead of being generic.

## Changes
- **File**: `app/api/tickets/route.ts`
- **Logic**:
  - The API now explicitly adds `category: categoryCode || 'general'` to the `INSERT` payload.
  - This preserves the fine-grained classification (like 'water_leakage') in the `category` text column, in addition to linking the `category_id`.

## Verification
1. Create a new ticket via the API or UI (e.g., "AC is broken").
2. Check the `tickets` table in the database.
3. The `category` column should now read `ac_breakdown` (or whichever code matched), instead of `general` or `null`.
