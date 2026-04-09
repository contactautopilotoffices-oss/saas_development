# Fix: Floor Extraction Logic

I have fixed the issue where the floor number was not being saved, even though it was extracted from the description.

## The Problem
- The helper function `extractFloorNumber` logic existed in the file.
- **However**, it was simply **never called** during the `INSERT` operation.
- The `floor_number` column in the database was remaining `NULL`.

## The Fix
- **File**: `app/api/tickets/route.ts`
- **Change**: Added `floor_number: extractFloorNumber(title || description)` to the database insert payload.

## Verification
1. Create a ticket: "Light broken on **3rd floor**".
2. The system will now extract `3` and save it to the `tickets.floor_number` column.
3. The UI will display "Level 3" instead of "Level -".

## Note on Categorization
- The categorization display fix I made earlier handles the "AC Breakdown" vs "General" issue.
- Please verify with a **newly created ticket**, as old tickets cannot be retroactively fixed by the UI logic change alone (if they were saved wrong).
