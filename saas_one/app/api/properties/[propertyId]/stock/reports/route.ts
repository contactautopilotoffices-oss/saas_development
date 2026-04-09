/**
 * Stock reports for a property.
 * GET: Fetch stock level reports and analytics.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '30');

    try {
        let query = supabase
            .from('stock_reports')
            .select('*')
            .eq('property_id', propertyId)
            .order('report_date', { ascending: false })
            .limit(limit);

        if (startDate) {
            query = query.gte('report_date', startDate);
        }

        if (endDate) {
            query = query.lte('report_date', endDate);
        }

        const { data: reports, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            reports,
            total: reports?.length || 0,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { reportDate } = body;

        if (!reportDate) {
            return NextResponse.json({ error: 'reportDate is required' }, { status: 400 });
        }

        // Get property's org
        const { data: property, error: propError } = await supabase
            .from('properties')
            .select('organization_id')
            .eq('id', propertyId)
            .single();

        if (propError || !property) {
            return NextResponse.json({ error: 'Property not found' }, { status: 404 });
        }

        // Get all stock items for this property
        const { data: items, error: itemsError } = await supabase
            .from('stock_items')
            .select('*')
            .eq('property_id', propertyId);

        if (itemsError) {
            return NextResponse.json({ error: itemsError.message }, { status: 500 });
        }

        // Get movements for the report date
        const { data: movements, error: movError } = await supabase
            .from('stock_movements')
            .select('*')
            .eq('property_id', propertyId)
            .gte('created_at', `${reportDate}T00:00:00`)
            .lt('created_at', `${reportDate}T23:59:59`);

        if (movError) {
            return NextResponse.json({ error: movError.message }, { status: 500 });
        }

        // Calculate report data
        const totalItems = items?.length || 0;
        const lowStockCount = items?.filter(i => i.quantity < (i.min_threshold || 10)).length || 0;

        const movements_list = movements || [];
        const totalAdded = movements_list
            .filter(m => m.action === 'add')
            .reduce((sum, m) => sum + m.quantity_change, 0);
        const totalRemoved = Math.abs(
            movements_list
                .filter(m => m.action === 'remove')
                .reduce((sum, m) => sum + m.quantity_change, 0)
        );

        const reportData = {
            totalItems,
            lowStockCount,
            totalAdded,
            totalRemoved,
            items: items?.map(i => ({
                id: i.id,
                name: i.name,
                quantity: i.quantity,
                minThreshold: i.min_threshold,
            })) || [],
        };

        // Upsert report (if exists, update; if not, insert)
        const { data: report, error: reportError } = await supabase
            .from('stock_reports')
            .upsert({
                property_id: propertyId,
                organization_id: property.organization_id,
                report_date: reportDate,
                total_items: totalItems,
                low_stock_count: lowStockCount,
                total_added: totalAdded,
                total_removed: totalRemoved,
                report_data: reportData,
                generated_by: user.id,
                generated_at: new Date().toISOString(),
            })
            .select()
            .single();

        if (reportError) {
            return NextResponse.json({ error: reportError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, report }, { status: 201 });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
