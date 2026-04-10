/**
 * Vendor property associations API.
 * GET/POST/DELETE vendor property assignments.
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

type Params = { params: Promise<{ vendorId: string }> };

/** POST /api/vendors/maintenance/[vendorId]/properties — assign vendor to a property */
export async function POST(request: NextRequest, { params }: Params) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { vendorId } = await params;
    const { property_id } = await request.json();
    if (!property_id) return NextResponse.json({ error: 'property_id required' }, { status: 400 });

    const { error } = await supabaseAdmin
        .from('vendor_property_assignments')
        .insert({ vendor_id: vendorId, property_id });

    if (error && error.code !== '23505') { // ignore duplicate
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}

/** DELETE /api/vendors/maintenance/[vendorId]/properties — remove vendor from a property */
export async function DELETE(request: NextRequest, { params }: Params) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { vendorId } = await params;
    const { property_id } = await request.json();
    if (!property_id) return NextResponse.json({ error: 'property_id required' }, { status: 400 });

    const { error } = await supabaseAdmin
        .from('vendor_property_assignments')
        .delete()
        .eq('vendor_id', vendorId)
        .eq('property_id', property_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
}
