import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * POST /api/vms/[propertyId]/force-checkout
 * Admin / org_super_admin force checkout for visitors who forgot to check out.
 * Uses supabaseAdmin for DB ops to bypass RLS restrictions.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    try {
        const { propertyId } = await params;

        // Auth check — ensure caller is logged in
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { visitor_log_id, reason } = body;

        if (!visitor_log_id) {
            return NextResponse.json({ error: 'visitor_log_id required' }, { status: 400 });
        }

        // Fetch visitor — admin client to bypass RLS
        const { data: visitor, error: fetchError } = await supabaseAdmin
            .from('visitor_logs')
            .select('*')
            .eq('id', visitor_log_id)
            .eq('property_id', propertyId)
            .single();

        if (fetchError || !visitor) {
            return NextResponse.json({ error: 'Visitor not found' }, { status: 404 });
        }

        if (visitor.status === 'checked_out') {
            return NextResponse.json({ error: 'Visitor already checked out' }, { status: 400 });
        }

        // Force checkout — admin client to bypass RLS
        const { data: updated, error: updateError } = await supabaseAdmin
            .from('visitor_logs')
            .update({
                status: 'checked_out',
                checkout_time: new Date().toISOString(),
            })
            .eq('id', visitor_log_id)
            .select()
            .single();

        if (updateError) {
            console.error('[VMS] Force checkout DB error:', updateError);
            return NextResponse.json({ error: 'Failed to checkout' }, { status: 500 });
        }

        // Audit log (non-blocking)
        void supabaseAdmin.from('property_activities').insert({
            property_id: propertyId,
            user_id: user.id,
            action: 'vms_force_checkout',
            details: {
                visitor_id: visitor.visitor_id,
                visitor_name: visitor.name,
                reason: reason || 'Force checkout by admin',
            },
        });

        return NextResponse.json({
            success: true,
            message: `${visitor.name} has been checked out`,
            visitor: updated,
        });
    } catch (error) {
        console.error('Force checkout error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
