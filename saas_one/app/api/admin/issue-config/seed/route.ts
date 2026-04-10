/**
 * Seed issue categories API.
 * Seeds the database with global skill groups and issue categories from issueDictionary.json.
 * POST: Run seed (idempotent) | GET: Check seeding status.
 * Auth: Master Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

import dictionary from '@/backend/lib/ticketing/issueDictionary.json';

// Human-readable names for issue codes
const issueCodeNames: Record<string, string> = {
    ac_breakdown: 'AC Breakdown',
    power_outage: 'Power/Electrical Issue',
    wifi_down: 'Network/WiFi Issue',
    lighting_issue: 'Lighting Issue',
    dg_issue: 'DG/Generator Issue',
    water_leakage: 'Water Leakage',
    no_water_supply: 'No Water Supply',
    washroom_hygiene: 'Washroom Hygiene',
    stuck_lift: 'Stuck Lift (Emergency)',
    lift_breakdown: 'Lift Breakdown',
    fire_alarm: 'Fire/Safety Issue',
    wall_painting: 'Wall Painting',
    chair_broken: 'Broken Chair',
    desk_alignment: 'Desk/Furniture Issue',
    deep_cleaning: 'Deep Cleaning',
    cleaning_required: 'Cleaning Required'
};

// POST: Seed database from the hardcoded dictionary
export async function POST(request: NextRequest) {
    try {
        const results = {
            skill_groups_created: 0,
            categories_created: 0,
            errors: [] as string[]
        };

        // Step 1: Get existing GLOBAL skill groups (property_id IS NULL)
        const { data: existingSkillGroups, error: sgError } = await supabaseAdmin
            .from('skill_groups')
            .select('id, code, name')
            .is('property_id', null);

        if (sgError) {
            return NextResponse.json({ error: `Failed to fetch skill groups: ${sgError.message}` }, { status: 500 });
        }

        // Create a map of skill group code -> id
        const skillGroupMap: Record<string, string> = {};
        for (const sg of existingSkillGroups || []) {
            skillGroupMap[sg.code] = sg.id;
        }

        // Step 2: Create missing GLOBAL skill groups if needed
        const requiredSkillGroups = ['technical', 'plumbing', 'vendor', 'soft_services'];
        for (const sgCode of requiredSkillGroups) {
            if (!skillGroupMap[sgCode]) {
                const { data: newSg, error } = await supabaseAdmin
                    .from('skill_groups')
                    .insert({
                        property_id: null, // Global skill group
                        code: sgCode,
                        name: sgCode.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                        description: `Auto-created skill group for ${sgCode}`
                    })
                    .select()
                    .single();

                if (error) {
                    results.errors.push(`Failed to create skill group ${sgCode}: ${error.message}`);
                } else if (newSg) {
                    skillGroupMap[sgCode] = newSg.id;
                    results.skill_groups_created++;
                }
            }
        }

        // Step 3: Create issue categories ONLY (Keywords are managed in code)
        for (const skillGroupCode of requiredSkillGroups) {
            const skillGroupId = skillGroupMap[skillGroupCode];
            const issues = (dictionary as any)[skillGroupCode];

            if (!issues || !skillGroupId) continue;

            for (const [issueCode] of Object.entries(issues)) {
                // Check if GLOBAL category already exists
                const { data: existingCat } = await supabaseAdmin
                    .from('issue_categories')
                    .select('id')
                    .is('property_id', null)
                    .eq('code', issueCode)
                    .maybeSingle();

                if (!existingCat) {
                    // Create the GLOBAL category
                    const { error: catError } = await supabaseAdmin
                        .from('issue_categories')
                        .insert({
                            property_id: null, // Global category
                            code: issueCode,
                            name: issueCodeNames[issueCode] || issueCode.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                            skill_group_id: skillGroupId,
                            priority: 0,
                            is_active: true
                        });

                    if (catError) {
                        results.errors.push(`Failed to create category ${issueCode}: ${catError.message}`);
                    } else {
                        results.categories_created++;
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Database categories seeded successfully. Keywords are managed in dictionary.json',
            results
        });

    } catch (error: any) {
        console.error('Error seeding database:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// GET: Check current seeding status
export async function GET(request: NextRequest) {
    try {
        const { data: categories, error } = await supabaseAdmin
            .from('issue_categories')
            .select('id')
            .limit(1);

        const isSeeded = !error && categories && categories.length > 0;

        return NextResponse.json({
            is_seeded: isSeeded,
            dictionary_categories: Object.keys(dictionary.technical).length +
                Object.keys(dictionary.plumbing).length +
                Object.keys(dictionary.vendor).length +
                Object.keys(dictionary.soft_services).length
        });

    } catch (error: any) {
        return NextResponse.json({
            is_seeded: false,
            error: error.message
        });
    }
}
