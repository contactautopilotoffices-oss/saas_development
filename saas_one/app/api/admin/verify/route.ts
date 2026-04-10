/**
 * Master Admin verification API.
 * Verifies the caller is a master admin.
 * POST /api/admin/verify
 * Auth: Open (server-side verification).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * GET /api/admin/verify
 *
 * Verifies whether the currently authenticated user is a Master Admin.
 *
 * Checks the Supabase auth session, then queries the users table using the admin
 * client to read the is_master_admin flag. Returns { isMasterAdmin: boolean }.
 *
 * Auth: Supabase session cookie (user must be logged in).
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ isMasterAdmin: false }, { status: 401 });
        }

        // Check is_master_admin column from database
        const adminClient = createAdminClient();
        const { data: userRecord, error: checkError } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .single();

        if (checkError) {
            // Log error without exposing details
            return NextResponse.json({ isMasterAdmin: false }, { status: 500 });
        }

        return NextResponse.json({
            isMasterAdmin: userRecord?.is_master_admin === true
        });

    } catch (error) {
        console.error('Verify admin API error:', error);
        return NextResponse.json({ isMasterAdmin: false }, { status: 500 });
    }
}
