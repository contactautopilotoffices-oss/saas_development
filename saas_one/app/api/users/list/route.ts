/**
 * @fileoverview User Listing API
 * @route GET /api/users/list?orgId=xxx&propertyId=yyy
 * @description
 *   Retrieves all active users scoped to a property or an entire organization.
 *   At the property level, it fetches from `property_memberships` and joins user
 *   details. At the org level, it merges both `organization_memberships` and
 *   `property_memberships` entries, deduplicating users who appear in both.
 *   Uses an admin client to bypass RLS so that org_super_admins and property_admins
 *   can enumerate all users within their scope.
 *
 *   Permission check: caller must be `is_master_admin`, `org_super_admin`/`admin`/`owner`
 *   on the org, or `property_admin` on at least one property.
 * @requires_auth Yes — admin or privileged roles only
 * @param {string} orgId — UUID of the organization to list users for
 * @param {string} propertyId — UUID of the property to list users for
 * @response 200 { users } — sorted alphabetically by full_name
 * @response 400 Bad Request — neither orgId nor propertyId provided
 * @response 401 Unauthorized
 * @response 403 Forbidden — caller lacks required admin role
 * @response 500 Internal Server Error
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/frontend/utils/supabase/server'
import { createAdminClient } from '@/frontend/utils/supabase/admin'

/**
 * GET /api/users/list?orgId=xxx&propertyId=yyy
 *
 * Fetch all users for an organization or property.
 * Uses admin client to bypass RLS so org_super_admins can see all users.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url)
        const orgId = searchParams.get('orgId')
        const propertyId = searchParams.get('propertyId')

        if (!orgId && !propertyId) {
            return NextResponse.json(
                { error: 'Missing required parameter: orgId or propertyId' },
                { status: 400 }
            )
        }

        // Verify the caller is authenticated
        const supabase = await createClient()
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized. Please log in.' },
                { status: 401 }
            )
        }

        // Verify caller has permission (must be org_super_admin, property_admin, or master_admin)
        const adminClient = createAdminClient()

        const { data: callerUser } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', currentUser.id)
            .single()

        const isMasterAdmin = !!callerUser?.is_master_admin

        if (!isMasterAdmin && orgId) {
            const { data: callerOrgMembership } = await adminClient
                .from('organization_memberships')
                .select('role')
                .eq('user_id', currentUser.id)
                .eq('organization_id', orgId)
                .eq('is_active', true)
                .maybeSingle()

            const { data: callerPropMembership } = await adminClient
                .from('property_memberships')
                .select('role')
                .eq('user_id', currentUser.id)
                .eq('is_active', true)

            const isOrgAdmin = callerOrgMembership && ['org_super_admin', 'admin', 'owner'].includes(callerOrgMembership.role)
            const isPropAdmin = callerPropMembership?.some((m: any) => m.role === 'property_admin')

            if (!isOrgAdmin && !isPropAdmin) {
                return NextResponse.json(
                    { error: 'Forbidden. You must be an org admin or property admin.' },
                    { status: 403 }
                )
            }
        }

        // Fetch users using admin client (bypasses RLS)
        if (propertyId) {
            const { data, error } = await adminClient
                .from('property_memberships')
                .select(`
                    role,
                    is_active,
                    created_at,
                    property:properties (id, name),
                    user:users (id, full_name, email, user_photo_url, phone)
                `)
                .eq('property_id', propertyId)
                .eq('is_active', true)

            if (error) throw error

            const users = (data || []).map((item: any) => ({
                id: item.user.id,
                full_name: item.user.full_name,
                email: item.user.email,
                user_photo_url: item.user.user_photo_url,
                propertyRole: item.role,
                propertyName: item.property?.name,
                propertyId: item.property?.id,
                is_active: item.is_active,
                joined_at: item.created_at,
                phone: item.user.phone
            })).sort((a: any, b: any) => a.full_name.localeCompare(b.full_name))

            return NextResponse.json({ users })
        }

        // Org-level: fetch both org memberships and property memberships
        const { data: orgUsers, error: orgError } = await adminClient
            .from('organization_memberships')
            .select(`
                role,
                is_active,
                created_at,
                user:users (id, full_name, email, user_photo_url, phone)
            `)
            .eq('organization_id', orgId!)
            .eq('is_active', true)

        if (orgError) throw orgError

        const { data: propUsers, error: propError } = await adminClient
            .from('property_memberships')
            .select(`
                role,
                is_active,
                created_at,
                property:properties!inner (id, name, organization_id),
                user:users (id, full_name, email, user_photo_url, phone)
            `)
            .eq('properties.organization_id', orgId!)
            .eq('is_active', true)

        if (propError) throw propError

        const userMap = new Map<string, any>()

        orgUsers?.forEach((item: any) => {
            userMap.set(item.user.id, {
                id: item.user.id,
                full_name: item.user.full_name,
                email: item.user.email,
                user_photo_url: item.user.user_photo_url,
                orgRole: item.role,
                organizationId: orgId,
                is_active: item.is_active,
                joined_at: item.created_at,
                phone: item.user.phone
            })
        })

        propUsers?.forEach((item: any) => {
            const existing = userMap.get(item.user.id)
            if (existing) {
                existing.propertyRole = item.role
                existing.propertyName = item.property?.name
                existing.propertyId = item.property?.id
            } else {
                userMap.set(item.user.id, {
                    id: item.user.id,
                    full_name: item.user.full_name,
                    email: item.user.email,
                    user_photo_url: item.user.user_photo_url,
                    propertyRole: item.role,
                    propertyName: item.property?.name,
                    propertyId: item.property?.id,
                    is_active: item.is_active,
                    joined_at: item.created_at,
                    phone: item.user.phone
                })
            }
        })

        const users = Array.from(userMap.values()).sort((a, b) => a.full_name.localeCompare(b.full_name))

        return NextResponse.json({ users })
    } catch (error: any) {
        console.error('Users list API error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
