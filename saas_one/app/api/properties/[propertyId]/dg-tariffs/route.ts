/**
 * DG (Diesel Generator) Tariffs API
 * PRD: Time-versioned diesel cost rates per generator
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET: Fetch DG tariffs
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const generatorId = searchParams.get('generatorId');
    const date = searchParams.get('date');
    const includeHistory = searchParams.get('includeHistory') === 'true';

    console.log('[DGTariffs] GET request for property:', propertyId, { generatorId, date, includeHistory });

    // If generatorId provided, get tariffs for that generator
    if (generatorId) {
        if (date && !includeHistory) {
            // Get active tariff for specific date using helper function
            const { data, error } = await supabase
                .rpc('get_active_dg_tariff', {
                    p_generator_id: generatorId,
                    p_date: date
                });

            if (error) {
                console.error('[DGTariffs] Error fetching active tariff:', error.message);
                return NextResponse.json({ error: error.message }, { status: 500 });
            }

            return NextResponse.json(data?.[0] || null);
        }

        // Get all tariffs for this generator (with history)
        const { data, error } = await supabase
            .from('dg_tariffs')
            .select('*')
            .eq('generator_id', generatorId)
            .order('effective_from', { ascending: false });

        if (error) {
            console.error('[DGTariffs] Error fetching tariffs:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json(data);
    }

    // Get all tariffs for all generators in this property
    const { data: generators } = await supabase
        .from('generators')
        .select('id')
        .eq('property_id', propertyId);

    if (!generators || generators.length === 0) {
        return NextResponse.json([]);
    }

    const generatorIds = generators.map(g => g.id);

    const { data, error } = await supabase
        .from('dg_tariffs')
        .select(`
            *,
            generator:generators(id, name, make, capacity_kva)
        `)
        .in('generator_id', generatorIds)
        .order('effective_from', { ascending: false });

    if (error) {
        console.error('[DGTariffs] Error fetching all tariffs:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST: Create a new DG tariff version
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const body = await request.json();

    console.log('[DGTariffs] POST request for property:', propertyId, body);

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Validate required fields
    if (!body.generator_id || !body.cost_per_litre || !body.effective_from) {
        return NextResponse.json({
            error: 'generator_id, cost_per_litre, and effective_from are required'
        }, { status: 400 });
    }

    // Verify generator belongs to this property
    const { data: generator } = await supabase
        .from('generators')
        .select('id, property_id')
        .eq('id', body.generator_id)
        .eq('property_id', propertyId)
        .single();

    if (!generator) {
        return NextResponse.json({
            error: 'Generator not found in this property'
        }, { status: 404 });
    }

    // Close any existing active tariff (set effective_to)
    const effectiveFromDate = new Date(body.effective_from);
    const dayBefore = new Date(effectiveFromDate);
    dayBefore.setDate(dayBefore.getDate() - 1);

    await supabase
        .from('dg_tariffs')
        .update({ effective_to: dayBefore.toISOString().split('T')[0] })
        .eq('generator_id', body.generator_id)
        .is('effective_to', null)
        .lt('effective_from', body.effective_from);

    // Create new tariff version
    const { data, error } = await supabase
        .from('dg_tariffs')
        .insert({
            generator_id: body.generator_id,
            cost_per_litre: body.cost_per_litre,
            effective_from: body.effective_from,
            effective_to: body.effective_to || null,
            created_by: user.id
        })
        .select()
        .single();

    if (error) {
        console.error('[DGTariffs] Error creating tariff:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[DGTariffs] Created new tariff version:', data.id);
    return NextResponse.json(data, { status: 201 });
}
// DELETE: Remove a DG tariff version
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Tariff ID is required' }, { status: 400 });
    }

    // Get tariff details before deletion to find the generator
    const { data: tariffToDelete, error: fetchError } = await supabase
        .from('dg_tariffs')
        .select('generator_id, effective_from')
        .eq('id', id)
        .single();

    if (fetchError || !tariffToDelete) {
        return NextResponse.json({ error: 'Tariff not found' }, { status: 404 });
    }

    // Delete the tariff
    const { error: deleteError } = await supabase
        .from('dg_tariffs')
        .delete()
        .eq('id', id);

    if (deleteError) {
        console.error('[DGTariffs] Error deleting tariff:', deleteError.message);
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Recalibrate/Heal the timeline:
    // If there was a previous tariff that was closed because of this one, re-open it.
    // The previous tariff would have effective_to = (this.effective_from - 1)
    const effectiveFromDate = new Date(tariffToDelete.effective_from);
    const dayBefore = new Date(effectiveFromDate);
    dayBefore.setDate(dayBefore.getDate() - 1);
    const dayBeforeStr = dayBefore.toISOString().split('T')[0];

    await supabase
        .from('dg_tariffs')
        .update({ effective_to: null })
        .eq('generator_id', tariffToDelete.generator_id)
        .eq('effective_to', dayBeforeStr);

    console.log('[DGTariffs] Deleted tariff and recalibrated history for generator:', tariffToDelete.generator_id);
    return NextResponse.json({ success: true });
}
