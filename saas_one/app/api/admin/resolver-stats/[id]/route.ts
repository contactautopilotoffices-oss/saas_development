/**
 * Single resolver stats management API.
 * PATCH: Update | DELETE: Remove resolver stats entry.
 * GET /api/admin/resolver-stats/[id]
 * Auth: Master Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * DELETE /api/admin/resolver-stats/[id]
 * 
 * Securely deletes a resolver_stats entry.
 * Only accessible by Master Admins or Property Admins.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json({ error: 'Missing resolver stat ID' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check if user is MST or Property Admin
        const { data: userData } = await supabase
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .single();

        // If not Master Admin, check property membership
        if (!userData?.is_master_admin) {
            // For now, let's keep it restricted to Master Admins as requested
            return NextResponse.json({ error: 'Forbidden. Only Master Admins can manage resolvers.' }, { status: 403 });
        }

        const adminClient = createAdminClient();
        const { error: deleteError } = await adminClient
            .from('resolver_stats')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('[Delete Resolver Stat] Error:', deleteError);
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Resolver entry deleted successfully' });
    } catch (error: any) {
        console.error('[Delete Resolver Stat] Unexpected error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
