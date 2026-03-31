import { createClient } from '@/frontend/utils/supabase/client';
import { useEffect, useState } from 'react';

export interface AppSession {
    user_id: string;
    role: 'master_admin' | 'org_super_admin' | 'org_admin' | 'property_admin' | 'staff' | 'soft_service_manager' | 'soft_service_staff' | 'tenant' | 'super_tenant' | 'maintenance_vendor';
    org_id: string;
    property_ids: string[];
    available_modules: string[];
}

export function useAppSession() {
    const [session, setSession] = useState<AppSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // Stable reference — createClient() must not be called on every render
    const supabase = useState(() => createClient())[0];

    useEffect(() => {
        async function getSessionData() {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                setSession(null);
                setIsLoading(false);
                return;
            }

            // In real implementation, fetch from organization_memberships / property_memberships
            // For this implementation, we simulate based on email/metadata
            let role = user.user_metadata.role || 'tenant';
            const org_id = user.user_metadata.org_id || 'default-org';

            // FORCE Master Admin role for these specific emails
            if (user.email === 'ranganathanlohitaksha@gmail.com') {
                role = 'master_admin';
            }

            // Fetch org + property memberships in parallel instead of sequentially
            const [{ data: orgMem }, { data: propMems }] = await Promise.all([
                supabase
                    .from('organization_memberships')
                    .select('role, organization_id')
                    .eq('user_id', user.id)
                    .neq('is_active', false)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle(),
                supabase
                    .from('property_memberships')
                    .select('property_id, role')
                    .eq('user_id', user.id)
                    .eq('is_active', true),
            ]);

            // Prioritize roles: Org Member > Property Member > Metadata > Default (tenant)
            const propRole = propMems?.find(p => p.role && p.role !== 'tenant')?.role || propMems?.[0]?.role;
            const membershipRole = orgMem?.role || propRole;

            // Resolve org_id from active org membership, or from property's org
            const resolvedOrgId = orgMem?.organization_id || org_id;

            const resolvedRole = (membershipRole || role) as string;

            // For super_tenant: fetch assigned properties from super_tenant_properties table
            let superTenantPropertyIds: string[] = [];
            if (resolvedRole === 'super_tenant') {
                const { data: stProps } = await supabase
                    .from('super_tenant_properties')
                    .select('property_id')
                    .eq('user_id', user.id);
                superTenantPropertyIds = stProps?.map(r => r.property_id) || [];
            }

            const finalPropertyIds = resolvedRole === 'super_tenant'
                ? superTenantPropertyIds
                : (propMems?.map(pm => pm.property_id) || []);

            console.log('[useAppSession] Role resolution:', {
                orgRole: orgMem?.role,
                propRole,
                metadataRole: role,
                resolved: resolvedRole,
                activeProperties: finalPropertyIds.length
            });

            setSession({
                user_id: user.id,
                role: resolvedRole as any,
                org_id: resolvedOrgId,
                property_ids: finalPropertyIds,
                available_modules: ['ticketing', 'viewer', 'analytics', 'stock', 'checklist']
            });
            setIsLoading(false);
        }

        getSessionData();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return { session, isLoading };
}
