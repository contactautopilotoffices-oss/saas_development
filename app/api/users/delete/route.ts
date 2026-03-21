import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/frontend/utils/supabase/server'
import { createAdminClient } from '@/frontend/utils/supabase/admin'

export async function POST(request: NextRequest) {
    try {
        const { userId } = await request.json()

        if (!userId) {
            return NextResponse.json(
                { error: 'Missing userId' },
                { status: 400 }
            )
        }

        // Get the current user's session
        const supabase = await createClient()
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            )
        }

        // Check if current user is a master admin
        const { data: masterAdminData } = await supabase
            .from('users')
            .select('is_master_admin')
            .eq('id', currentUser.id)
            .single()

        if (!masterAdminData?.is_master_admin) {
            return NextResponse.json(
                { error: 'Forbidden. Only Master Admins can delete users.' },
                { status: 403 }
            )
        }

        const adminClient = createAdminClient()

        // Step 1: Mark user as deleted and set offline in our DB (preserves all their data)
        const { error: softDeleteError } = await adminClient
            .from('users')
            .update({ online_status: 'offline', deleted_at: new Date().toISOString() })
            .eq('id', userId)

        if (softDeleteError) {
            // deleted_at column may not exist yet — fallback to just setting offline
            await adminClient
                .from('users')
                .update({ online_status: 'offline' })
                .eq('id', userId)
        }

        // Step 2: Deactivate all memberships so user disappears from all user management views
        await adminClient
            .from('organization_memberships')
            .update({ is_active: false })
            .eq('user_id', userId)

        await adminClient
            .from('property_memberships')
            .update({ is_active: false })
            .eq('user_id', userId)

        // Step 3: Delete from Supabase Auth entirely so they can re-register if needed.
        // NOTE: If your users table has ON DELETE CASCADE on the id FK, Supabase will
        // also delete the users table row. To prevent that, run this migration once:
        //   ALTER TABLE users DROP CONSTRAINT users_id_fkey;
        //   ALTER TABLE users ADD CONSTRAINT users_id_fkey
        //     FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE SET NULL;
        // Until then, falling back to ban so data is preserved.
        const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)

        if (deleteAuthError) {
            // Fallback: if delete fails (e.g. FK constraint), just ban the account
            console.warn('Auth delete failed, falling back to ban:', deleteAuthError.message)
            await adminClient.auth.admin.updateUserById(userId, { ban_duration: '876600h' })
        }

        return NextResponse.json({ success: true, message: 'User deleted successfully' })

    } catch (error: any) {
        console.error('Delete user API error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
