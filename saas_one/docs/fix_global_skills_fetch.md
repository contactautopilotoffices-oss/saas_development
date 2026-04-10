# Fix Applied: Global Skill Groups Fetch

I have updated the onboarding logic to fetch skill groups globally (`is_active: true`) instead of filtering by `property_id`. I also added the requested debug logs.

## Changes
- **File**: `app/onboarding/page.tsx`
- **Query**:
  - Removed: `.eq('property_id', finalPropId)`
  - Added: `.eq('is_active', true)`
- **Debugging**:
  - Added `console.log('Selected skills:', ...)`
  - Added `console.log('Fetched skill groups:', ...)`

## Verification
1. Reload the onboarding page.
2. Open Browser Console (F12).
3. Complete the onboarding with a role (e.g., MST) and skills.
4. Check console. You should see:
   - "Selected skills: [...]"
   - "Fetched skill groups: [...]" (Should not be empty now)

If `Fetched skill groups` is populated, the insertion into `resolver_stats` will proceed correctly.
