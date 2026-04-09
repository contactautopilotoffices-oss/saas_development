/**
 * Properties list API.
 * GET: List properties | POST: Create property.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * POST /api/properties
 * 
 * Create a new property for an organization
 * Uses service role - bypasses RLS
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const {
            organization_id,
            name,
            address,
            city,
            capacity,
            is_active = true
        } = body;

        // Validate required fields
        if (!organization_id || !name) {
            return NextResponse.json({
                error: 'Missing required fields: organization_id, name'
            }, { status: 400 });
        }

        // Validate capacity
        if (capacity && (typeof capacity !== 'number' || capacity <= 0)) {
            return NextResponse.json({
                error: 'Capacity must be a positive integer'
            }, { status: 400 });
        }

        // Generate property code
        const { data: codeData, error: codeError } = await supabaseAdmin
            .rpc('generate_property_code', { p_org_id: organization_id });

        if (codeError) {
            console.error('Error generating property code:', codeError);
            return NextResponse.json({
                error: 'Failed to generate property code',
                details: codeError.message
            }, { status: 500 });
        }

        const property_code = codeData;

        // Auto-set status based on is_active
        const status = is_active ? 'active' : 'inactive';

        // Create property
        const { data: property, error: insertError } = await supabaseAdmin
            .from('properties')
            .insert({
                organization_id,
                name,
                code: property_code,
                address: address || null,
                city: city || null,
                capacity: capacity || null,
                is_active,
                status
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error creating property:', insertError);
            return NextResponse.json({
                error: 'Failed to create property',
                details: insertError.message
            }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            property
        }, { status: 201 });

    } catch (error: any) {
        console.error('Property creation API error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error.message
        }, { status: 500 });
    }
}
