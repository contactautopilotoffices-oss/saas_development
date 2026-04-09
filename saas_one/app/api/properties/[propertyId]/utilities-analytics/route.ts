/**
 * Utilities analytics dashboard data for a property.
 * GET: Fetch aggregated diesel/electricity/utility analytics.
 * Auth: Property Admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * Utilities Analytics API
 * PRD: Single analytics page, scope-driven
 * PRD: Combined + Meter-wise views
 * PRD: Today / 30-day toggle
 */

// GET: Fetch aggregated analytics data
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const utilityType = searchParams.get('type') || 'electricity'; // 'electricity' | 'diesel' | 'combined'
    const scope = searchParams.get('scope') || 'combined'; // 'combined' | 'meter-wise'
    const period = searchParams.get('period') || 'month'; // 'today' | 'month' (30 days)
    const meterId = searchParams.get('meterId'); // For meter-wise view
    const generatorId = searchParams.get('generatorId'); // For generator-wise view

    console.log('[UtilitiesAnalytics] GET request:', { propertyId, utilityType, scope, period, meterId, generatorId });

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const startDate = period === 'today' ? today : thirtyDaysAgo;
    const endDate = today;

    try {
        let electricityData = null;
        let dieselData = null;

        // Fetch Electricity Analytics
        if (utilityType === 'electricity' || utilityType === 'combined') {
            let electricityQuery = supabase
                .from('electricity_readings')
                .select(`
                    id,
                    reading_date,
                    computed_units,
                    final_units,
                    computed_cost,
                    multiplier_value_used,
                    tariff_rate_used,
                    meter:electricity_meters(id, name, meter_number, meter_type)
                `)
                .eq('property_id', propertyId)
                .gte('reading_date', startDate)
                .lte('reading_date', endDate)
                .order('reading_date', { ascending: true });

            if (scope === 'meter-wise' && meterId) {
                electricityQuery = electricityQuery.eq('meter_id', meterId);
            }

            const { data, error } = await electricityQuery;

            if (error) {
                console.error('[UtilitiesAnalytics] Error fetching electricity data:', error.message);
            } else {
                // Aggregate data
                const totalUnits = data?.reduce((sum, r) => sum + (r.final_units || r.computed_units || 0), 0) || 0;
                const totalCost = data?.reduce((sum, r) => sum + (r.computed_cost || 0), 0) || 0;

                // Today's data
                const todayReadings = data?.filter(r => r.reading_date === today) || [];
                const todayUnits = todayReadings.reduce((sum, r) => sum + (r.final_units || r.computed_units || 0), 0);
                const todayCost = todayReadings.reduce((sum, r) => sum + (r.computed_cost || 0), 0);

                // Group by date for trends
                const dailyTrends = data?.reduce((acc: any, r) => {
                    const date = r.reading_date;
                    if (!acc[date]) {
                        acc[date] = { date, units: 0, cost: 0 };
                    }
                    acc[date].units += r.final_units || r.computed_units || 0;
                    acc[date].cost += r.computed_cost || 0;
                    return acc;
                }, {});

                // Group by meter for breakdown
                const meterBreakdown = data?.reduce((acc: any, r) => {
                    // Cast embedded relation to single object (Supabase returns single for many-to-one)
                    const meter = r.meter as unknown as { id: string; name: string; meter_type?: string } | null;
                    const meterName = meter?.name || 'Unknown';
                    const meterId = meter?.id || 'unknown';
                    if (!acc[meterId]) {
                        acc[meterId] = {
                            id: meterId,
                            name: meterName,
                            meter_type: meter?.meter_type,
                            units: 0,
                            cost: 0
                        };
                    }
                    acc[meterId].units += r.final_units || r.computed_units || 0;
                    acc[meterId].cost += r.computed_cost || 0;
                    return acc;
                }, {});

                electricityData = {
                    summary: {
                        totalUnits: Math.round(totalUnits * 100) / 100,
                        totalCost: Math.round(totalCost * 100) / 100,
                        todayUnits: Math.round(todayUnits * 100) / 100,
                        todayCost: Math.round(todayCost * 100) / 100,
                        unitLabel: 'kVAh',
                        loggingDate: today
                    },
                    trends: Object.values(dailyTrends || {}),
                    breakdown: Object.values(meterBreakdown || {}),
                    readingCount: data?.length || 0
                };
            }
        }

        // Fetch Diesel Analytics
        if (utilityType === 'diesel' || utilityType === 'combined') {
            let dieselQuery = supabase
                .from('diesel_readings')
                .select(`
                    id,
                    reading_date,
                    computed_consumed_litres,
                    computed_cost,
                    tariff_rate_used,
                    generator:generators(id, name, make, capacity_kva)
                `)
                .eq('property_id', propertyId)
                .gte('reading_date', startDate)
                .lte('reading_date', endDate)
                .order('reading_date', { ascending: true });

            if (scope === 'meter-wise' && generatorId) {
                dieselQuery = dieselQuery.eq('generator_id', generatorId);
            }

            const { data, error } = await dieselQuery;

            if (error) {
                console.error('[UtilitiesAnalytics] Error fetching diesel data:', error.message);
            } else {
                // Aggregate data
                const totalUnits = data?.reduce((sum, r) => sum + (r.computed_consumed_litres || 0), 0) || 0;
                const totalCost = data?.reduce((sum, r) => sum + (r.computed_cost || 0), 0) || 0;

                // Today's data
                const todayReadings = data?.filter(r => r.reading_date === today) || [];
                const todayUnits = todayReadings.reduce((sum, r) => sum + (r.computed_consumed_litres || 0), 0);
                const todayCost = todayReadings.reduce((sum, r) => sum + (r.computed_cost || 0), 0);

                // Group by date for trends
                const dailyTrends = data?.reduce((acc: any, r) => {
                    const date = r.reading_date;
                    if (!acc[date]) {
                        acc[date] = { date, units: 0, cost: 0 };
                    }
                    acc[date].units += r.computed_consumed_litres || 0;
                    acc[date].cost += r.computed_cost || 0;
                    return acc;
                }, {});

                // Group by generator for breakdown
                const generatorBreakdown = data?.reduce((acc: any, r) => {
                    // Cast embedded relation to single object (Supabase returns single for many-to-one)
                    const generator = r.generator as unknown as { id: string; name: string; make?: string; capacity_kva?: number } | null;
                    const generatorName = generator?.name || 'Unknown';
                    const genId = generator?.id || 'unknown';
                    if (!acc[genId]) {
                        acc[genId] = {
                            id: genId,
                            name: generatorName,
                            make: generator?.make,
                            capacity_kva: generator?.capacity_kva,
                            units: 0,
                            cost: 0
                        };
                    }
                    acc[genId].units += r.computed_consumed_litres || 0;
                    acc[genId].cost += r.computed_cost || 0;
                    return acc;
                }, {});

                dieselData = {
                    summary: {
                        totalUnits: Math.round(totalUnits * 100) / 100,
                        totalCost: Math.round(totalCost * 100) / 100,
                        todayUnits: Math.round(todayUnits * 100) / 100,
                        todayCost: Math.round(todayCost * 100) / 100,
                        unitLabel: 'Litres',
                        loggingDate: today
                    },
                    trends: Object.values(dailyTrends || {}),
                    breakdown: Object.values(generatorBreakdown || {}),
                    readingCount: data?.length || 0
                };
            }
        }

        // Combined response
        const response: any = {
            period: { start: startDate, end: endDate, type: period },
            scope
        };

        if (utilityType === 'combined') {
            response.electricity = electricityData;
            response.diesel = dieselData;

            // Combined totals
            const combinedCost = (electricityData?.summary?.totalCost || 0) + (dieselData?.summary?.totalCost || 0);
            const combinedTodayCost = (electricityData?.summary?.todayCost || 0) + (dieselData?.summary?.todayCost || 0);

            response.combined = {
                totalCost: Math.round(combinedCost * 100) / 100,
                todayCost: Math.round(combinedTodayCost * 100) / 100,
                gridCost: electricityData?.summary?.totalCost || 0,
                dgCost: dieselData?.summary?.totalCost || 0
            };
        } else if (utilityType === 'electricity') {
            response.electricity = electricityData;
        } else {
            response.diesel = dieselData;
        }

        return NextResponse.json(response);

    } catch (error: any) {
        console.error('[UtilitiesAnalytics] Error:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
