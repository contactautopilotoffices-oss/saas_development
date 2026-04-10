/**
 * Barcode scan endpoint for stock items.
 * GET: Lookup item by barcode.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

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
        const { itemId, action, quantity, notes = 'Scanned via Mobile' } = body;

        if (!itemId || !action || !quantity) {
            return NextResponse.json(
                { error: 'itemId, action, and quantity are required' },
                { status: 400 }
            );
        }

        // Map "In/Out" to "add/remove"
        const finalAction = action.toLowerCase() === 'in' ? 'add' : (action.toLowerCase() === 'out' ? 'remove' : action);

        if (!['add', 'remove', 'adjust'].includes(finalAction)) {
            return NextResponse.json(
                { error: 'Invalid action' },
                { status: 400 }
            );
        }

        // Get current item
        const { data: item, error: itemError } = await supabase
            .from('stock_items')
            .select('*')
            .eq('id', itemId)
            .eq('property_id', propertyId)
            .single();

        if (itemError || !item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        // Calculate new quantity
        let quantityChange = 0;
        if (finalAction === 'add') {
            quantityChange = Number(quantity);
        } else if (finalAction === 'remove') {
            quantityChange = -Number(quantity);
        }

        const newQuantity = item.quantity + quantityChange;

        // Don't allow negative quantities
        if (newQuantity < 0) {
            return NextResponse.json(
                { error: 'Cannot reduce stock below zero' },
                { status: 400 }
            );
        }

        // Update item quantity
        const { error: updateError } = await supabase
            .from('stock_items')
            .update({
                quantity: newQuantity,
                updated_at: new Date().toISOString(),
            })
            .eq('id', itemId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Record movement
        const { data: movement, error: movementError } = await supabase
            .from('stock_movements')
            .insert({
                item_id: itemId,
                property_id: propertyId,
                organization_id: item.organization_id,
                action: finalAction,
                quantity_change: quantityChange,
                quantity_before: item.quantity,
                quantity_after: newQuantity,
                user_id: user.id,
                notes,
            })
            .select()
            .single();

        if (movementError) {
            return NextResponse.json({ error: movementError.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            movement,
            newQuantity,
            item_name: item.name
        }, { status: 201 });
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
