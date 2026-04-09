/**
 * @fileoverview Property Detail API
 * @route GET /api/properties/[propertyId]
 * @route PATCH /api/properties/[propertyId]
 * @description
 *   Retrieves full details for a single property by its UUID.
 *   Uses the admin client to bypass RLS, making it suitable for privileged contexts
 *   such as admin panels or internal services.
 * @requires_auth None (admin client bypasses RLS)
 * @response 200 { property } — full property row
 * @response 404 Not Found — property does not exist
 * @response 500 Internal Server Error
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/properties/[propertyId]
 *
 * Fetch detail for a specific property
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;

    try {
        const { data: property, error } = await supabaseAdmin
            .from('properties')
            .select('*')
            .eq('id', propertyId)
            .single();

        if (error) {
            console.error('[PropertyAPI] Error fetching property:', error.message);
            return NextResponse.json({ error: error.message }, { status: 404 });
        }

        return NextResponse.json(property);
    } catch (error: any) {
        console.error('[PropertyAPI] Internal error:', error.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
