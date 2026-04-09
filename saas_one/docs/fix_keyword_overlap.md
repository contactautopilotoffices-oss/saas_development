# Fix: Incorrect AC Categorization

I have fixed the issue where "AC not working" was being incorrectly classified as **Lift Breakdown**.

## The Problem
- The classification engine had the keyword `'not working'` assigned to the `lift_breakdown` category.
- Your description "AC, **not working**, 6th floor" matched this keyword.
- Since "not working" is 2 words, it likely got a higher score (20 points) than just "AC" (10 points) or was the first strong match.

## The Fix
- **File**: `app/api/tickets/route.ts`
- **Change**: Removed `'not working'` from the `lift_breakdown` keyword list.
- **Result**: "not working" is now a generic phrase and will not trigger a specific category. "AC" will now be the dominant keyword, correctly classifying it as `ac_breakdown`.

## Verification
1. Create a ticket: "AC not working on 5th floor".
2. It should now be classified as `ac_breakdown`.
