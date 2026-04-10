/**
 * Vendor data export for a property.
 * GET: Export vendor data as CSV/Excel.
 * Auth: Property Admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import * as XLSX from 'xlsx';

// GET: Export vendor revenue as Excel/CSV
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const vendorId = searchParams.get('vendorId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const format = searchParams.get('format') || 'xlsx'; // 'xlsx' | 'csv'

    // Build query
    let query = supabase
        .from('vendor_daily_revenue')
        .select(`
            revenue_date,
            revenue_amount,
            vendor:vendors(shop_name, owner_name, commission_rate)
        `)
        .eq('property_id', propertyId)
        .order('revenue_date', { ascending: true });

    if (vendorId) query = query.eq('vendor_id', vendorId);
    if (startDate) query = query.gte('revenue_date', startDate);
    if (endDate) query = query.lte('revenue_date', endDate);

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

    // Get current user for logging
    const { data: { user } } = await supabase.auth.getUser();

    // Log export
    await supabase.from('export_logs').insert({
        user_id: user?.id,
        user_role: 'property_admin',
        export_type: 'vendor_revenue',
        date_range_start: startDate,
        date_range_end: endDate,
        property_scope: [propertyId],
        file_format: format,
    });

    // Transform data
    const excelData = (data || []).map((row: any) => {
        const commissionAmount = (row.revenue_amount * (row.vendor?.commission_rate || 10) / 100).toFixed(2);
        return {
            'Date': new Date(row.revenue_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
            'Vendor': row.vendor?.owner_name || '-',
            'Shop Name': row.vendor?.shop_name || 'Unknown',
            'Property': property?.name || '-',
            'Revenue': `₹${Number(row.revenue_amount).toLocaleString('en-IN')}`,
            'Commission %': `${row.vendor?.commission_rate || 10}%`,
            'Commission Amount': `₹${Number(commissionAmount).toLocaleString('en-IN')}`,
        };
    });

    // Create workbook
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelData);

    // Set column widths
    ws['!cols'] = [
        { wch: 15 },  // Date
        { wch: 20 },  // Vendor
        { wch: 20 },  // Shop Name
        { wch: 20 },  // Property
        { wch: 15 },  // Revenue
        { wch: 12 },  // Commission %
        { wch: 18 },  // Commission Amount
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Vendor Revenue');

    // Generate buffer
    const buffer = XLSX.write(wb, {
        type: 'buffer',
        bookType: format === 'csv' ? 'csv' : 'xlsx'
    });

    // Create filename
    const propertyName = property?.name?.replace(/\s+/g, '_') || 'Property';
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `Vendor_Revenue_${propertyName}_${dateStr}.${format}`;
    const contentType = format === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${filename}"`,
        },
    });
}
