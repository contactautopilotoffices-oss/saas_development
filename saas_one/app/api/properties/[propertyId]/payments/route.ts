/**
 * Payment tracking for a property.
 * GET: List payments | POST: Record payment.
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
    const body = await request.json();

    const { vendor_id, cycle_id, amount, gateway_txn_id, gateway_name } = body;

    try {
        // 1. Record the payment
        const { data: payment, error: paymentError } = await supabase
            .from('vendor_payments')
            .insert({
                vendor_id,
                cycle_id,
                amount,
                gateway_txn_id: gateway_txn_id || `TXN_${Date.now()}`,
                gateway_name: gateway_name || 'Manual/Simulated',
                status: 'completed',
            })
            .select()
            .single();

        if (paymentError) throw paymentError;

        // 2. Insert into payment_transactions for audit
        await supabase
            .from('payment_transactions')
            .insert({
                vendor_id,
                property_id: propertyId,
                commission_cycle_id: cycle_id,
                amount,
                gateway: gateway_name || 'Simulated',
                gateway_ref: gateway_txn_id || `REF_${Date.now()}`,
                status: 'success'
            });

        // 3. Update the commission cycle status if needed
        // Usually, a cycle might remain 'in_progress' until it ends, but we can mark it as partial payment or just update amounts.
        // For this demo, let's just record the payment. 
        // If the user paid the full amount, we could potentially clear commission_due? 
        // But commission_due is "accrued". We might need a "balance" field.
        // For now, let's just complete the transaction.

        return NextResponse.json(payment, { status: 201 });
    } catch (err: any) {
        console.error('Payment error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
