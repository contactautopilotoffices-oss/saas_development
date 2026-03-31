import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * DELETE /api/ppm/clear
 * Clears all PPM schedule records for an org (optionally filtered by property).
 * Body: { organization_id, property_id? }
 */
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { organization_id, property_id } = body;

        if (!organization_id) {
            return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
        }

        let query = supabaseAdmin
            .from('ppm_schedules')
            .delete()
            .eq('organization_id', organization_id);

        if (property_id) query = query.eq('property_id', property_id);

        const { error, count } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ success: true, deleted: count ?? 'all' });
    } catch (err) {
        console.error('PPM clear error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
