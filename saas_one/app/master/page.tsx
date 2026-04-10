'use client';

import MasterAdminDashboard from '@/frontend/components/dashboard/MasterAdminDashboard';
import { useAuth } from '@/frontend/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Loader from '@/frontend/components/ui/Loader';
import { useMasterAdminCheck } from '@/frontend/hooks/useMasterAdminCheck';

export default function MasterPage() {
    const { user, isLoading: authLoading } = useAuth();
    const { isMasterAdmin, isLoading: checkingRole } = useMasterAdminCheck();
    const router = useRouter();

    const isLoading = authLoading || checkingRole;

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }

        if (!isLoading && user && !isMasterAdmin) {
            router.push('/organizations');
        }
    }, [user, isMasterAdmin, isLoading, router]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#fafbfc]">
                <Loader size="lg" />
            </div>
        );
    }

    if (!user || !isMasterAdmin) return null;

    return <MasterAdminDashboard />;
}
