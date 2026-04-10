/**
 * Feature usage analytics API.
 * Aggregated feature usage stats for the Master Admin dashboard.
 * GET: Fetch usage analytics | POST: Log a usage event.
 * Auth: Master Admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * GET /api/analytics/feature-usage
 * 
 * Get feature usage analytics (Master Admin only)
 * Query params: organization_id (optional), start_date, end_date
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify Master Admin
        const adminClient = createAdminClient();
        const { data: userRecord } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .single();

        if (!userRecord?.is_master_admin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const organizationId = searchParams.get('organization_id');
        const startDate = searchParams.get('start_date');
        const endDate = searchParams.get('end_date');

        // Build query for aggregated statistics
        let query = adminClient
            .from('feature_usage_logs')
            .select('organization_id, feature_name, action, created_at');

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        if (startDate) {
            query = query.gte('created_at', startDate);
        }

        if (endDate) {
            query = query.lte('created_at', endDate);
        }

        const { data: logs, error: fetchError } = await query
            .order('created_at', { ascending: false })
            .limit(10000); // Reasonable limit for aggregation

        if (fetchError) {
            console.error('Error fetching feature usage:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
        }

        // Aggregate by feature
        const featureStats = (logs || []).reduce((acc: any, log) => {
            const key = log.feature_name;
            if (!acc[key]) {
                acc[key] = {
                    feature_name: log.feature_name,
                    usage_count: 0,
                    last_used: log.created_at
                };
            }
            acc[key].usage_count++;
            if (new Date(log.created_at) > new Date(acc[key].last_used)) {
                acc[key].last_used = log.created_at;
            }
            return acc;
        }, {});

        const features = Object.values(featureStats);

        return NextResponse.json({ features });

    } catch (error) {
        console.error('Feature usage API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * POST /api/analytics/feature-usage
 * 
 * Log a feature usage event
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { organization_id, property_id, feature_name, action, metadata } = body;

        if (!organization_id || !feature_name || !action) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Use the database function for logging
        const { error: logError } = await supabase.rpc('log_feature_usage', {
            p_organization_id: organization_id,
            p_property_id: property_id || null,
            p_feature_name: feature_name,
            p_action: action,
            p_metadata: metadata || {}
        });

        if (logError) {
            console.error('Error logging feature usage:', logError);
            return NextResponse.json({ error: 'Failed to log usage' }, { status: 500 });
        }

        return NextResponse.json({ success: true }, { status: 201 });

    } catch (error) {
        console.error('Log feature usage API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
