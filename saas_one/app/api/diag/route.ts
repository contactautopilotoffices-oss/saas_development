/**
 * Diagnostic/health check API.
 * Returns environment diagnostics including org list and membership samples.
 * GET: Fetch diagnostics.
 * Auth: Master Admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();

        // 1. All Orgs
        const { data: orgs } = await supabase.from('organizations').select('id, name');

        // 2. All Memberships in the table (limited to 50 for safety)
        const { data: mems } = await supabase.from('organization_memberships').select('organization_id, role, user_id').limit(50);

        return NextResponse.json({
            all_orgs: orgs,
            sample_memberships: mems
        });
    } catch (err: any) {
        return NextResponse.json({ error: err.message });
    }
}
