/**
 * Admin user management API.
 * Read access to all users for the Master Admin dashboard.
 * GET /api/admin/users
 * Auth: Master Admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/frontend/utils/supabase/server'
import { createAdminClient } from '@/frontend/utils/supabase/admin'

/**
 * GET /api/admin/users
 * 
 * Securely fetch all users for the Master Admin dashboard.
 * Bypasses RLS by using adminClient, but strictly verifies Master Admin session first.
 */
export async function GET(request: NextRequest) {
    try {
        // 1. Verify Authentication & Master Admin Status
        const supabase = await createClient()
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !currentUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if current user is a master admin (using admin client to be safe against RLS on users table itself)
        const adminClient = createAdminClient()

        const { data: masterAdminCheck, error: checkError } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', currentUser.id)
            .single()

        if (checkError || !masterAdminCheck?.is_master_admin) {
            console.error('Access Denied: Not a master admin', currentUser.id);
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // 2. Fetch Users with Full Relational Data
        // Using adminClient to bypass any potential RLS issues on related tables
        const { data: users, error: fetchError } = await adminClient
            .from('users')
            .select(`
                *,
                organization_memberships (role, organization_id, is_active),
                property_memberships (role, organization_id, is_active, property: properties (name, code))
            `)
            .order('created_at', { ascending: false });

        if (fetchError) {
            console.error('Error fetching users:', fetchError)
            return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
        }

        // 3. Return Data
        return NextResponse.json(users)

    } catch (error) {
        console.error('Admin users API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
