/**
 * Property-level ticket configuration.
 * GET: Get config | PUT: Update config.
 * Auth: Property Admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

// Default Skill Groups
const DEFAULT_SKILL_GROUPS = [
    { code: 'technical', name: 'MST (Technical)', description: 'Technical maintenance staff', is_manual_assign: false },
    { code: 'plumbing', name: 'MST (Plumbing)', description: 'Plumbing maintenance staff', is_manual_assign: false },
    { code: 'soft_services', name: 'Soft Services', description: 'Soft services staff', is_manual_assign: false },
    { code: 'vendor', name: 'Vendor', description: 'External vendor (manual escalation)', is_manual_assign: true },
];

// Issue Categories mapped to Skill Groups
const DEFAULT_ISSUE_CATEGORIES = [
    // MST Technical
    { code: 'ac_breakdown', name: 'AC Breakdown', skill_group: 'technical', sla_hours: 4, priority: 'high', icon: 'Snowflake' },
    { code: 'power_outage', name: 'Power Outage', skill_group: 'technical', sla_hours: 2, priority: 'urgent', icon: 'Zap' },
    { code: 'wifi_down', name: 'Wi-Fi Down', skill_group: 'technical', sla_hours: 4, priority: 'high', icon: 'Wifi' },
    { code: 'lighting_issue', name: 'Lighting Issue', skill_group: 'technical', sla_hours: 8, priority: 'medium', icon: 'Lightbulb' },
    { code: 'dg_issue', name: 'DG Issue', skill_group: 'technical', sla_hours: 2, priority: 'urgent', icon: 'Fuel' },

    // MST Plumbing
    { code: 'water_leakage', name: 'Water Leakage', skill_group: 'plumbing', sla_hours: 2, priority: 'urgent', icon: 'Droplets' },
    { code: 'no_water_supply', name: 'No Water Supply', skill_group: 'plumbing', sla_hours: 2, priority: 'urgent', icon: 'Droplet' },
    { code: 'washroom_hygiene', name: 'Washroom Hygiene', skill_group: 'plumbing', sla_hours: 4, priority: 'high', icon: 'Bath' },

    // Soft Services
    { code: 'chair_broken', name: 'Chair Broken', skill_group: 'soft_services', sla_hours: 24, priority: 'low', icon: 'Armchair' },
    { code: 'desk_alignment', name: 'Desk Alignment', skill_group: 'soft_services', sla_hours: 24, priority: 'low', icon: 'Table' },
    { code: 'deep_cleaning', name: 'Deep Cleaning', skill_group: 'soft_services', sla_hours: 48, priority: 'low', icon: 'SprayCan' },
    { code: 'cleaning_required', name: 'Cleaning Required', skill_group: 'soft_services', sla_hours: 24, priority: 'low', icon: 'Brush' },

    // Vendor (Manual Assignment)
    { code: 'lift_breakdown', name: 'Lift Breakdown', skill_group: 'vendor', sla_hours: 4, priority: 'urgent', icon: 'Building2' },
    { code: 'stuck_lift', name: 'Stuck Lift', skill_group: 'vendor', sla_hours: 1, priority: 'urgent', icon: 'AlertTriangle' },
    { code: 'fire_alarm', name: 'Fire Alarm', skill_group: 'vendor', sla_hours: 1, priority: 'urgent', icon: 'Flame' },
    { code: 'wall_painting', name: 'Wall Painting', skill_group: 'vendor', sla_hours: 72, priority: 'low', icon: 'Paintbrush' },
];

// POST: Seed default skill groups and issue categories for a property
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    try {
        const { propertyId } = await params;
        const supabase = createAdminClient();

        // 1. Insert Skill Groups
        const skillGroupsToInsert = DEFAULT_SKILL_GROUPS.map(sg => ({
            property_id: propertyId,
            code: sg.code,
            name: sg.name,
            description: sg.description,
            is_manual_assign: sg.is_manual_assign,
        }));

        const { data: skillGroups, error: sgError } = await supabase
            .from('skill_groups')
            .upsert(skillGroupsToInsert, { onConflict: 'property_id,code' })
            .select();

        if (sgError) {
            console.error('Error inserting skill groups:', sgError);
            return NextResponse.json({ error: 'Failed to create skill groups', details: sgError }, { status: 500 });
        }

        // 2. Create skill group code-to-id map
        const skillGroupMap: Record<string, string> = {};
        skillGroups?.forEach(sg => {
            skillGroupMap[sg.code] = sg.id;
        });

        // 3. Insert Issue Categories
        const categoriesToInsert = DEFAULT_ISSUE_CATEGORIES.map(cat => ({
            property_id: propertyId,
            code: cat.code,
            name: cat.name,
            skill_group_id: skillGroupMap[cat.skill_group],
            sla_hours: cat.sla_hours,
            priority: cat.priority,
            icon: cat.icon,
        }));

        const { data: categories, error: catError } = await supabase
            .from('issue_categories')
            .upsert(categoriesToInsert, { onConflict: 'property_id,code' })
            .select();

        if (catError) {
            console.error('Error inserting issue categories:', catError);
            return NextResponse.json({ error: 'Failed to create issue categories', details: catError }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Skill groups and issue categories seeded successfully',
            data: {
                skill_groups: skillGroups,
                issue_categories: categories,
            }
        });

    } catch (error) {
        console.error('Seed error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// GET: Retrieve skill groups and issue categories for a property
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    try {
        const { propertyId } = await params;
        const supabase = createAdminClient();

        // Get skill groups
        const { data: skillGroups, error: sgError } = await supabase
            .from('skill_groups')
            .select('*')
            .eq('property_id', propertyId)
            .order('name');

        if (sgError) {
            return NextResponse.json({ error: 'Failed to fetch skill groups' }, { status: 500 });
        }

        // Get issue categories with skill group info
        const { data: categories, error: catError } = await supabase
            .from('issue_categories')
            .select(`
        *,
        skill_group:skill_groups(id, code, name, is_manual_assign)
      `)
            .eq('property_id', propertyId)
            .eq('is_active', true)
            .order('name');

        if (catError) {
            return NextResponse.json({ error: 'Failed to fetch issue categories' }, { status: 500 });
        }

        return NextResponse.json({
            skill_groups: skillGroups || [],
            issue_categories: categories || [],
        });

    } catch (error) {
        console.error('Fetch error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
