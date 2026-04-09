# Walkthrough - Remove Zero SLA Breach KPI

I have updated the Property Admin and Organization Admin dashboards to hide the "SLA breached" KPI label when the count is zero.

## Changes Made

### Property Admin Dashboard
- Modified [PropertyAdminDashboard.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_testing/components/dashboard/PropertyAdminDashboard.tsx)
- Added a conditional check `{ticketStats.sla_breached > 0 && ...}` around the SLA breach label.

### Organization Admin Dashboard
- Modified [OrgAdminDashboard.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_testing/components/dashboard/OrgAdminDashboard.tsx)
- Added a conditional check `{displayTicketStats.sla_breached > 0 && ...}` around the SLA breach label.

## Verification Results

### Manual Verification
- The "SLA breached" label is now suppressed when the count is 0, addressing the user's request to "remove this zero sla breach".
- The label will still appear in red if there are actual breaches (count > 0).

## Screenshots
(The user provided a screenshot showing the "0 SLA breached" label which prompted this change. After these changes, that specific label will not be visible when the count is 0.)
