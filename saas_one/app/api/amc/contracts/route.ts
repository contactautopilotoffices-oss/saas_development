/**
 * AMC contract CRUD API.
 * Lists and creates AMC (Annual Maintenance Contract) records.
 * GET: List contracts | POST: Create contract.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/amc/contracts?organization_id=&property_id=
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = request.nextUrl;
        const organizationId = searchParams.get('organization_id');
        const propertyId = searchParams.get('property_id');

        if (!organizationId) {
            return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
        }

        let query = supabaseAdmin
            .from('amc_contracts')
            .select(`
                *,
                amc_documents (
                    id,
                    doc_type,
                    file_url,
                    file_name,
                    uploaded_at
                )
            `)
            .eq('organization_id', organizationId)
            .order('created_at', { ascending: false });

        if (propertyId) query = query.eq('property_id', propertyId);

        const { data, error } = await query;
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ contracts: data || [] });
    } catch (err) {
        console.error('AMC contracts fetch error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/amc/contracts
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const {
            organization_id,
            property_id,
            system_name,
            vendor_name,
            vendor_contact,
            contract_start_date,
            contract_end_date,
            contract_value,
            payment_terms,
            scope_of_work,
            notes,
        } = body;

        if (!organization_id || !system_name || !vendor_name || !contract_start_date || !contract_end_date) {
            return NextResponse.json(
                { error: 'organization_id, system_name, vendor_name, contract_start_date, contract_end_date are required' },
                { status: 400 }
            );
        }

        // Auto-calculate status
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const endDate = new Date(contract_end_date);
        const daysUntilExpiry = Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        let status = 'active';
        if (daysUntilExpiry < 0) status = 'expired';
        else if (daysUntilExpiry <= 30) status = 'expiring_soon';

        const { data, error } = await supabaseAdmin
            .from('amc_contracts')
            .insert({
                organization_id,
                property_id: property_id || null,
                system_name,
                vendor_name,
                vendor_contact: vendor_contact || null,
                contract_start_date,
                contract_end_date,
                contract_value: contract_value || null,
                payment_terms: payment_terms || null,
                scope_of_work: scope_of_work || null,
                notes: notes || null,
                status,
            })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ contract: data }, { status: 201 });
    } catch (err) {
        console.error('AMC contract create error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
