/**
 * Vendor revenue/commission tracking for a property.
 * GET: Fetch vendor revenue records.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET: Fetch vendor revenue entries with optional filters
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
    const period = searchParams.get('period'); // 'today' | 'month' | 'year'

    // Use entry_date as the primary date column as per user schema
    let query = supabase
        .from('vendor_daily_revenue')
        .select(`
            *,
            vendor:vendors(shop_name, owner_name, commission_rate)
        `)
        .eq('property_id', propertyId)
        .order('entry_date', { ascending: false });

    // Apply vendor filter
    if (vendorId) {
        query = query.eq('vendor_id', vendorId);
    }

    // Apply date filters to entry_date
    if (period === 'today') {
        const today = new Date().toISOString().split('T')[0];
        query = query.eq('entry_date', today);
    } else if (period === 'month') {
        const monthStart = new Date();
        monthStart.setDate(1);
        query = query.gte('entry_date', monthStart.toISOString().split('T')[0]);
    } else if (period === 'year') {
        const yearStart = new Date();
        yearStart.setMonth(0, 1);
        query = query.gte('entry_date', yearStart.toISOString().split('T')[0]);
    } else {
        if (startDate) query = query.gte('entry_date', startDate);
        if (endDate) query = query.lte('entry_date', endDate);
    }

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST: Submit or update daily revenue entry
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    try {
        const { propertyId } = await params;
        const supabase = await createClient();
        const body = await request.json();

        if (!body.vendor_id || body.revenue_amount === undefined) {
            return NextResponse.json({ error: 'Vendor ID and revenue amount are required' }, { status: 400 });
        }

        const today = new Date().toISOString().split('T')[0];
        const targetDate = body.revenue_date || today;
        const revenueAmount = Number(body.revenue_amount);

        // 1. Try to find an existing entry for this vendor and date
        // Based on user schema, the unique constraint is on entry_date
        const { data: existingEntry, error: fetchError } = await supabase
            .from('vendor_daily_revenue')
            .select('id, revenue_amount')
            .eq('vendor_id', body.vendor_id)
            .eq('entry_date', targetDate)
            .maybeSingle();

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        let revenueRecord = null;
        let difference = revenueAmount;

        if (existingEntry) {
            // UPDATE existing entry
            difference = revenueAmount - (Number(existingEntry.revenue_amount) || 0);
            const { data: updated, error: updateError } = await supabase
                .from('vendor_daily_revenue')
                .update({
                    revenue_amount: revenueAmount,
                    revenue_date: targetDate, // Filling both just in case
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingEntry.id)
                .select()
                .maybeSingle();

            if (updateError) {
                return NextResponse.json({ error: updateError.message }, { status: 500 });
            }
            revenueRecord = updated;
        } else {
            // INSERT new entry
            const { data: inserted, error: insertError } = await supabase
                .from('vendor_daily_revenue')
                .insert({
                    vendor_id: body.vendor_id,
                    property_id: propertyId,
                    revenue_amount: revenueAmount,
                    revenue_date: targetDate, // Earned date
                    entry_date: targetDate,   // The unique constraint column
                })
                .select()
                .maybeSingle();

            if (insertError) {
                // Handle race condition (duplicate key)
                if (insertError.code === '23505') {
                    const { data: retryEntry } = await supabase
                        .from('vendor_daily_revenue')
                        .select('id, revenue_amount')
                        .eq('vendor_id', body.vendor_id)
                        .eq('entry_date', targetDate)
                        .maybeSingle();

                    if (retryEntry) {
                        difference = revenueAmount - (Number(retryEntry.revenue_amount) || 0);
                        const { data: updated, error: retryUpdateError } = await supabase
                            .from('vendor_daily_revenue')
                            .update({
                                revenue_amount: revenueAmount,
                                revenue_date: targetDate
                            })
                            .eq('id', retryEntry.id)
                            .select()
                            .maybeSingle();

                        if (retryUpdateError) return NextResponse.json({ error: retryUpdateError.message }, { status: 500 });
                        revenueRecord = updated;
                    }
                } else {
                    return NextResponse.json({ error: insertError.message }, { status: 500 });
                }
            } else {
                revenueRecord = inserted;
            }
        }

        // 2. RLS Selection fallback
        if (!revenueRecord) {
            revenueRecord = {
                id: existingEntry?.id || 'synthetic-id',
                vendor_id: body.vendor_id,
                revenue_amount: revenueAmount,
                entry_date: targetDate,
                revenue_date: targetDate,
                synthetic: true
            };
        }

        // 3. Update the 'in_progress' commission cycle with the difference
        const { data: activeCycle } = await supabase
            .from('commission_cycles')
            .select('id, total_revenue, commission_rate')
            .eq('vendor_id', body.vendor_id)
            .eq('status', 'in_progress')
            .maybeSingle();

        if (activeCycle) {
            const currentTotal = Number(activeCycle.total_revenue) || 0;
            const newTotal = currentTotal + difference;
            const newCommission = newTotal * (Number(activeCycle.commission_rate) / 100);

            await supabase
                .from('commission_cycles')
                .update({
                    total_revenue: newTotal,
                    commission_due: newCommission,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', activeCycle.id);
        }

        return NextResponse.json(revenueRecord, { status: 201 });
    } catch (err: any) {
        return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
    }
}
