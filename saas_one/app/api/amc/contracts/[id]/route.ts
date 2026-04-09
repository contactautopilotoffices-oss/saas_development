/**
 * Single AMC contract management API.
 * Updates and deletes an individual AMC contract.
 * PATCH: Update | DELETE: Delete contract.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * PATCH /api/amc/contracts/[id]
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();

        // If contract_end_date is being updated, recalculate status (unless status is explicitly provided)
        if (body.contract_end_date && !body.status) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const endDate = new Date(body.contract_end_date);
            const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiry < 0) body.status = 'expired';
            else if (daysUntilExpiry <= 30) body.status = 'expiring_soon';
            else body.status = 'active';
        }

        const { data, error } = await supabaseAdmin
            .from('amc_contracts')
            .update({ ...body, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ contract: data });
    } catch (err) {
        console.error('AMC contract update error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/amc/contracts/[id]
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { error } = await supabaseAdmin
            .from('amc_contracts')
            .delete()
            .eq('id', id);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('AMC contract delete error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
