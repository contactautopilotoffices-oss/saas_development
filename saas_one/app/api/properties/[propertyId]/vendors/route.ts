/**
 * Property-level vendor management.
 * GET: List vendors at property | POST: Add vendor to property.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

// GET: Fetch all vendors for a property
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('vendors')
        .select(`
            *,
            vendor_daily_revenue (
                id,
                revenue_amount,
                revenue_date
            )
        `)
        .eq('property_id', propertyId)
        .order('shop_name', { ascending: true });

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// POST: Create a new vendor (onboard)
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const body = await request.json();

    // Create vendor
    const { data: vendor, error: vendorError } = await supabase
        .from('vendors')
        .insert({
            property_id: propertyId,
            user_id: body.user_id || null,
            shop_name: body.shop_name,
            owner_name: body.owner_name || null,
            commission_rate: body.commission_rate || 10,
            payment_gateway_enabled: body.payment_gateway_enabled || false,
            status: 'active',
        })
        .select()
        .single();

    if (vendorError) {
        return NextResponse.json({ error: vendorError.message }, { status: 500 });
    }

    // Initialize first commission cycle (15-day)
    const today = new Date();
    const cycleStart = new Date(today);
    const cycleEnd = new Date(today);
    cycleEnd.setDate(cycleEnd.getDate() + 14); // 15-day cycle

    await supabase.from('commission_cycles').insert({
        vendor_id: vendor.id,
        property_id: propertyId,
        cycle_number: 1,
        cycle_start: cycleStart.toISOString().split('T')[0],
        cycle_end: cycleEnd.toISOString().split('T')[0],
        commission_rate: body.commission_rate || 10,
        status: 'in_progress',
    });

    return NextResponse.json(vendor, { status: 201 });
}

// PATCH: Update vendor
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const body = await request.json();

    if (!body.id) {
        return NextResponse.json({ error: 'Vendor ID required' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('vendors')
        .update({
            shop_name: body.shop_name,
            owner_name: body.owner_name,
            commission_rate: body.commission_rate,
            payment_gateway_enabled: body.payment_gateway_enabled,
            status: body.status,
            updated_at: new Date().toISOString(),
        })
        .eq('id', body.id)
        .eq('property_id', propertyId)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
}

// DELETE: Remove vendor
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const vendorId = searchParams.get('id');

    if (!vendorId) {
        return NextResponse.json({ error: 'Vendor ID required' }, { status: 400 });
    }

    const { error } = await supabase
        .from('vendors')
        .delete()
        .eq('id', vendorId)
        .eq('property_id', propertyId);

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
