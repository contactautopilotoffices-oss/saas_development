import type { Metadata } from 'next';
import ProcurementDashboard from '@/frontend/components/dashboard/ProcurementDashboard';

export const metadata: Metadata = {
    title: 'Procurement Dashboard | Autopilot',
    description: 'Manage material requests across all properties',
};

export default function Page() {
    return <ProcurementDashboard />;
}
