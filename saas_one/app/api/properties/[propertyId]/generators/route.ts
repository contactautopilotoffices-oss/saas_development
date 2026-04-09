/**
 * Generator/DG management for a property.
 * GET: List generators | POST: Create generator.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET: Fetch all generators for a property
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('generators')
        .select('*')
        .eq('property_id', propertyId)
        .order('name', { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST: Create a new generator
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const body = await request.json();

    const { data, error } = await supabase
        .from('generators')
        .insert({
            property_id: propertyId,
            name: body.name,
            make: body.make || null,
            capacity_kva: body.capacity_kva || null,
            tank_capacity_litres: body.tank_capacity_litres || 1000,
            status: body.status || 'active',
            initial_kwh_reading: body.initial_kwh_reading || 0,
            initial_run_hours: body.initial_run_hours || 0,
            initial_diesel_level: body.initial_diesel_level || 0,
            effective_from_date: body.effective_from_date || new Date().toISOString().split('T')[0],
        })
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Record initial setup reading in history
    if (body.initial_kwh_reading > 0 || body.initial_run_hours > 0 || body.initial_diesel_level > 0) {
        const { error: readingError } = await supabase
            .from('diesel_readings')
            .insert({
                property_id: propertyId,
                generator_id: data.id,
                reading_date: body.effective_from_date || new Date().toISOString().split('T')[0],
                opening_hours: 0,
                closing_hours: body.initial_run_hours || 0,
                opening_kwh: 0,
                closing_kwh: body.initial_kwh_reading || 0,
                opening_diesel_level: 0,
                closing_diesel_level: body.initial_diesel_level || 0,
                diesel_added_litres: 0,
                computed_consumed_litres: body.initial_diesel_level || 0, // Baseline "consumed" up to now
                notes: 'Initial setup reading',
                created_by: (await supabase.auth.getUser()).data.user?.id
            });

        if (readingError) {
            console.error('[Generators] Error recording initial setup reading:', readingError.message);
        }
    }

    return NextResponse.json(data, { status: 201 });
}

// DELETE: Remove a generator
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const generatorId = searchParams.get('id');

    if (!generatorId) {
        return NextResponse.json({ error: 'Generator ID required' }, { status: 400 });
    }

    const { error } = await supabase
        .from('generators')
        .delete()
        .eq('id', generatorId)
        .eq('property_id', propertyId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
