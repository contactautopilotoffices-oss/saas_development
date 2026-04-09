# Implementation Plan - Remove Zero SLA Breach KPI

The objective is to remove the display of "0 SLA breached" KPI from the Property Admin and Organization Admin dashboards. The label should only be visible when there is at least one breached ticket.

## Proposed Changes

### Dashboard Components

---

#### [MODIFY] [PropertyAdminDashboard.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_testing/components/dashboard/PropertyAdminDashboard.tsx)
Wrap the "SLA breached" span in a conditional check: `{ticketStats.sla_breached > 0 && ...}`.

---

#### [MODIFY] [OrgAdminDashboard.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_testing/components/dashboard/OrgAdminDashboard.tsx)
Wrap the "SLA breached" span in a conditional check: `{displayTicketStats.sla_breached > 0 && ...}`.

---

## Verification Plan

### Manual Verification
- View the Property Admin Dashboard when `sla_breached` is 0. Verify the red label is not visible.
- View the Organization Admin Dashboard when `sla_breached` is 0. Verify the red label is not visible.
- If possible, simulate a breach to ensure the label appears when the count is > 0.
