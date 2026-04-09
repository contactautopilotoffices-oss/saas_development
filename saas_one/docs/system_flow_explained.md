# System Flow Explained & Fixes

## 1. Why "General Area" & "General" Category?
You saw "General Area" and "General" category because:
1.  **Location**: The system wasn't extracting "cafeteria" from the text, so the frontend defaulted to "General Area".
    *   **FIXED**: I added `extractLocation` logic. New tickets with "cafeteria" will now save `location: "Cafeteria"`.
2.  **Category**: The database saves `ac_breakdown`, but the API joins it with a generic `issue_categories` table row which might be named "General" or similar, and the frontend showed that name.
    *   **FIXED**: I updated the frontend to prioritize the specific code (`AC Breakdown`) over the generic name.

## 2. Assignment Flow (The "Why")

Here is exactly how the system maps a Request to a Resolver:

1.  **Request**: "AC not cooling, 7th floor"
2.  **Classification (API)**:
    *   Scans text -> Finds keyword "AC".
    *   Determines Category Code: `ac_breakdown`.
3.  **Mapping (Database)**:
    *   Looks up `ac_breakdown` in `issue_categories` table.
    *   Finds linked `skill_group_id` -> **"Technical"** (ID: `...`).
4.  **Ticket Creation**:
    *   Inserts ticket with `skill_group_id = Technical`.
    *   Status = `open`.
5.  **Auto-Assignment Trigger (DB)**:
    *   Fires on `INSERT`.
    *   **Search**: Looks in `resolver_stats` table.
    *   **Query**: `SELECT user_id FROM resolver_stats WHERE skill_group_id = [Technical ID] AND is_available = true`.
6.  **Result**:
    *   **If Match Found**: Assigns to User X. Status -> `assigned`.
    *   **If NO Match Found**: Status -> `waitlist`.

**Why yours failed**: Your MST users did not have an entry in `resolver_stats` for the "Technical" skill group.
**Solution**: Run the SQL script I provided earlier (`why_waitlist.md`) to backfill these skills.

## 3. Floor & Location Logic
- **Floor**: Extracted from "7th floor" -> Saved as `7`.
- **Location**: Extracted from "cafeteria" -> Saved as `Cafeteria`.

**Action**: Please create a **NEW** ticket now. It should show:
- Category: **AC Breakdown**
- Location: **Cafeteria**
- Floor: **Level 7**
