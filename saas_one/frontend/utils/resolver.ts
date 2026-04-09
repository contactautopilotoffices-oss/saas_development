/**
 * Frontend-side resolver helpers.
 * Provides typed wrappers for ticket classification and assignment utilities.
 */

import { createClient } from './supabase/client';

/**
 * Classification-result helpers for the resolver pool (frontend side).
 *
 * Manages the `resolver_stats` table on the server side on behalf of the
 * frontend: when an MST or staff user checks in at a property, this module
 * verifies their role and skill eligibility, creates a `resolver_stats` entry
 * if one does not yet exist, and updates their availability status.
 *
 * Valid MST skills: `technical`, `plumbing`, `vendor`
 * Valid Staff skills: `soft_services`
 *
 * @module resolver
 * @see checkInResolver
 */
export async function checkInResolver(userId: string, propertyId: string) {
    const supabase = createClient();

    // 1. Fetch user role and skills for this property
    const { data: userData } = await supabase
        .from('users')
        .select(`
            id,
            property_memberships!inner(role),
            mst_skills(skill_code)
        `)
        .eq('id', userId)
        .eq('property_memberships.property_id', propertyId)
        .maybeSingle();

    if (!userData) return;

    const role = userData.property_memberships?.[0]?.role;
    const skills = userData.mst_skills?.map((s: any) => s.skill_code) || [];

    const VALID_MST_SKILLS = ['technical', 'plumbing', 'vendor'];
    const VALID_STAFF_SKILLS = ['soft_services'];

    const isEligible = role === 'mst'
        ? skills.some(s => VALID_MST_SKILLS.includes(s))
        : (role === 'staff' ? skills.some(s => VALID_STAFF_SKILLS.includes(s)) : false);

    if (!isEligible) {
        console.log('[checkInResolver] User not eligible for resolver pool. Skipping auto-registration.');
        return;
    }

    // 2. Check if entry exists
    const { data: existing } = await supabase
        .from('resolver_stats')
        .select('user_id')
        .eq('user_id', userId)
        .eq('property_id', propertyId)
        .maybeSingle();

    if (!existing) {
        // Fetch a valid skill group ID to satisfy schema
        const skillToUse = role === 'mst'
            ? skills.find(s => VALID_MST_SKILLS.includes(s))
            : skills.find(s => VALID_STAFF_SKILLS.includes(s));

        const { data: skillGroup } = await supabase
            .from('skill_groups')
            .select('id')
            .eq('code', skillToUse)
            .maybeSingle();

        if (skillGroup) {
            await supabase.from('resolver_stats').insert({
                user_id: userId,
                property_id: propertyId,
                skill_group_id: skillGroup.id,
                is_available: true,
                current_floor: 1,
                total_resolved: 0,
                avg_resolution_minutes: 60
            });
        }
    } else {
        // Update availability
        await supabase.from('resolver_stats').update({
            is_available: true
        }).eq('user_id', userId).eq('property_id', propertyId);
    }
}
