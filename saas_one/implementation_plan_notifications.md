# Fix Notification Redirection

The user is being redirected to the dashboard instead of the specific ticket details page when clicking a notification. This happens because the login page and the auth callback route ignore the `redirect` or `next` parameters after a successful authentication, forcing a fallback to the default dashboard based on the user's role.

## User Review Required
> [!IMPORTANT]
> This change updates the core authentication redirection logic. While it primarily aims to fix notifications, it will also improve the "return to page" experience after manual login.

## Proposed Changes

### Frontend

#### [MODIFY] [login/page.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/(auth)/login/page.tsx)
- Update `handleSubmit` for sign-in to check for the `redirect` search parameter.
- If `redirect` is present, redirect to that path instead of the default role-based dashboard.

### Backend / Auth Callback

#### [MODIFY] [callback/route.ts](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_one/app/api/auth/callback/route.ts)
- Update the callback handler to check for `redirect` parameter in the URL.
- Ensure that after exchanging the code for a session, the user is sent to the intended destination if provided.

## Verification Plan

### Manual Verification
1. **Mock a notification click while logged out**:
   - Manually navigate to `/login?redirect=/tickets/<valid-ticket-id>`.
   - Log in and verify if it takes you to the ticket page instead of the dashboard.
2. **Mock a notification click in foreground**:
   - When a toast appears, click it and verify the URL changes to `/tickets/<id>`.
3. **Verify deep linking for various roles**:
   - Test as Tenant and as Staff to ensure roles don't interfere with the redirection when a specific target is provided.
