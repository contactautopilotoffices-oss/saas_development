# Why Tickets Go to Waitlist

You asked why some requests are still in the **Waitlist** (`WAITLIST`) status.

This happens for **valid reasons** based on the logic we just verified in `evolution.sql`.

## Reasons for `WAITLIST` Status

1.  **Strict Skill Match Required**
    - The auto-assignment logic strictly assigns tickets only to MSTs who have a **matching skill entry** in the `resolver_stats` table.
    - If a ticket requires "Plumbing" (`skill_group_id`), and no *currently available* MST has "Plumbing" in their `resolver_stats`, the trigger defaults the ticket to `waitlist`.

2.  **Missing Resolver Stats (Most Likely)**
    - Since we only *just* fixed the `resolver_stats` creation in the Onboarding flow (Step 45), old users (or users created before today) might **not** have any `resolver_stats` entries at all.
    - If `resolver_stats` is empty for a skill, the system assumes "No MST found" and sets status to `waitlist`.

3.  **Active Status & Availability**
    - The trigger checks `is_available = true` and `pm.is_active = true`. If an MST is marked unavailable or inactive, they are skipped.

## How to Fix (For Existing Users)

If you have existing 'staff' or 'mst' users who should be receiving these tickets, you need to manually add their skills to `resolver_stats`.

### SQL to Check Missing Skills

```sql
SELECT u.full_name, u.email, rs.id as resolver_stat_id 
FROM users u
LEFT JOIN resolver_stats rs ON rs.user_id = u.id
JOIN property_memberships pm ON pm.user_id = u.id
WHERE pm.role IN ('mst', 'staff');
```

If `resolver_stat_id` is NULL, those users cannot be auto-assigned tickets.

### SQL to Backfill Skills (One-Time Fix)

Run this to give **ALL** existing MSTs/Staff the "Technical" skill by default so they can start receiving tickets:

```sql
INSERT INTO resolver_stats (user_id, property_id, skill_group_id, is_available)
SELECT 
    pm.user_id, 
    pm.property_id, 
    (SELECT id FROM skill_groups WHERE code = 'technical' AND property_id = pm.property_id LIMIT 1),
    true
FROM property_memberships pm
LEFT JOIN resolver_stats rs ON rs.user_id = pm.user_id
WHERE pm.role IN ('mst', 'staff')
AND rs.id IS NULL; -- Only for those with no skills yet
```
