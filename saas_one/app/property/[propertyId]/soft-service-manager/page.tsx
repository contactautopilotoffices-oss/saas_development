'use client';

import SoftServiceManagerDashboard from '@/frontend/components/dashboard/SoftServiceManagerDashboard';
import { useAuth } from '@/frontend/context/AuthContext';
import Loader from '@/frontend/components/ui/Loader';
import { use } from 'react';

export default function SoftServiceManagerPage({ params }: { params: Promise<{ propertyId: string }> }) {
    const { propertyId } = use(params);
    const { membership, isMembershipLoading } = useAuth();

    if (isMembershipLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <Loader />
            </div>
        );
    }

    const propertyMembership = membership?.properties?.find(p => p.id === propertyId);

    return <SoftServiceManagerDashboard propertyId={propertyId} userRole={propertyMembership?.role} />;
}
