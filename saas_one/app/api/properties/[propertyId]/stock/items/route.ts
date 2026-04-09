/**
 * Property stock items API.
 * GET: List items | POST: Create item.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';

/**
 * Stock Items CRUD API for a given property.
 *
 * GET  — List stock items with optional filtering by category, barcode, or low-stock flag.
 * POST — Create a new stock item, record an initial stock_movement entry, and
 *        auto-generate a barcode with a CODE128 barcode image via Python script.
 * DELETE — Remove one or more stock items by ID (stock_movements retain item_id as NULL
 *          via FK constraint).
 *
 * Auth: Supabase session (user must be authenticated for all methods).
 */

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    const category = searchParams.get('category');
    const lowStockOnly = searchParams.get('lowStockOnly') === 'true';
    const barcode = searchParams.get('barcode');

    try {
        let query = supabase
            .from('stock_items')
            .select('*')
            .eq('property_id', propertyId)
            .order('name', { ascending: true });

        if (category) {
            query = query.eq('category', category);
        }

        if (barcode) {
            query = query.or(`barcode.eq.${barcode},item_code.eq.${barcode}`);
        }

        const { data: items, error } = await query;

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        // Filter low stock if requested
        let filteredItems = items || [];
        if (lowStockOnly) {
            filteredItems = filteredItems.filter(item => item.quantity < (item.min_threshold || 10));
        }

        return NextResponse.json({
            success: true,
            items: filteredItems,
            total: filteredItems.length,
        });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export async function DELETE(
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
        const { itemIds } = body;

        if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
            return NextResponse.json(
                { error: 'itemIds array is required' },
                { status: 400 }
            );
        }

        // Verify all items belong to this property
        const { data: existingItems, error: fetchError } = await supabase
            .from('stock_items')
            .select('id')
            .eq('property_id', propertyId)
            .in('id', itemIds);

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        const validIds = (existingItems || []).map(i => i.id);
        if (validIds.length === 0) {
            return NextResponse.json({ error: 'No matching items found' }, { status: 404 });
        }

        // Delete items (stock_movements will have item_id set to NULL via FK constraint)
        const { error: deleteError } = await supabase
            .from('stock_items')
            .delete()
            .in('id', validIds);

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            deletedCount: validIds.length,
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
        const { name, category, unit = 'units', quantity = 0, min_threshold = 10, per_unit_cost = 0, location, description, item_code } = body;

        if (!name) {
            return NextResponse.json({ error: 'Name is required' }, { status: 400 });
        }

        // Generate item_code if not provided
        const finalItemCode = item_code || `ITEM-${Date.now()}`;

        const { data: item, error: insertError } = await supabase
            .from('stock_items')
            .insert({
                property_id: propertyId,
                organization_id: (await supabase.from('properties').select('organization_id').eq('id', propertyId).single()).data?.organization_id,
                item_code: finalItemCode,
                name,
                category,
                unit,
                quantity,
                min_threshold,
                per_unit_cost,
                location,
                description,
                created_by: user.id,
            })
            .select()
            .single();

        if (insertError) {
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        // Record initial movement
        if (quantity > 0) {
            await supabase.from('stock_movements').insert({
                item_id: item.id,
                property_id: propertyId,
                organization_id: item.organization_id,
                action: 'initial',
                quantity_change: quantity,
                quantity_before: 0,
                quantity_after: quantity,
                user_id: user.id,
                notes: 'Initial stock entry',
            });
        }

        // Auto-generate barcode for the new item
        const { data: property } = await supabase
            .from('properties')
            .select('code')
            .eq('id', propertyId)
            .single();

        const propCode = property?.code?.toUpperCase() || 'PROP';
        const newBarcode = `${propCode}-${finalItemCode}-${Date.now().toString(36).toUpperCase()}`;

        const qrCodeData = {
            item_id: item.id,
            item_code: finalItemCode,
            name,
            property_id: propertyId,
            barcode: newBarcode,
            generated_at: new Date().toISOString(),
        };

        await supabase
            .from('stock_items')
            .update({
                barcode: newBarcode,
                barcode_format: 'CODE128',
                qr_code_data: qrCodeData,
                barcode_generated_at: new Date().toISOString(),
            })
            .eq('id', item.id);

        // Call Python script to generate the physical barcode image
        try {
            const pythonScript = path.join(process.cwd(), 'backend', 'qr_gen.py');
            const outputPath = path.join(process.cwd(), 'public', 'qrcodes', newBarcode);
            // Replace backslashes for Windows compatibility in the command string if needed, 
            // but child_process handles paths reasonably well.
            await execPromise(`python "${pythonScript}" "${newBarcode}" "${outputPath}"`);
            console.log(`Generated barcode image for ${newBarcode}`);
        } catch (pyError) {
            console.error('Failed to generate barcode image:', pyError);
            // We don't fail the whole request if the image generation fails, 
            // as the DB record is already updated.
        }

        return NextResponse.json({ success: true, item: { ...item, barcode: newBarcode, qr_code_data: qrCodeData } }, { status: 201 });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
