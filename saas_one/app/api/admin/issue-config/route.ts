/**
 * Issue category configuration API.
 * Manages skill groups, issue categories, and their associated keywords.
 * GET: List all | POST: Create category | PATCH: Update | DELETE: Delete.
 * Auth: Master Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import dictionary from '@/backend/lib/ticketing/issueDictionary.json';

// Admin client for table operations
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper to get keywords for an issue code from the code dictionary
function getKeywordsForCode(code: string): any[] {
    const skillGroups = ['vendor', 'technical', 'plumbing', 'soft_services'];
    for (const sg of skillGroups) {
        const issues = (dictionary as any)[sg];
        if (issues && issues[code]) {
            return issues[code].map((kw: string, index: number) => ({
                id: `${code}_${index}`,
                keyword: kw,
                match_type: 'contains'
            }));
        }
    }
    return [];
}

// GET: Fetch all skill groups with their issue categories and keywords
export async function GET(request: NextRequest) {
    try {
        // First, fetch global skill groups (property_id IS NULL)
        const { data: skillGroups, error: sgError } = await supabaseAdmin
            .from('skill_groups')
            .select('id, code, name')
            .is('property_id', null)
            .order('name');

        if (sgError) {
            return NextResponse.json({ error: sgError.message }, { status: 500 });
        }

        // Then fetch global issue categories 
        // Note: keywords are now pulled from issueDictionary.json instead of DB
        const { data: catData, error: catError } = await supabaseAdmin
            .from('issue_categories')
            .select(`
                id,
                code,
                name,
                skill_group_id,
                priority,
                is_active
            `)
            .is('property_id', null)
            .eq('is_active', true)
            .order('priority', { ascending: false });

        if (catError) {
            // Table might not exist yet
            console.log('issue_categories table may not exist:', catError.message);
            return NextResponse.json({
                skill_groups: skillGroups || [],
                categories: [],
                needs_setup: true
            });
        }

        // Attach keywords from our hardcoded issueDictionary.json
        const categories = (catData || []).map((cat: any) => ({
            ...cat,
            issue_keywords: getKeywordsForCode(cat.code)
        }));

        // Determine if setup is needed (no categories yet)
        const needsSetup = !categories || categories.length === 0;

        // Group categories by skill_group_id
        const categoriesBySkillGroup: Record<string, any[]> = {};
        for (const sg of skillGroups || []) {
            categoriesBySkillGroup[sg.id] = categories.filter(
                (c: any) => c.skill_group_id === sg.id
            );
        }

        // Also include uncategorized (no skill group)
        categoriesBySkillGroup['uncategorized'] = categories.filter(
            (c: any) => !c.skill_group_id
        );

        return NextResponse.json({
            skill_groups: skillGroups || [],
            categories: categories || [],
            categories_by_skill_group: categoriesBySkillGroup,
            needs_setup: needsSetup
        });

    } catch (error: any) {
        console.error('Error fetching issue config:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// POST: Create a new issue category
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { code, name, description, skill_group_id, priority, keywords } = body;

        if (!code || !name) {
            return NextResponse.json({ error: 'Code and name are required' }, { status: 400 });
        }

        // Insert the category
        const { data: category, error: catError } = await supabaseAdmin
            .from('issue_categories')
            .insert({
                code,
                name,
                skill_group_id,
                priority: priority || 0
            })
            .select()
            .single();

        if (catError) {
            return NextResponse.json({ error: catError.message }, { status: 500 });
        }

        // Insert keywords if provided
        if (keywords && Array.isArray(keywords) && keywords.length > 0) {
            const keywordRecords = keywords.map((kw: string) => ({
                issue_category_id: category.id,
                keyword: kw.toLowerCase().trim(),
                match_type: 'contains'
            }));

            const { error: kwError } = await supabaseAdmin
                .from('issue_keywords')
                .insert(keywordRecords);

            if (kwError) {
                console.error('Error inserting keywords:', kwError);
            }
        }

        return NextResponse.json({ success: true, category });

    } catch (error: any) {
        console.error('Error creating issue category:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH: Update an issue category (including skill group reassignment)
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, code, name, description, skill_group_id, priority, is_active } = body;

        if (!id) {
            return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
        }

        const updates: any = { updated_at: new Date().toISOString() };
        if (code !== undefined) updates.code = code;
        if (name !== undefined) updates.name = name;
        if (skill_group_id !== undefined) updates.skill_group_id = skill_group_id;
        if (priority !== undefined) updates.priority = priority;
        if (is_active !== undefined) updates.is_active = is_active;

        const { data, error } = await supabaseAdmin
            .from('issue_categories')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, category: data });

    } catch (error: any) {
        console.error('Error updating issue category:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Remove an issue category
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const soft = searchParams.get('soft') === 'true';

        if (!id) {
            return NextResponse.json({ error: 'Category ID is required' }, { status: 400 });
        }

        if (soft) {
            // Soft delete - just mark as inactive
            const { error } = await supabaseAdmin
                .from('issue_categories')
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .eq('id', id);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        } else {
            // Hard delete - will cascade to keywords
            const { error } = await supabaseAdmin
                .from('issue_categories')
                .delete()
                .eq('id', id);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error deleting issue category:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
