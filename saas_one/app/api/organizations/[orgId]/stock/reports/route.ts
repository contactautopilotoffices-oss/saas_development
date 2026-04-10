/**
 * Org-level stock reports API.
 * Aggregated stock reports across all org properties.
 * GET /api/organizations/[orgId]/stock/reports
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const format = searchParams.get('format'); // 'csv' or 'json'
    const limit = parseInt(searchParams.get('limit') || '100');

    try {
        // Get all properties for this org
        const { data: properties, error: propError } = await supabase
            .from('properties')
            .select('id, name, code')
            .eq('organization_id', orgId);

        if (propError) {
            return NextResponse.json({ error: propError.message }, { status: 500 });
        }

        if (!properties || properties.length === 0) {
            if (format === 'csv') {
                return new NextResponse('property_name,property_code,report_date,total_items,low_stock_count,total_added,total_removed\n', {
                    headers: { 'Content-Type': 'text/csv' },
                });
            }
            return NextResponse.json({ success: true, reports: [] });
        }

        const propertyIds = properties.map(p => p.id);

        // Get reports for all properties
        let query = supabase
            .from('stock_reports')
            .select('*')
            .in('property_id', propertyIds)
            .order('report_date', { ascending: false })
            .limit(limit);

        if (startDate) {
            query = query.gte('report_date', startDate);
        }

        if (endDate) {
            query = query.lte('report_date', endDate);
        }

        const { data: reports, error: reportError } = await query;

        if (reportError) {
            return NextResponse.json({ error: reportError.message }, { status: 500 });
        }

        // Enrich reports with property names
        const enrichedReports = (reports || []).map(report => {
            const property = properties.find(p => p.id === report.property_id);
            return {
                ...report,
                property_name: property?.name || 'Unknown',
                property_code: property?.code || '',
            };
        });

        // If CSV export requested
        if (format === 'csv') {
            let csvContent = 'property_name,property_code,report_date,total_items,low_stock_count,total_added,total_removed\n';
            enrichedReports.forEach(report => {
                csvContent += `"${report.property_name}","${report.property_code}",${report.report_date},${report.total_items},${report.low_stock_count},${report.total_added},${report.total_removed}\n`;
            });

            return new NextResponse(csvContent, {
                headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="stock-reports-${new Date().toISOString().split('T')[0]}.csv"`,
                },
            });
        }

        return NextResponse.json({
            success: true,
            reports: enrichedReports,
            total: enrichedReports.length,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
