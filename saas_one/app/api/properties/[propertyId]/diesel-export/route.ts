/**
 * Diesel register export API for a property.
 * GET: Export diesel readings as CSV/Excel.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import * as XLSX from 'xlsx';

// GET: Export diesel readings as Excel (DG-2 format)
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

    // Build query
    let query = supabase
        .from('diesel_readings')
        .select(`
            reading_date,
            opening_hours,
            diesel_added_litres,
            closing_hours,
            computed_run_hours,
            computed_consumed_litres,
            notes,
            generator:generators(name)
        `)
        .eq('property_id', propertyId)
        .order('reading_date', { ascending: true });

    if (startDate) query = query.gte('reading_date', startDate);
    if (endDate) query = query.lte('reading_date', endDate);
    if (generatorId) query = query.eq('generator_id', generatorId);

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get property name for filename
    const { data: property } = await supabase
        .from('properties')
        .select('name')
        .eq('id', propertyId)
        .single();

    // Transform data to DG-2 format
    const excelData = (data || []).map((row: any) => ({
        'Date': new Date(row.reading_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }),
        'DG': row.generator?.name || 'Unknown',
        'Opening (H)': row.opening_hours,
        'Added (L)': row.diesel_added_litres,
        'Closing (H)': row.closing_hours,
        'Run Time': row.computed_run_hours ? `${row.computed_run_hours}h` : '-',
        'Consumption (L)': row.computed_consumed_litres || '-',
        'Notes': row.notes || '',
    }));

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
        { wch: 10 },  // Date
        { wch: 8 },   // DG
        { wch: 12 },  // Opening
        { wch: 10 },  // Added
        { wch: 12 },  // Closing
        { wch: 10 },  // Run Time
        { wch: 15 },  // Consumption
        { wch: 25 },  // Notes
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Diesel Readings');

    // Generate buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    // Create filename
    const propertyName = property?.name?.replace(/\s+/g, '_') || 'Property';
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Diesel_Report_${propertyName}_${dateStr}.xlsx`;

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    });
}
