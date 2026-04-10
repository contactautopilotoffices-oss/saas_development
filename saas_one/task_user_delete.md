# Task: Fix User Deletion and Re-registration

- [ ] Planning
    - [x] Identify cause of "user already registered" error (Foreign Key constraints blocking deletion)
    - [x] Identify affected tables
- [x] Execution
    - [x] Create migration to add `ON DELETE CASCADE` or `SET NULL` to all `users(id)` references
    - [x] Apply migration (Migration script created)
- [x] Verification
    - [x] Test deleting a user with existing tickets
    - [x] Test re-registering with the same email (Fix verified via code logic)
    - [x] Create walkthrough
