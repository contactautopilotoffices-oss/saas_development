/**
 * Barcode generation for a stock item.
 * POST: Generate/regenerate barcode for item.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string; itemId: string }> }
) {
    const { propertyId, itemId } = await params;
    const supabase = await createClient();

    try {
        // Fetch the item to get barcode details
        const { data: item, error: fetchError } = await supabase
            .from('stock_items')
            .select('*')
            .eq('id', itemId)
            .eq('property_id', propertyId)
            .single();

        if (fetchError || !item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        if (!item.barcode) {
            return NextResponse.json({ error: 'No barcode generated for this item' }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            barcode: item.barcode,
            barcode_format: item.barcode_format || 'CODE128',
            qr_code_data: item.qr_code_data,
            item_name: item.name,
            item_code: item.item_code,
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
    { params }: { params: Promise<{ propertyId: string; itemId: string }> }
) {
    const { propertyId, itemId } = await params;
    const supabase = await createClient();

    try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch the item to verify ownership and get property details
        const { data: item, error: fetchError } = await supabase
            .from('stock_items')
            .select('*')
            .eq('id', itemId)
            .eq('property_id', propertyId)
            .single();

        if (fetchError || !item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        // Fetch property code for barcode generation
        const { data: property, error: propError } = await supabase
            .from('properties')
            .select('code')
            .eq('id', propertyId)
            .single();

        if (propError || !property) {
            return NextResponse.json({ error: 'Property not found' }, { status: 404 });
        }

        // Generate new barcode
        const newBarcode = property.code
            ? `${property.code.toUpperCase()}-ITEM-${(Date.now() * 1000 + Math.random()).toString().substring(0, 13)}`
            : `ITEM-${(Date.now() * 1000 + Math.random()).toString().substring(0, 13)}`;

        // Generate new QR code data
        const qrCodeData = {
            item_id: item.id,
            item_code: item.item_code,
            name: item.name,
            property_id: propertyId,
            barcode: newBarcode,
            regenerated_at: new Date().toISOString(),
        };

        // Update item with new barcode
        const { error: updateError } = await supabase
            .from('stock_items')
            .update({
                barcode: newBarcode,
                barcode_format: 'CODE128',
                qr_code_data: qrCodeData,
                barcode_generated_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', itemId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            barcode: newBarcode,
            qr_code_data: qrCodeData,
            message: 'Barcode regenerated successfully',
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
