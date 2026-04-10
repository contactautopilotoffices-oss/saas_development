# Implementation Plan - Website Responsiveness and Mobile Sidebar

This plan outlines the steps to add responsiveness to the major dashboards in the application, specifically focusing on mobile devices. Each dashboard currently has a fixed sidebar that doesn't adapt well to smaller screens.

## Proposed Changes

### [Dashboard Components]

#### [MODIFY] [StaffDashboard.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_testing/components/dashboard/StaffDashboard.tsx)
- Add `sidebarOpen` state management.
- Add a hamburger menu toggle in the header for mobile.
- Refactor the `aside` component to use responsive Tailwind classes:
  - `fixed h-screen z-50`
  - `transition-transform duration-300`
  - `-translate-x-full lg:translate-x-0 lg:sticky`
- Add a mobile overlay (backdrop) when the sidebar is open.
- Adjust the main content margin to be `lg:ml-64` and `ml-0` on mobile.

#### [MODIFY] [MstDashboard.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_testing/components/dashboard/MstDashboard.tsx)
- Replace the current "floating side button" toggle with a standard hamburger menu in the header.
- Clean up the existing responsive logic to match the standard pattern used in `StaffDashboard`.
- Ensure the sidebar slides correctly and has a backdrop.

#### [MODIFY] [PropertyAdminDashboard.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_testing/components/dashboard/PropertyAdminDashboard.tsx)
- Add `sidebarOpen` state.
- Add hamburger menu in the header (or create one if it doesn't exist).
- Refactor `aside` and `main` components for responsiveness.

#### [MODIFY] [OrgAdminDashboard.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_testing/components/dashboard/OrgAdminDashboard.tsx)
- Add hamburger menu in the header.
- Refactor `aside` and `main` components for responsiveness.
- Fix the `ml-0` logic on mobile which is currently hardcoded for some tabs but not all.

#### [MODIFY] [TenantDashboard.tsx](file:///c:/Users/harsh/OneDrive/Desktop/autopilot/saas_testing/components/dashboard/TenantDashboard.tsx)
- Implement similar responsive sidebar logic.

## Verification Plan

### Manual Verification
- Resize the browser window to mobile widths (< 1024px) for each dashboard.
- Verify that the sidebar is hidden by default on mobile.
- Click the hamburger menu and verify the sidebar slides in correctly.
- Verify that clicking the overlay or a navigation link closes the sidebar on mobile.
- Verify that the layout looks correct on desktop (sidebar stays visible).
