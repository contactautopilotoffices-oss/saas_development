/**
 * Issue keyword management API.
 * Allows adding, removing, and updating keywords associated with issue categories
 * for ticket auto-categorization.
 * POST: Add keyword(s) | DELETE: Remove keyword | PATCH: Update match type.
 * Auth: Master Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// POST: Add keyword(s) to an issue category
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { issue_category_id, keywords, match_type = 'contains' } = body;

        if (!issue_category_id) {
            return NextResponse.json({ error: 'issue_category_id is required' }, { status: 400 });
        }

        if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
            return NextResponse.json({ error: 'keywords array is required' }, { status: 400 });
        }

        const keywordRecords = keywords.map((kw: string) => ({
            issue_category_id,
            keyword: kw.toLowerCase().trim(),
            match_type
        }));

        const { data, error } = await supabaseAdmin
            .from('issue_keywords')
            .upsert(keywordRecords, {
                onConflict: 'issue_category_id,keyword',
                ignoreDuplicates: true
            })
            .select();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, keywords: data });

    } catch (error: any) {
        console.error('Error adding keywords:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// DELETE: Remove a keyword
export async function DELETE(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        const keyword = searchParams.get('keyword');
        const issue_category_id = searchParams.get('issue_category_id');

        if (id) {
            // Delete by ID
            const { error } = await supabaseAdmin
                .from('issue_keywords')
                .delete()
                .eq('id', id);

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        } else if (keyword && issue_category_id) {
            // Delete by keyword + category
            const { error } = await supabaseAdmin
                .from('issue_keywords')
                .delete()
                .eq('issue_category_id', issue_category_id)
                .eq('keyword', keyword.toLowerCase().trim());

            if (error) {
                return NextResponse.json({ error: error.message }, { status: 500 });
            }
        } else {
            return NextResponse.json({ error: 'id or (keyword + issue_category_id) required' }, { status: 400 });
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error deleting keyword:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// PATCH: Update keyword match_type
export async function PATCH(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, match_type } = body;

        if (!id || !match_type) {
            return NextResponse.json({ error: 'id and match_type are required' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('issue_keywords')
            .update({ match_type })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, keyword: data });

    } catch (error: any) {
        console.error('Error updating keyword:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
