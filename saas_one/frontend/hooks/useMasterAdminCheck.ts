/**
 * Hook to check if the current authenticated user holds the master admin role.
 *
 * Queries the `/api/admin/verify` endpoint on mount and returns both the
 * authorization result and a loading flag. Useful for conditionally rendering
 * admin-only UI elements (e.g. organisation-wide settings, super-user panels).
 *
 * @example
 * ```tsx
 * const { isMasterAdmin, isLoading } = useMasterAdminCheck();
 * if (isLoading) return <Spinner />;
 * if (!isMasterAdmin) return <AccessDenied />;
 * return <AdminPanel />;
 * ```
 */

import { useState, useEffect } from 'react';

interface MasterAdminCheck {
    isMasterAdmin: boolean;
    isLoading: boolean;
}

/**
 * Hook to verify if current user is a Master Admin
 * Uses the /api/admin/verify endpoint instead of hardcoded emails
 */
export function useMasterAdminCheck(): MasterAdminCheck {
    const [isMasterAdmin, setIsMasterAdmin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkMasterAdmin = async () => {
            try {
                const response = await fetch('/api/admin/verify');
                const data = await response.json();
                setIsMasterAdmin(data.isMasterAdmin === true);
            } catch (error) {
                console.error('Error checking master admin status:', error);
                setIsMasterAdmin(false);
            } finally {
                setIsLoading(false);
            }
        };

        checkMasterAdmin();
    }, []);

    return { isMasterAdmin, isLoading };
}
