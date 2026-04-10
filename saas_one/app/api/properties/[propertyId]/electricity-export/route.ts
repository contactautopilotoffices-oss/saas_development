/**
 * Electricity readings export API for a property.
 * GET: Export electricity readings as CSV/Excel.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET: Export electricity readings as CSV
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    console.log('[ElectricityExport] Exporting readings for property:', propertyId, { startDate, endDate });

    // Fetch property for filename
    const { data: property } = await supabase
        .from('properties')
        .select('name, code')
        .eq('id', propertyId)
        .single();

    // Build query
    let query = supabase
        .from('electricity_readings')
        .select(`
            reading_date,
            opening_reading,
            closing_reading,
            computed_units,
            final_units,
            peak_load_kw,
            notes,
            alert_status,
            created_at,
            meter:electricity_meters(name, meter_number, meter_type)
        `)
        .eq('property_id', propertyId)
        .order('reading_date', { ascending: false });

    if (startDate) query = query.gte('reading_date', startDate);
    if (endDate) query = query.lte('reading_date', endDate);

    const { data, error } = await query;

    if (error) {
        console.error('[ElectricityExport] Error fetching data:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Generate CSV
    const headers = [
        'Date',
        'Meter Name',
        'Meter Number',
        'Meter Type',
        'Opening Reading (Auto)',
        'Closing Reading',
        'Units Consumed (Multiplied)',
        'Peak Load (kW)',
        'Notes',
        'Alert Status',
        'Logged At'
    ];

    const rows = (data || []).map((r: any) => [
        r.reading_date,
        r.meter?.name || '',
        r.meter?.meter_number || '',
        r.meter?.meter_type || '',
        r.opening_reading,
        r.closing_reading,
        r.final_units ?? r.computed_units,
        r.peak_load_kw || '',
        (r.notes || '').replace(/,/g, ';'),
        r.alert_status,
        new Date(r.created_at).toLocaleString()
    ]);

    const csv = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const filename = `electricity_${property?.code || 'export'}_${startDate || 'all'}_to_${endDate || 'now'}.csv`;

    console.log('[ElectricityExport] Exporting', rows.length, 'rows to', filename);

    return new NextResponse(csv, {
        status: 200,
        headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    });
}
