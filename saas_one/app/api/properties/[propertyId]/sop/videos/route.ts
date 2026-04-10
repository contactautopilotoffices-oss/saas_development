/**
 * SOP video upload API.
 * POST: Upload video for SOP completion.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();

    try {
        // Auth: getUser only — no getSession fallback (getSession returns cached/stale token)
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // IDOR guard: verify the user belongs to this property
        const { data: membership } = await supabaseAdmin
            .from('property_memberships')
            .select('role')
            .eq('property_id', propertyId)
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (!membership) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const completionId = (formData.get('completionId') as string | null)?.trim();
        const completionItemId = (formData.get('completionItemId') as string | null)?.trim();

        if (!file) {
            return NextResponse.json({ error: 'File is required' }, { status: 400 });
        }

        if (!completionId || !completionItemId) {
            return NextResponse.json(
                { error: 'completionId and completionItemId are required' },
                { status: 400 }
            );
        }

        // Verify the completion belongs to this property
        const { data: completion } = await supabaseAdmin
            .from('sop_completions')
            .select('id')
            .eq('id', completionId)
            .eq('property_id', propertyId)
            .maybeSingle();

        if (!completion) {
            return NextResponse.json({ error: 'Completion not found for this property' }, { status: 404 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        const ext = file.type.includes('mp4') ? 'mp4' : 'webm';
        const contentType = file.type || (ext === 'mp4' ? 'video/mp4' : 'video/webm');

        const timestamp = Date.now();
        const filename = `${completionId}/${completionItemId}-${timestamp}.${ext}`;
        const filePath = `sop-videos/${propertyId}/${filename}`;

        const { error: uploadError } = await supabaseAdmin.storage
            .from('sop-videos')
            .upload(filePath, buffer, { contentType, upsert: false });

        if (uploadError) {
            return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        const { data: publicData } = supabaseAdmin.storage
            .from('sop-videos')
            .getPublicUrl(filePath);

        return NextResponse.json(
            { success: true, url: publicData.publicUrl, path: filePath },
            { status: 201 }
        );
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
