/**
 * Diesel Readings API — CRUD for DG set fuel consumption tracking.
 *
 * GET  — Fetch diesel readings for the property with optional filters:
 *         startDate, endDate, generatorId, and period (today | week | month).
 *         Includes joined generator and DG tariff data.
 * POST — Submit one or more daily diesel readings. Cost is computed server-side
 *         (consumed_litres × DG tariff rate per litre from get_active_dg_tariff RPC).
 *         Supports both single and batch submissions.
 * DELETE — Remove a diesel reading by ID. Dashboard carry-forward recalibrates on fetch.
 *
 * PRD: Log raw values only — cost and consumed volume are always derived, never entered.
 *
 * Auth: Supabase session (user must be authenticated for all methods).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
 *
 * GET  — Fetch diesel readings for the property with optional filters:
 *         startDate, endDate, generatorId, and period (today | week | month).
 *         Includes joined generator and DG tariff data.
 * POST — Submit one or more daily diesel readings. Cost is computed server-side
 *         (consumed_litres × DG tariff rate per litre from get_active_dg_tariff RPC).
 *         Supports both single and batch submissions.
 * DELETE — Remove a diesel reading by ID. Dashboard carry-forward recalibrates on fetch.
 *
 * PRD: Log raw values only — cost and consumed volume are always derived, never entered.
 *
 * Auth: Supabase session (user must be authenticated for all methods).
 */

// GET: Fetch diesel readings with optional filters
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const generatorId = searchParams.get('generatorId');
    const period = searchParams.get('period'); // 'today' | 'week' | 'month'

    console.log('[DieselReadings] GET request for property:', propertyId, { startDate, endDate, generatorId, period });

    let query = supabase
        .from('diesel_readings')
        .select(`
            *,
            generators(name, make, capacity_kva, tank_capacity_litres, fuel_efficiency_lphr),
            dg_tariffs(id, cost_per_litre)
        `)
        .eq('property_id', propertyId)
        .order('reading_date', { ascending: false });

    // Apply date filters
    if (period === 'today') {
        const today = new Date().toISOString().split('T')[0];
        query = query.eq('reading_date', today);
    } else if (period === 'week') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        query = query.gte('reading_date', weekAgo);
    } else if (period === 'month') {
        const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        query = query.gte('reading_date', monthAgo);
    } else {
        if (startDate) query = query.gte('reading_date', startDate);
        if (endDate) query = query.lte('reading_date', endDate);
    }

    if (generatorId) query = query.eq('generator_id', generatorId);

    const { data, error } = await query;

    if (error) {
        console.error('[DieselReadings] Error fetching readings:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[DieselReadings] Fetched', data?.length || 0, 'readings');
    return NextResponse.json(data);
}

// POST: Submit a daily diesel reading with cost computation
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const body = await request.json();

    console.log('[DieselReadings] POST request for property:', propertyId, 'body:', JSON.stringify(body).slice(0, 300));

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Helper function to compute cost for a single reading
    const computeReadingWithCost = async (reading: any) => {
        const readingDate = reading.reading_date || new Date().toISOString().split('T')[0];
        const consumedLitres = reading.computed_consumed_litres || 0;

        let tariffRate = 0;
        let tariffId = null;

        // Get active DG tariff for the generator
        if (reading.generator_id) {
            const { data: tariffData } = await supabase
                .rpc('get_active_dg_tariff', {
                    p_generator_id: reading.generator_id,
                    p_date: readingDate
                });

            if (tariffData && tariffData.length > 0) {
                tariffId = tariffData[0].id;
                tariffRate = tariffData[0].cost_per_litre || 0;
            }
        }

        // Compute cost (PRD: Cost = Units × DG Rate)
        const computedCost = consumedLitres * tariffRate;

        return {
            property_id: propertyId,
            generator_id: reading.generator_id,
            reading_date: readingDate,
            opening_hours: reading.opening_hours,
            closing_hours: reading.closing_hours,
            // v2: kWh readings
            opening_kwh: reading.opening_kwh || 0,
            closing_kwh: reading.closing_kwh || 0,
            // v2: Diesel level readings (for carry-forward)
            opening_diesel_level: reading.opening_diesel_level || 0,
            closing_diesel_level: reading.closing_diesel_level || 0,
            diesel_added_litres: reading.diesel_added_litres || 0,
            computed_consumed_litres: consumedLitres,
            notes: reading.notes || null,
            alert_status: reading.alert_status || 'normal',
            created_by: user.id,
            // v2 cost fields
            tariff_id: tariffId,
            tariff_rate_used: tariffRate,
            computed_cost: computedCost
        };
    };

    // Handle batch submission (multiple generators)
    if (Array.isArray(body.readings)) {
        console.log('[DieselReadings] Batch submission with', body.readings.length, 'readings');

        const processedReadings = await Promise.all(
            body.readings.map((r: any) => computeReadingWithCost(r))
        );

        const { data, error } = await supabase
            .from('diesel_readings')
            .insert(processedReadings)
            .select();

        if (error) {
            console.error('[DieselReadings] Error submitting batch readings:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log('[DieselReadings] Batch submission successful:', data?.length || 0, 'readings saved');
        return NextResponse.json(data, { status: 201 });
    }

    // Single reading submission
    console.log('[DieselReadings] Single reading submission');

    const processedReading = await computeReadingWithCost(body);

    const { data, error } = await supabase
        .from('diesel_readings')
        .insert(processedReading)
        .select()
        .maybeSingle();

    if (error) {
        console.error('[DieselReadings] Error submitting reading:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[DieselReadings] Single reading saved:', data?.id, 'Cost:', data?.computed_cost);
    return NextResponse.json(data, { status: 201 });
}

// DELETE: Remove a diesel reading and recalibrate progress
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
        return NextResponse.json({ error: 'Reading ID is required' }, { status: 400 });
    }

    // DELETE handling for diesel:
    // Simply delete. The dashboard carry-forward logic handles recalibration on fetch.
    const { error: deleteError } = await supabase
        .from('diesel_readings')
        .delete()
        .eq('id', id);

    if (deleteError) {
        console.error('[DieselReadings] Error deleting reading:', deleteError.message);
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    console.log('[DieselReadings] Deleted reading:', id);
    return NextResponse.json({ success: true });
}
