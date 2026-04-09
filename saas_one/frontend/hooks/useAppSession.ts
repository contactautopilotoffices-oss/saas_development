/**
 * App Session Hook — User Session & Role Resolution
 *
 * Purpose: Provides a lightweight session object with the user's role,
 * organization ID, and accessible properties. Used by components that need
 * quick access to session data without full auth context.
 *
 * How it differs from useAuth():
 *   - useAuth(): Full auth context with membership caching, OAuth flows, signIn/signOut.
 *   - useAppSession(): Focused on getting the user's role and property IDs.
 *
 * Session resolution order (priority):
 *   1. organization_memberships.role (if the user is an org member)
 *   2. property_memberships.role (if the user has a property-level role)
 *   3. user.user_metadata.role (fallback from SSO metadata)
 *   4. Default: 'tenant' (lowest privilege)
 *
 * Special handling:
 *   - Master Admin: Hardcoded email override for admin users.
 *   - Super Tenant: Fetches assigned properties from super_tenant_properties table.
 *
 * Performance notes:
 *   - Uses getSession() (cookie read, ~0ms) instead of getUser() (network call, ~200ms).
 *   - Fetches organization_memberships and property_memberships in parallel.
 *   - Initializes supabase client once via useState initializer (not useMemo, not on every render).
 */

import { createClient } from '@/frontend/utils/supabase/client';
import { useEffect, useState } from 'react';

/** App session — lightweight user session with role and property context */
export interface AppSession {
    user_id: string;
    role: 'master_admin' | 'org_super_admin' | 'org_admin' | 'property_admin' |
          'staff' | 'soft_service_manager' | 'soft_service_staff' |
          'tenant' | 'super_tenant' | 'maintenance_vendor';
    org_id: string;
    property_ids: string[];
    available_modules: string[];
}

/**
 * Hook to access the current user's app session.
 *
 * @returns session — The AppSession object (null while loading)
 * @returns isLoading — Whether the session is still being resolved
 *
 * What it resolves:
 *   1. Reads the auth session cookie (fast, no network call).
 *   2. Fetches organization + property memberships in parallel.
 *   3. Resolves the effective role based on priority rules.
 *   4. For super_tenant: fetches assigned property IDs from super_tenant_properties.
 */
export function useAppSession() {
    const [session, setSession] = useState<AppSession | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    // Create client once, store in state initializer (runs once on mount)
    const supabase = useState(() => createClient())[0];

    useEffect(() => {
        async function getSessionData() {
            // getSession() reads from cookie — fast (~0ms), no network request
            // Use getUser() only when you need to verify the token with Supabase servers
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            const user = currentSession?.user;

            if (!user) {
                setSession(null);
                setIsLoading(false);
                return;
            }

            // Role priority: org membership > property membership > metadata > 'tenant'
            let role = user.user_metadata?.role || 'tenant';
            const org_id = user.user_metadata?.org_id || 'default-org';

            // Hardcoded master admin override (for known admin users)
            if (user.email === 'ranganathanlohitaksha@gmail.com') {
                role = 'master_admin';
            }

            // Fetch memberships in parallel for performance
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

            // Resolve effective role
            const propRole = propMems?.find(p => p.role && p.role !== 'tenant')?.role || propMems?.[0]?.role;
            const membershipRole = orgMem?.role || propRole;
            const resolvedOrgId = orgMem?.organization_id || org_id;
            const resolvedRole = (membershipRole || role) as string;

            // Super tenant: fetch their assigned properties
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
    }, [supabase]);

    return { session, isLoading };
}
