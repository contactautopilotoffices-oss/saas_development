/**
 * Property features management API.
 * GET/PATCH property module features.
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

/**
 * GET /api/properties/[propertyId]/features
 * Fetch all feature flags for a specific property
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    try {
        const { propertyId } = await params;
        const supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: features, error: fetchError } = await supabase
            .from('property_features')
            .select('*')
            .eq('property_id', propertyId);

        if (fetchError) {
            console.error('Error fetching property features:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch features' }, { status: 500 });
        }

        return NextResponse.json({ features: features || [] });
    } catch (error) {
        console.error('Property Features API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * PATCH /api/properties/[propertyId]/features
 * Update or Toggle a feature flag for a property
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    try {
        const { propertyId } = await params;
        const supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { feature_key, is_enabled, settings } = body;

        if (!feature_key) {
            return NextResponse.json({ error: 'feature_key is required' }, { status: 400 });
        }

        // Upsert the feature flag
        const { data: feature, error: upsertError } = await supabase
            .from('property_features')
            .upsert({
                property_id: propertyId,
                feature_key,
                is_enabled: is_enabled ?? true,
                settings: settings || {},
                updated_at: new Date().toISOString()
            }, { onConflict: 'property_id,feature_key' })
            .select()
            .single();

        if (upsertError) {
            console.error('Error updating property feature:', upsertError);
            return NextResponse.json({ error: 'Failed to update feature' }, { status: 500 });
        }

        return NextResponse.json({ success: true, feature });
    } catch (error) {
        console.error('Property Features Patch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
