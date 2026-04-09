'use client';

import { use } from 'react';
import PropertyAdminDashboard from '@/frontend/components/dashboard/PropertyAdminDashboard';
import SoftServiceManagerDashboard from '@/frontend/components/dashboard/SoftServiceManagerDashboard';
import { useAuth } from '@/frontend/context/AuthContext';
import Loader from '@/frontend/components/ui/Loader';

export default function PropertyDashboardPage({ params }: { params: Promise<{ propertyId: string }> }) {
    const { propertyId } = use(params);
    const { membership, isMembershipLoading } = useAuth();
    
    // We show a simple generic loader while checking the membership so we don't flash the Admin dashboard
    if (isMembershipLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader />
            </div>
        );
    }

    // Check if user has the Soft Service Manager role for this property
    const propertyMembership = membership?.properties?.find(p => p.id === propertyId);
    const isSoftServiceManager = propertyMembership?.role === 'soft_service_manager';

    if (isSoftServiceManager) {
        return <SoftServiceManagerDashboard propertyId={propertyId} userRole={propertyMembership?.role} />;
    }

    return <PropertyAdminDashboard />;
}
