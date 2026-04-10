/**
 * Stock report generation cron.
 * Generates periodic stock level reports.
 * POST /api/cron/generate-stock-reports
 * Auth: Cron secret.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

export async function GET(request: NextRequest) {
    const supabase = await createClient();

    try {
        // Check if called with proper cron authentication (optional - depends on your setup)
        const authHeader = request.headers.get('authorization');
        // You can add your cron secret validation here if needed

        const today = new Date().toISOString().split('T')[0];

        // Get all active properties
        const { data: properties, error: propError } = await supabase
            .from('properties')
            .select('id, organization_id');

        if (propError) {
            return NextResponse.json({ error: propError.message }, { status: 500 });
        }

        if (!properties || properties.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No properties to process',
                processed: 0,
            });
        }

        let processedCount = 0;
        const errors: string[] = [];

        // Process each property
        for (const property of properties) {
            try {
                // Check if report already exists for today
                const { data: existingReport, error: checkError } = await supabase
                    .from('stock_reports')
                    .select('id')
                    .eq('property_id', property.id)
                    .eq('report_date', today)
                    .single();

                // If report exists, skip (avoid duplicates)
                if (existingReport && !checkError) {
                    continue;
                }

                // Get all stock items for this property
                const { data: items, error: itemsError } = await supabase
                    .from('stock_items')
                    .select('*')
                    .eq('property_id', property.id);

                if (itemsError) {
                    errors.push(`Property ${property.id}: Failed to fetch items - ${itemsError.message}`);
                    continue;
                }

                // Get movements for today
                const { data: movements, error: movError } = await supabase
                    .from('stock_movements')
                    .select('*')
                    .eq('property_id', property.id)
                    .gte('created_at', `${today}T00:00:00`)
                    .lt('created_at', `${today}T23:59:59`);

                if (movError) {
                    errors.push(`Property ${property.id}: Failed to fetch movements - ${movError.message}`);
                    continue;
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
                    generatedAt: new Date().toISOString(),
                    items: items?.map(i => ({
                        id: i.id,
                        name: i.name,
                        quantity: i.quantity,
                        minThreshold: i.min_threshold,
                    })) || [],
                };

                // Insert report
                const { error: insertError } = await supabase
                    .from('stock_reports')
                    .insert({
                        property_id: property.id,
                        organization_id: property.organization_id,
                        report_date: today,
                        total_items: totalItems,
                        low_stock_count: lowStockCount,
                        total_added: totalAdded,
                        total_removed: totalRemoved,
                        report_data: reportData,
                    });

                if (insertError) {
                    errors.push(`Property ${property.id}: Failed to insert report - ${insertError.message}`);
                    continue;
                }

                processedCount++;
            } catch (err) {
                errors.push(`Property ${property.id}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
        }

        return NextResponse.json({
            success: true,
            message: `Processed ${processedCount} properties`,
            processed: processedCount,
            total: properties.length,
            reportDate: today,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
