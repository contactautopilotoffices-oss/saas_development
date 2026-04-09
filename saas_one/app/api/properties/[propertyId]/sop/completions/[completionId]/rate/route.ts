/**
 * SOP completion rating API.
 * POST: Submit satisfaction rating for an SOP completion.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string; completionId: string }> }
) {
    const { propertyId, completionId } = await params;

    try {
        const supabase = await createClient();

        // Verify calling user is authenticated
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify caller is an admin for this property
        const { data: membership } = await supabaseAdmin
            .from('property_memberships')
            .select('role')
            .eq('property_id', propertyId)
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();

        const adminRoles = ['property_admin', 'org_admin', 'org_super_admin', 'master_admin'];
        if (!membership || !adminRoles.includes(membership.role)) {
            return NextResponse.json({ error: 'Forbidden: only admins can rate items' }, { status: 403 });
        }

        const body = await request.json();
        const { completionItemId, rating } = body as { completionItemId: string; rating: 1 | 2 | 3 };

        if (!completionItemId || ![1, 2, 3].includes(rating)) {
            return NextResponse.json({ error: 'completionItemId and rating (1-3) are required' }, { status: 400 });
        }

        // Save rating using admin client (bypasses RLS edge cases)
        const { error: updateError } = await supabaseAdmin
            .from('sop_completion_items')
            .update({
                satisfaction_rating: rating,
                satisfaction_by: user.id,
                satisfaction_at: new Date().toISOString(),
            })
            .eq('id', completionItemId)
            .eq('completion_id', completionId);

        if (updateError) {
            console.error('[SOP Rate] Update error:', updateError);
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Trigger notification to the checklist completer (non-blocking)
        import('@/backend/services/NotificationService')
            .then(({ NotificationService }) => {
                NotificationService.afterSOPItemRated(completionId, completionItemId, rating, user.id)
                    .catch(err => console.error('[SOP Rate] Notification error:', err));
            })
            .catch(err => console.error('[SOP Rate] Failed to load NotificationService:', err));

        return NextResponse.json({ success: true });
    } catch (err: any) {
        console.error('[SOP Rate] Unexpected error:', err);
        return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 });
    }
}
