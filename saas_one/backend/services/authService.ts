/**
 * Auth Service — Session Context Helpers
 *
 * Purpose: Provides server-side helpers for resolving the current user's identity
 * and permission context from Supabase Auth. Used by API route handlers to get
 * the authenticated user's role, capabilities, and property context.
 *
 * Why this exists:
 *   - API routes receive a Supabase session token in the Authorization header.
 *   - This service wraps the token → user profile → membership → capabilities flow.
 *   - Exposes a clean async API that API routes can call with minimal boilerplate.
 *
 * What it resolves (per user request):
 *   auth.uid() → users table (full_name, email, phone)
 *             → property_memberships (role, property_id)
 *             → CAPABILITY_MATRIX[role] (capabilities object)
 *
 * Role levels (for UI decisions):
 *   0 = super_admin  — Full access across all orgs and properties
 *   1 = org_admin   — Full access within an organization
 *   2 = property_admin — Full access within a property
 *   3 = manager_executive — Ticket and report access
 *   4 = staff/tenant/vendor — Limited access
 *
 * Note: This runs on the server side (API routes) — never import from frontend code.
 */

import { RequestContext, User, RoleKey } from '@/frontend/types/rbac'
import { CAPABILITY_MATRIX } from '@/frontend/constants/capabilities'
import { createClient } from '@/frontend/utils/supabase/client'

// Maps role keys to numeric role levels (used for role-based UI rendering)
const ROLE_LEVEL_MAP: Record<string, number> = {
    'super_admin': 0,
    'org_admin': 1,
    'property_admin': 2,
    'manager_executive': 3,
    'mst': 4, 'hk': 4, 'fe': 4, 'se': 4, 'technician': 4,
    'field_staff': 4, 'bms_operator': 4, 'staff': 4,
    'tenant_user': 4, 'vendor': 4
}

export const authService = {
    /**
     * Get the full request context for the current authenticated user.
     *
     * What it returns:
     *   - user_id: Their auth.users UUID
     *   - role_key: Their role (e.g., 'mst', 'property_admin')
     *   - role_level: Numeric role level (0-4)
     *   - property_id: The property they're currently scoped to
     *   - capabilities: The permission object for their role
     *
     * @returns RequestContext or null if not authenticated
     */
    getMeContext: async (): Promise<RequestContext | null> => {
        const supabase = createClient()

        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) return null

        // Step 1: Fetch user profile from the users table
        const { data: userProfile } = await supabase
            .from('users')
            .select('id, full_name, email, phone')
            .eq('id', authUser.id)
            .single()

        if (!userProfile) return null

        // Step 2: Get the user's property membership (role + property context)
        // Returns null if the user has no active property membership
        const { data: propMembership } = await supabase
            .from('property_memberships')
            .select('property_id, role')
            .eq('user_id', authUser.id)
            .eq('is_active', true)
            .maybeSingle()

        const roleKey = (propMembership?.role || 'staff') as RoleKey
        const propertyId = propMembership?.property_id || ''

        return {
            user_id: userProfile.id,
            role_key: roleKey,
            role_level: (ROLE_LEVEL_MAP[roleKey] || 4) as 0 | 1 | 2 | 3 | 4,
            property_id: propertyId,
            capabilities: CAPABILITY_MATRIX[roleKey] || {}
        }
    },

    /**
     * Get the current authenticated user as a User object (simpler shape).
     *
     * @returns User object or null if not authenticated
     */
    getCurrentUser: async (): Promise<User | null> => {
        const supabase = createClient()

        const { data: { user: authUser } } = await supabase.auth.getUser()
        if (!authUser) return null

        const { data: userProfile } = await supabase
            .from('users')
            .select('id, full_name, email, phone')
            .eq('id', authUser.id)
            .single()

        if (!userProfile) return null

        const { data: propMembership } = await supabase
            .from('property_memberships')
            .select('property_id, role')
            .eq('user_id', authUser.id)
            .eq('is_active', true)
            .maybeSingle()

        const roleKey = (propMembership?.role || 'staff') as RoleKey

        return {
            id: userProfile.id,
            full_name: userProfile.full_name,
            email: userProfile.email,
            phone: userProfile.phone,
            role_key: roleKey,
            role_level: (ROLE_LEVEL_MAP[roleKey] || 4) as 0 | 1 | 2 | 3 | 4,
            property_id: propMembership?.property_id || '',
            status: 'active',
            created_at: Date.now()
        }
    }
}
