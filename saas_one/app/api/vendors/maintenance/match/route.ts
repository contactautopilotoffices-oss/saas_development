/**
 * Vendor matching API.
 * Matches tickets/requests to appropriate vendors.
 * GET /api/vendors/maintenance/match
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * POST /api/vendors/maintenance/match
 * Bulk-match vendor names in ppm_schedules to maintenance_vendors.id.
 * Call this after uploading a new PPM Excel to link existing vendor rows.
 *
 * Body: { organization_id: string }
 * Returns: { matched: number }
 */
export async function POST(request: NextRequest) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { organization_id } = await request.json();
    if (!organization_id) return NextResponse.json({ error: 'organization_id required' }, { status: 400 });

    // Get all vendors for this org
    const { data: vendors, error: vendorError } = await supabaseAdmin
        .from('maintenance_vendors')
        .select('id, company_name')
        .eq('organization_id', organization_id)
        .eq('is_active', true);

    if (vendorError) return NextResponse.json({ error: vendorError.message }, { status: 500 });
    if (!vendors || vendors.length === 0) return NextResponse.json({ matched: 0 });

    let totalMatched = 0;

    for (const vendor of vendors) {
        const { data, error } = await supabaseAdmin
            .from('ppm_schedules')
            .update({ vendor_id: vendor.id })
            .eq('organization_id', organization_id)
            .ilike('vendor_name', vendor.company_name)
            .is('vendor_id', null)
            .select('id');

        if (!error && data) {
            totalMatched += data.length;
        }
    }

    return NextResponse.json({ matched: totalMatched });
}
