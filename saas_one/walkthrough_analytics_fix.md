# Walkthrough: Diesel & Electricity Analytics for Super Admin

I have fixed the issue where Super Admins (Org Admins) were unable to see Diesel and Electricity analytics when "All Properties" was selected.

## Changes Made

### Backend Endpoints
I have added the following organization-level API endpoints to aggregate data across all properties:
- `GET /api/organizations/[orgId]/generators`: Fetches all generators for the organization.
- `GET /api/organizations/[orgId]/electricity-meters`: Fetches all electricity meters for the organization.
- `GET /api/organizations/[orgId]/diesel-readings`: Fetches aggregated diesel readings.
- `GET /api/organizations/[orgId]/electricity-readings`: Fetches aggregated electricity readings.

### Frontend Dashboards
I have updated `DieselAnalyticsDashboard.tsx` and `ElectricityAnalyticsDashboard.tsx` with the following:
- **Aggregated View**: When no property is selected (e.g., in the Org Admin Dashboard), the dashboards now fetch data using the new organization-level endpoints.
- **Improved Stability**: Added safety checks to ensure API responses are arrays before processing, preventing "t.filter is not a function" crashes.
- **Path Safety**: Prevented invalid API calls to paths containing the string "undefined".
- **Conditional Actions**: Hidden the "Log Entry" and "Export" buttons when in organization-wide view, as these actions typically require a specific property context.

## Verification Proof

### Backend Implementation
The new routes correctly fetch data using property IDs associated with the organization.

### Frontend Fixes
The components now use conditional logic to switch between property-level and organization-level data fetching:

```tsx
// Example from ElectricityAnalyticsDashboard.tsx
const readingsBaseUrl = (propertyId && propertyId !== 'undefined')
    ? `/api/properties/${propertyId}/electricity-readings`
    : `/api/organizations/${orgId}/electricity-readings`;
```

This ensures that Super Admins can now see a comprehensive overview of diesel and electricity usage across their entire organization.
