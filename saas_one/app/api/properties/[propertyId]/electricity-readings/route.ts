/**
 * Property electricity readings API.
 * GET: List readings | POST: Record reading.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { WhatsAppService } from '@/backend/services/WhatsAppService';

/**
 * Electricity Readings API — CRUD for utility meter consumption tracking.
 *
 * GET  — Fetch electricity readings for the property with optional filters:
 *         startDate, endDate, meterId, and period (today | week | month).
 *         Includes joined meter, multiplier, grid tariff, and creator data.
 * POST — Submit one or more daily electricity readings. Units and cost are
 *         derived server-side: final_units = (closing − opening) × multiplier,
 *         computed_cost = final_units × active grid tariff rate. Supports both
 *         single and batch submissions with safe lookup-then-update semantics.
 * PATCH — Update an existing reading (e.g., manual verification or OCR override).
 *         Triggers a WhatsApp retake notification to the submitting user if
 *         ocr_status is set to 'retake'.
 * DELETE — Remove a reading and recalibrate the meter's last_reading pointer to
 *          the most recent remaining reading.
 *
 * PRD: Raw readings and multiplier are logged — cost is always derived, never entered.
 *
 * Auth: Supabase session (user must be authenticated for all methods).
 */

// GET: Fetch electricity readings with optional filters
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const meterId = searchParams.get('meterId');
    const period = searchParams.get('period'); // 'today' | 'week' | 'month'

    console.log('[ElectricityReadings] GET request for property:', propertyId, { startDate, endDate, meterId, period });

    let query = supabase
        .from('electricity_readings')
        .select(`
            *,
            meter:electricity_meters(name, meter_number, meter_type, max_load_kw),
            multiplier:meter_multipliers(id, multiplier_value, ct_ratio_primary, ct_ratio_secondary, pt_ratio_primary, pt_ratio_secondary),
            tariff:grid_tariffs(id, rate_per_unit, utility_provider),
            created_by_user:users(full_name)
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

    if (meterId) query = query.eq('meter_id', meterId);

    const { data, error } = await query;

    if (error) {
        console.error('[ElectricityReadings] Error fetching readings:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log('[ElectricityReadings] Fetched', data?.length || 0, 'readings');
    return NextResponse.json(data);
}

interface ReadingInput {
    meter_id: string;
    reading_date?: string;
    opening_reading?: number;
    closing_reading: number;
    multiplier_id?: string;
    multiplier_value_used?: number;
    notes?: string;
    alert_status?: string;
    photo_url?: string;
    ocr_reading?: number;
    ocr_confidence?: number;
    ocr_status?: string;
    ocr_raw_response?: Record<string, unknown>;
}

// POST: Submit a daily electricity reading with multiplier and cost computation
// Helper function to compute cost for a single reading
async function computeReadingWithCost(supabase: any, propertyId: string, reading: ReadingInput, userId: string) {
    const readingDate = reading.reading_date || new Date().toISOString().split('T')[0];
    const rawUnits = reading.closing_reading - (reading.opening_reading || 0);

    let multiplierValue = reading.multiplier_value_used || 1;
    let multiplierId = reading.multiplier_id;
    let tariffRate = 0;
    let tariffId = null;

    // Get active multiplier if not explicitly provided AND no value override was sent
    if (!multiplierId && !reading.multiplier_value_used && reading.meter_id) {
        const { data: multiplierData } = await supabase
            .rpc('get_active_multiplier', {
                p_meter_id: reading.meter_id,
                p_date: readingDate
            });

        if (multiplierData && multiplierData.length > 0) {
            multiplierId = multiplierData[0].id;
            multiplierValue = multiplierData[0].multiplier_value || 1;
        }
    } else if (multiplierId) {
        // Fetch the multiplier value
        const { data: mult } = await supabase
            .from('meter_multipliers')
            .select('multiplier_value')
            .eq('id', multiplierId)
            .single();

        if (mult) {
            multiplierValue = mult.multiplier_value || 1;
        }
    }

    // Get active tariff for the property
    const { data: tariffData } = await supabase
        .rpc('get_active_grid_tariff', {
            p_property_id: propertyId,
            p_date: readingDate
        });

    if (tariffData && tariffData.length > 0) {
        tariffId = tariffData[0].id;
        tariffRate = tariffData[0].rate_per_unit || 0;
    }

    // Compute final values (PRD: Cost = Units × Tariff × Multiplier)
    const finalUnits = rawUnits * multiplierValue;
    const computedCost = finalUnits * tariffRate;

    return {
        property_id: propertyId,
        meter_id: reading.meter_id,
        reading_date: readingDate,
        opening_reading: reading.opening_reading || 0,
        closing_reading: reading.closing_reading,
        notes: reading.notes || null,
        alert_status: reading.alert_status || 'normal',
        created_by: userId,
        // OCR Fields
        photo_url: reading.photo_url || null,
        ocr_reading: reading.ocr_reading || null,
        ocr_confidence: reading.ocr_confidence || null,
        ocr_status: reading.ocr_status || 'verified',
        ocr_raw_response: reading.ocr_raw_response || null,
        // New v2 fields
        multiplier_id: multiplierId,
        multiplier_value_used: multiplierValue,
        tariff_id: tariffId,
        tariff_rate_used: tariffRate,
        final_units: finalUnits,
        computed_cost: computedCost
    };
}

// POST: Submit a daily electricity reading with multiplier and cost computation
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const body = await request.json();

    console.log('[ElectricityReadings] POST request for property:', propertyId, 'body:', JSON.stringify(body).slice(0, 300));

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Handle batch submission (multiple meters)
    if (Array.isArray(body.readings)) {
        console.log('[ElectricityReadings] Batch submission with', body.readings.length, 'readings');

        const processedReadings = await Promise.all(
            body.readings.map((r: ReadingInput) => computeReadingWithCost(supabase, propertyId, r, user.id))
        );

        // 3.6 Store/Update Reading (Safe Lookup-then-Update)
        // This is more robust than upsert if the unique constraint is missing
        for (const reading of processedReadings) {
            const { data: existingReading } = await supabase
                .from('electricity_readings')
                .select('id')
                .eq('meter_id', reading.meter_id)
                .eq('reading_date', reading.reading_date)
                .maybeSingle();

            if (existingReading) {
                console.log('[ElectricityReadings] Updating existing batch reading:', existingReading.id);
                const { error: updateError } = await supabase
                    .from('electricity_readings')
                    .update(reading)
                    .eq('id', existingReading.id);
                if (updateError) throw updateError;
            } else {
                console.log('[ElectricityReadings] Creating new batch reading record');
                const { error: insertError } = await supabase
                    .from('electricity_readings')
                    .insert(reading);
                if (insertError) throw insertError;
            }
        }


        // Update last_reading on meters
        for (const r of body.readings) {
            await supabase
                .from('electricity_meters')
                .update({ last_reading: r.closing_reading, updated_at: new Date().toISOString() })
                .eq('id', r.meter_id);
        }

        console.log('[ElectricityReadings] Batch submission successful');
        return NextResponse.json({ success: true }, { status: 201 });
    }

    // Single reading submission
    console.log('[ElectricityReadings] Single reading submission');
    const processedReading = await computeReadingWithCost(supabase, propertyId, body, user.id);

    // 2. Store/Update Reading (Safe Lookup-then-Update)
    const { data: existingReading } = await supabase
        .from('electricity_readings')
        .select('id')
        .eq('meter_id', processedReading.meter_id)
        .eq('reading_date', processedReading.reading_date)
        .maybeSingle();

    let dbResult;
    if (existingReading) {
        console.log('[ElectricityReadings] Updating existing single reading:', existingReading.id);
        dbResult = await supabase
            .from('electricity_readings')
            .update(processedReading)
            .eq('id', existingReading.id)
            .select()
            .single();
    } else {
        console.log('[ElectricityReadings] Creating new single reading record');
        dbResult = await supabase
            .from('electricity_readings')
            .insert(processedReading)
            .select()
            .single();
    }

    if (dbResult.error) {
        console.error('[ElectricityReadings] Error submitting reading:', dbResult.error.message);
        return NextResponse.json({ error: dbResult.error.message }, { status: 500 });
    }

    const data = dbResult.data;

    // Update last_reading on meter
    await supabase
        .from('electricity_meters')
        .update({ last_reading: body.closing_reading, updated_at: new Date().toISOString() })
        .eq('id', body.meter_id);

    console.log('[ElectricityReadings] Single reading saved:', data?.id, 'Cost:', data?.computed_cost);
    return NextResponse.json(data, { status: 201 });
}

// PATCH: Update an existing reading (Verification / Manual Override)
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { id, ...updates } = await request.json();

    if (!id) {
        return NextResponse.json({ error: 'Reading ID is required' }, { status: 400 });
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[ElectricityReadings] PATCH request for reading:', id, 'updates:', updates);

    // 1. Fetch current reading to merge updates
    const { data: currentReading, error: fetchError } = await supabase
        .from('electricity_readings')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !currentReading) {
        return NextResponse.json({ error: 'Reading not found' }, { status: 404 });
    }

    // 2. Compute updated cost if closing_reading or multiplier fields change
    const mergedReading = { ...currentReading, ...updates };
    const processedReading = await computeReadingWithCost(supabase, propertyId, mergedReading, user.id);

    // 3. Update the database
    const { data, error } = await supabase
        .from('electricity_readings')
        .update(processedReading)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('[ElectricityReadings] Error updating reading:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 4. If verified, update meter's last reading; if retake, send notification
    if (updates.ocr_status === 'verified') {
        await supabase
            .from('electricity_meters')
            .update({ 
                last_reading: processedReading.closing_reading, 
                updated_at: new Date().toISOString() 
            })
            .eq('id', currentReading.meter_id);
    } else if (updates.ocr_status === 'retake' && currentReading.created_by) {
        // Fetch Admin Name & Meter Info for the text message
        const [{ data: adminData }, { data: meterData }] = await Promise.all([
            supabase.from('users').select('full_name').eq('id', user.id).single(),
            supabase.from('electricity_meters').select('name').eq('id', currentReading.meter_id).single()
        ]);
        
        const adminName = adminData?.full_name || 'An Administrator';
        const meterName = meterData?.name || 'A meter';
        const readingDate = new Date(currentReading.reading_date).toLocaleDateString();
        
        const message = `⚠️ *Action Required: Retake Meter Reading*\n\n${adminName} has requested a photo re-capture for the electricity reading you submitted for *${meterName}* on ${readingDate}.\n\nThe photo provided was either blurry, unreadable, or mismatched with the entered value. Please navigate to the property dashboard and re-take the reading photograph.`;
        
        // Fire & forget WhatsApp notification
        WhatsAppService.sendToUser(currentReading.created_by, { message }).catch(err => {
            console.error('[ElectricityReadings] Error sending WhatsApp retake notification:', err);
        });
    }

    return NextResponse.json(data);
}

// DELETE: Remove a reading
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const readingId = searchParams.get('id');

    if (!readingId) {
        return NextResponse.json({ error: 'Reading ID is required' }, { status: 400 });
    }

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[ElectricityReadings] DELETE request for reading:', readingId, 'property:', propertyId);

    // 1. Get the reading details first to know the meter_id and opening_reading
    const { data: readingData, error: fetchError } = await supabase
        .from('electricity_readings')
        .select('meter_id, opening_reading')
        .eq('id', readingId)
        .eq('property_id', propertyId)
        .single();

    if (fetchError || !readingData) {
        console.error('[ElectricityReadings] Error fetching reading before delete:', fetchError?.message);
        return NextResponse.json({ error: 'Reading not found' }, { status: 404 });
    }

    const { meter_id, opening_reading } = readingData;

    // 2. Delete the reading record
    const { error: deleteError } = await supabase
        .from('electricity_readings')
        .delete()
        .eq('id', readingId)
        .eq('property_id', propertyId);

    if (deleteError) {
        console.error('[ElectricityReadings] Error deleting reading:', deleteError.message);
        return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // 3. Recalibrate meter's last_reading
    // Find the new most recent reading for this meter
    const { data: latestReadings } = await supabase
        .from('electricity_readings')
        .select('closing_reading')
        .eq('meter_id', meter_id)
        .order('reading_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);

    // If no readings left, reset to 0
    const newLastReading = latestReadings && latestReadings.length > 0
        ? latestReadings[0].closing_reading
        : 0;

    console.log('[ElectricityReadings] Recalibrating meter:', meter_id, 'New last_reading:', newLastReading);

    await supabase
        .from('electricity_meters')
        .update({ last_reading: newLastReading, updated_at: new Date().toISOString() })
        .eq('id', meter_id);

    return NextResponse.json({ success: true });
}
