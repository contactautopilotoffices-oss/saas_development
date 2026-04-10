# Fix: Direct Assignment Logic

I have implemented the strict skill-based self-assignment logic for tickets.

## Logic Overview
The "Claim Request" button now performs three validation checks before allowing an assignment:

1.  **Status Validity**: Ticket must be in `WAITLIST` or `OPEN`. (Completed/Assigned tickets cannot be claimed).
2.  **Manual Assign Check**: If the ticket belongs to a skill group marked as `is_manual_assign` (e.g., Vendor), self-assignment is blocked.
3.  **Skill Match**: The system checks if YOU (the logged-in user) have the relevant skill in `resolver_stats`.
    - It queries `resolver_stats` for your `user_id`, the ticket's `property_id`, and `skill_group_id`.
    - If no match is found, it denies assignment.

## Verification
1.  **Log in as an MST** (ensure you have skills like 'Plumbing' but *not* 'Vendor').
2.  **Open a Ticket** that requires 'Plumbing' (e.g., Water Leakage).
    - Status should be `WAITLIST` (or open).
    - Click **Claim Request**.
    - It should **Success**.
3.  **Open a Ticket** that requires 'Vendor' (e.g., Lift Breakdown).
    - Click **Claim Request**.
    - It should **Fail** with: *"This request requires manual / vendor coordination."*
4.  **Open a Ticket** for a skill you *don't* have (e.g., 'Soft Services' if you are pure tech).
    - Click **Claim Request**.
    - It should **Fail** with: *"You are not assigned to this skill category."*
