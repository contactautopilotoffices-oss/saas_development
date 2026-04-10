/**
 * @fileoverview User Invitation API
 * @route POST /api/users/invite
 * @description
 *   Sends a Supabase Auth magic link invitation to an email address to join an
 *   organization. The recipient activates their account by clicking the link and
 *   completing the Supabase email verification flow. An `organization_membership`
 *   record is pre-created (or upserted) so the user's role is provisioned
 *   automatically once they accept.
 *
 *   Only `org_super_admin`, `admin`, or `owner` may send invitations.
 * @requires_auth Yes — org admin/owner only
 * @request_body { email, organization_id, role?, redirect_url? }
 * @response 200 { success, message, user_id }
 * @response 400 Bad Request — missing or invalid email/organization_id
 * @response 401 Unauthorized
 * @response 403 Forbidden — caller is not an org admin
 * @response 500 Internal Server Error
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/frontend/utils/supabase/server'
import { createAdminClient } from '@/frontend/utils/supabase/admin'

interface InviteUserRequest {
    email: string
    organization_id: string
    role?: 'member' | 'admin' | 'owner'
    redirect_url?: string
}

/**
 * POST /api/users/invite
 * 
 * Invite a user to an organization via email.
 * The user will receive an email with a magic link to join.
 * 
 * Required: Caller must be an admin/owner of the organization.
 */
export async function POST(request: NextRequest) {
    try {
        const body: InviteUserRequest = await request.json()
        const { email, organization_id, role = 'member', redirect_url } = body

        // Validation
        if (!email || !organization_id) {
            return NextResponse.json(
                { error: 'Missing required fields: email, organization_id' },
                { status: 400 }
            )
        }

        if (!email.includes('@')) {
            return NextResponse.json(
                { error: 'Invalid email format' },
                { status: 400 }
            )
        }

        // Get the current user's session to verify permissions
        const supabase = await createClient()
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized. Please log in.' },
                { status: 401 }
            )
        }

        // Check if current user is org admin
        const { data: membership, error: permError } = await supabase
            .from('organization_memberships')
            .select('role')
            .eq('organization_id', organization_id)
            .eq('user_id', currentUser.id)
            .single();

        const isOrgAdmin = membership && ['org_super_admin', 'admin', 'owner'].includes(membership.role);

        if (permError || !isOrgAdmin) {
            return NextResponse.json(
                { error: 'Forbidden. You must be an organization admin to invite users.' },
                { status: 403 }
            )
        }

        // Use admin client to invite user (bypasses RLS)
        const adminClient = createAdminClient()

        // Invite user via Supabase Auth
        const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
            email,
            {
                redirectTo: redirect_url || `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/callback`,
                data: {
                    invited_by: currentUser.id,
                    organization_id,
                    role,
                }
            }
        )

        if (inviteError) {
            console.error('Invite error:', inviteError)
            return NextResponse.json(
                { error: inviteError.message },
                { status: 500 }
            )
        }

        // Pre-create organization membership (will be activated when user accepts)
        if (inviteData.user) {
            const { error: memberError } = await adminClient
                .from('organization_memberships')
                .upsert({
                    organization_id,
                    user_id: inviteData.user.id,
                    role,
                }, {
                    onConflict: 'organization_id,user_id'
                })

            if (memberError) {
                console.error('Failed to pre-create membership:', memberError)
                // Non-fatal - continue with response
            }
        }

        return NextResponse.json({
            success: true,
            message: `Invitation sent to ${email}`,
            user_id: inviteData.user?.id,
        })

    } catch (error) {
        console.error('Invite API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
