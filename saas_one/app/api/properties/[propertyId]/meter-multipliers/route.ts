/**
 * Meter Multipliers API
 * PRD: Time-versioned multipliers for CT/PT ratios
 * All roles can edit (per PRD: "Multiplier editing open to all roles")
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET: Fetch multipliers for a meter
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const meterId = searchParams.get('meterId');
    const date = searchParams.get('date'); // For fetching active multiplier on specific date
    const includeHistory = searchParams.get('includeHistory') === 'true';

    console.log('[MeterMultipliers] GET request for property:', propertyId, { meterId, date, includeHistory });

    // If meterId provided, get multipliers for that meter
    if (meterId) {
        if (date && !includeHistory) {
            // Get active multiplier for specific date using helper function
            const { data, error } = await supabase
                .rpc('get_active_multiplier', {
                    p_meter_id: meterId,
                    p_date: date
                });

            if (error) {
                console.error('[MeterMultipliers] Error fetching active multiplier:', error.message);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json(data?.[0] || null);
        }

        // Get all multipliers for this meter (with history)
        const { data, error } = await supabase
            .from('meter_multipliers')
            .select('*')
            .eq('meter_id', meterId)
            .order('effective_from', { ascending: false });

        if (error) {
            console.error('[MeterMultipliers] Error fetching multipliers:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    }

    // Get all multipliers for all meters in this property
    const { data: meters } = await supabase
        .from('electricity_meters')
        .select('id')
        .eq('property_id', propertyId);

    if (!meters || meters.length === 0) {
        return NextResponse.json([]);
    }

    const meterIds = meters.map(m => m.id);

    const { data, error } = await supabase
        .from('meter_multipliers')
        .select(`
            *,
            meter:electricity_meters(id, name, meter_number)
        `)
        .in('meter_id', meterIds)
        .order('effective_from', { ascending: false });

    if (error) {
        console.error('[MeterMultipliers] Error fetching all multipliers:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST: Create a new multiplier version (never overwrite existing)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const body = await request.json();

    console.log('[MeterMultipliers] POST request for property:', propertyId, body);

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate required fields
    if (!body.meter_id || !body.effective_from) {
        return NextResponse.json({
            error: 'meter_id and effective_from are required'
        }, { status: 400 });
    }

    // Verify meter belongs to this property
    const { data: meter } = await supabase
        .from('electricity_meters')
        .select('id, property_id')
        .eq('id', body.meter_id)
        .eq('property_id', propertyId)
        .single();

    if (!meter) {
        return NextResponse.json({
            error: 'Meter not found in this property'
        }, { status: 404 });
    }

    // Check for existing multiplier on same date -> Update instead of Insert
    const { data: existing } = await supabase
        .from('meter_multipliers')
        .select('*')
        .eq('meter_id', body.meter_id)
        .eq('effective_from', body.effective_from)
        .single();

    if (existing) {
        console.log('[MeterMultipliers] Updating existing multiplier for date:', body.effective_from);
        const { data, error } = await supabase
            .from('meter_multipliers')
            .update({
                ct_ratio_primary: body.ct_ratio_primary || existing.ct_ratio_primary,
                ct_ratio_secondary: body.ct_ratio_secondary || existing.ct_ratio_secondary,
                pt_ratio_primary: body.pt_ratio_primary || existing.pt_ratio_primary,
                pt_ratio_secondary: body.pt_ratio_secondary || existing.pt_ratio_secondary,
                meter_constant: body.meter_constant || existing.meter_constant,
                multiplier_value: body.multiplier_value || existing.multiplier_value, // Ensure value is updated
                reason: body.reason || existing.reason,
                // Do not change effective_from or created_by
            })
            .eq('id', existing.id)
            .select()
            .single();

        if (error) {
            console.error('[MeterMultipliers] Error updating multiplier:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
        return NextResponse.json(data);
    }

    // Close any existing active multiplier (set effective_to)
    const effectiveFromDate = new Date(body.effective_from);
    const dayBefore = new Date(effectiveFromDate);
    dayBefore.setDate(dayBefore.getDate() - 1);

    await supabase
        .from('meter_multipliers')
        .update({ effective_to: dayBefore.toISOString().split('T')[0] })
        .eq('meter_id', body.meter_id)
        .is('effective_to', null)
        .lt('effective_from', body.effective_from);

    // Create new multiplier version
    const { data, error } = await supabase
        .from('meter_multipliers')
        .insert({
            meter_id: body.meter_id,
            ct_ratio_primary: body.ct_ratio_primary || 200,
            ct_ratio_secondary: body.ct_ratio_secondary || 5,
            pt_ratio_primary: body.pt_ratio_primary || 11000,
            pt_ratio_secondary: body.pt_ratio_secondary || 110,
            meter_constant: body.meter_constant,
            multiplier_value: body.multiplier_value, // Explicitly save the value
            effective_from: body.effective_from,
            effective_to: body.effective_to || null,
            reason: body.reason || null,
            created_by: user.id
        })
        .select()
        .single();

    if (error) {
        console.error('[MeterMultipliers] Error creating multiplier:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[MeterMultipliers] Created new multiplier version:', data.id);
    return NextResponse.json(data, { status: 201 });
}
