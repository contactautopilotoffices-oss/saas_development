/**
 * Grid Tariffs API
 * PRD: Time-versioned electricity tariff rates
 * Only kVAh unit type allowed (per PRD)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET: Fetch grid tariffs
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const date = searchParams.get('date');
    const includeHistory = searchParams.get('includeHistory') === 'true';

    console.log('[GridTariffs] GET request for property:', propertyId, { date, includeHistory });

    if (date && !includeHistory) {
        // Get active tariff for specific date using helper function
        const { data, error } = await supabase
            .rpc('get_active_grid_tariff', {
                p_property_id: propertyId,
                p_date: date
            });

        if (error) {
            console.error('[GridTariffs] Error fetching active tariff:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data?.[0] || null);
    }

    // Get all tariffs (with history)
    const { data, error } = await supabase
        .from('grid_tariffs')
        .select('*')
        .eq('property_id', propertyId)
        .order('effective_from', { ascending: false });

    if (error) {
        console.error('[GridTariffs] Error fetching tariffs:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST: Create a new tariff version
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const body = await request.json();

    console.log('[GridTariffs] POST request for property:', propertyId, body);

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate required fields
    if (!body.rate_per_unit || !body.effective_from) {
        return NextResponse.json({
            error: 'rate_per_unit and effective_from are required'
        }, { status: 400 });
    }

    // Close any existing active tariff (set effective_to)
    const effectiveFromDate = new Date(body.effective_from);
    const dayBefore = new Date(effectiveFromDate);
    dayBefore.setDate(dayBefore.getDate() - 1);

    await supabase
        .from('grid_tariffs')
        .update({ effective_to: dayBefore.toISOString().split('T')[0] })
        .eq('property_id', propertyId)
        .is('effective_to', null)
        .lt('effective_from', body.effective_from);

    // Create new tariff version
    const { data, error } = await supabase
        .from('grid_tariffs')
        .insert({
            property_id: propertyId,
            utility_provider: body.utility_provider || null,
            rate_per_unit: body.rate_per_unit,
            unit_type: 'kVAh', // Always kVAh per PRD
            effective_from: body.effective_from,
            effective_to: body.effective_to || null,
            created_by: user.id
        })
        .select()
        .single();

    if (error) {
        console.error('[GridTariffs] Error creating tariff:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[GridTariffs] Created new tariff version:', data.id);
    return NextResponse.json(data, { status: 201 });
}

// DELETE: Remove a tariff version
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const tariffId = searchParams.get('id');

    if (!tariffId) {
        return NextResponse.json({ error: 'Tariff ID is required' }, { status: 400 });
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[GridTariffs] DELETE request for tariff:', tariffId, 'property:', propertyId);

    // 1. Reset electricity readings associated with this tariff
    // We set computed_cost to 0 and tariff fields to NULL
    const { error: readingsError } = await supabase
        .from('electricity_readings')
        .update({
            tariff_id: null,
            tariff_rate_used: null,
            computed_cost: 0
        })
        .eq('tariff_id', tariffId);

    if (readingsError) {
        console.error('[GridTariffs] Error resetting readings:', readingsError.message);
        // We continue anyway to try and delete the tariff, or we could bail. 
        // Better to bail if we can't clean up associated data.
        return NextResponse.json({ error: 'Failed to clean up associated readings' }, { status: 500 });
    }

    // 2. Delete the tariff record
    const { error: deleteError } = await supabase
        .from('grid_tariffs')
        .delete()
        .eq('id', tariffId)
        .eq('property_id', propertyId);

    if (deleteError) {
        console.error('[GridTariffs] Error deleting tariff:', deleteError.message);
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 3. Maintenance: Restore continuity if needed
    // Look for a tariff that ended exactly when this one started
    // In POST, we set effective_to to (effective_from - 1 day)
    // This is complex to undo perfectly without knowing the full chain, 
    // but we can try to find the previous one and set its effective_to to NULL if it was closed.

    // For now, let's keep it simple as a first pass. 
    // The most important part is the deletion and cost clearing.

    return NextResponse.json({ success: true });
}
