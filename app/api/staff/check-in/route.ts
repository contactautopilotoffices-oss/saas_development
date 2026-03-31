import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { processIntelligentAssignment } from '@/backend/lib/ticketing/assignment';

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const propertyId = request.nextUrl.searchParams.get('propertyId');
        if (!propertyId) {
            return NextResponse.json({ error: 'Property ID required' }, { status: 400 });
        }

        const { data: statsList, error } = await supabase
            .from('resolver_stats')
            .select('is_checked_in')
            .eq('user_id', user.id)
            .eq('property_id', propertyId)
            .limit(1);

        if (error) throw error;

        const data = statsList && statsList.length > 0 ? statsList[0] : null;
        return NextResponse.json({ isCheckedIn: data?.is_checked_in || false });
    } catch (error) {
        console.error('Check-in status error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { action, propertyId } = await request.json();

        if (!propertyId || !action) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        if (action === 'check-in') {
            // 1. Create shift log
            const { error: shiftError } = await supabase
                .from('shift_logs')
                .insert({
                    user_id: user.id,
                    property_id: propertyId,
                    status: 'active',
                    check_in_at: new Date().toISOString()
                });

            if (shiftError) throw shiftError;

            // 2. Update/Create Resolver Stats (if eligible)
            // Strict Filter based on User Request:
            // MST -> technical, plumbing, vendor
            // Staff -> soft_services
            const { data: userData } = await supabase
                .from('users')
                .select('id, property_memberships(role), mst_skills(skill_code)')
                .eq('id', user.id)
                .single();

            const role = userData?.property_memberships?.find((pm: any) => pm.property_id === propertyId)?.role;
            const skills = userData?.mst_skills?.map((s: any) => s.skill_code) || [];

            const VALID_MST_SKILLS = ['technical', 'plumbing', 'vendor'];
            const VALID_STAFF_SKILLS = ['soft_services'];

            const isEligibleAsResolver = role === 'mst'
                ? skills.some(s => VALID_MST_SKILLS.includes(s))
                : (role === 'staff' ? skills.some(s => VALID_STAFF_SKILLS.includes(s)) : false);

            if (isEligibleAsResolver) {
                const { data: statsList, error: fetchError } = await supabase
                    .from('resolver_stats')
                    .select('id')
                    .eq('user_id', user.id)
                    .eq('property_id', propertyId)
                    .limit(1);

                if (fetchError) throw fetchError;
                const existingStats = statsList && statsList.length > 0 ? statsList[0] : null;

                if (existingStats) {
                    // Update existing
                    const { error: updateError } = await supabase
                        .from('resolver_stats')
                        .update({
                            is_checked_in: true,
                            is_available: true
                        })
                        .eq('id', existingStats.id);

                    if (updateError) throw updateError;
                } else {
                    // Insert new (Note: This is a simplified insert, usually handled by role assignment)
                    // We'll at least set the first available valid skill group
                    const { data: skillGroup } = await supabase
                        .from('skill_groups')
                        .select('id')
                        .in('code', role === 'mst' ? VALID_MST_SKILLS : VALID_STAFF_SKILLS)
                        .eq('is_active', true)
                        .limit(1)
                        .single();

                    if (skillGroup) {
                        const { error: insertError } = await supabase
                            .from('resolver_stats')
                            .insert({
                                user_id: user.id,
                                property_id: propertyId,
                                skill_group_id: skillGroup.id,
                                is_checked_in: true,
                                is_available: true
                            });

                        if (insertError) throw insertError;
                    }
                }
            } else {
                console.log(`User ${user.id} (Role: ${role}) not eligible for resolver status. Skipping resolver_stats update.`);
            }

            // Auto-assign waitlisted tickets matching this MST's skills
            if (isEligibleAsResolver && skills.length > 0) {
                try {
                    const { data: waitlistedTickets } = await supabase
                        .from('tickets')
                        .select('id, property_id, skill_group_code')
                        .eq('property_id', propertyId)
                        .eq('status', 'waitlist')
                        .or(`skill_group_code.in.(${skills.join(',')}),skill_group_code.is.null`);

                    if (waitlistedTickets && waitlistedTickets.length > 0) {
                        await processIntelligentAssignment(supabase, waitlistedTickets, propertyId);
                        console.log(`[Check-in] Auto-assigned ${waitlistedTickets.length} waitlisted tickets for user ${user.id}`);
                    }
                } catch (assignErr) {
                    // Non-fatal — check-in still succeeds even if auto-assignment fails
                    console.error('[Check-in] Auto-assignment failed:', assignErr);
                }
            }

            return NextResponse.json({ isCheckedIn: true, message: 'Shift started successfully' });
        }

        if (action === 'check-out') {
            // 1. Close active shift logs
            const { error: shiftError } = await supabase
                .from('shift_logs')
                .update({
                    status: 'completed',
                    check_out_at: new Date().toISOString()
                })
                .eq('user_id', user.id)
                .eq('property_id', propertyId)
                .eq('status', 'active');

            if (shiftError) throw shiftError;

            // 2. Update stats
            const { error: statsError } = await supabase
                .from('resolver_stats')
                .update({
                    is_checked_in: false,
                    is_available: false
                })
                .eq('user_id', user.id)
                .eq('property_id', propertyId);

            if (statsError) throw statsError;

            return NextResponse.json({ isCheckedIn: false, message: 'Shift ended successfully' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error: any) {
        console.error('Check-in error:', error);
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
