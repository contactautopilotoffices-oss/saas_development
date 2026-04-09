/**
 * Resolver stats management API.
 * GET: List all resolver stats | POST: Create resolver stats entry.
 * Auth: Master Admin.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/frontend/utils/supabase/server'
import { createAdminClient } from '@/frontend/utils/supabase/admin'

/**
 * GET /api/admin/resolver-stats
 *
 * Securely fetches all resolver stats for the Master Admin dashboard.
 *
 * Verifies the requesting user's session and confirms is_master_admin = true before
 * querying the resolver_stats table. Uses the admin client to bypass RLS policies.
 * Returns up to 10,000 records ordered by created_at descending, with joined user,
 * property, and skill_group data.
 *
 * Auth: Supabase session + is_master_admin flag must be true.
 */
export async function GET(request: NextRequest) {
    try {
        // 1. Verify Authentication & Master Admin Status
        const supabase = await createClient()
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !currentUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if current user is a master admin
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

        // 2. Fetch Resolver Stats with Full Relational Data
        const { data, error: fetchError } = await adminClient
            .from('resolver_stats')
            .select(`
                id,
                user_id,
                property_id,
                skill_group_id,
                user:users!user_id(full_name, email),
                property:properties!property_id(name),
                skill_group:skill_groups!skill_group_id(name, code)
            `)
            .range(0, 9999) // Increase limit from default 1000 to 10,000
            .order('created_at', { ascending: false });

        if (fetchError) {
            console.error('Error fetching resolver stats:', fetchError)
            return NextResponse.json({ error: 'Failed to fetch resolver stats' }, { status: 500 })
        }

        // 3. Return Data
        return NextResponse.json(data)

    } catch (error) {
        console.error('Admin resolver stats API error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
