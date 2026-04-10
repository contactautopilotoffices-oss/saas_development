'use client';

import UnifiedDashboard from '@/frontend/components/dashboard/UnifiedDashboard';

// UnifiedDashboard uses useAppSession to detect role and renders:
// - org_super_admin / org_admin → OrgDashboard
// - super_tenant               → SuperTenantDashboard
// - master_admin               → MasterAdminDashboard
// - property_admin             → PropertyAdminDashboard
export default function OrgDashboardPage() {
    return <UnifiedDashboard />;
}
