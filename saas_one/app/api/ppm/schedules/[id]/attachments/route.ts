/**
 * PPM schedule attachment upload API.
 * POST: Upload attachment | DELETE: Remove attachment.
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

const BUCKET = 'ppm-attachments';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const attachType = formData.get('attach_type') as 'photo' | 'doc' | 'invoice' | null;

        if (!file || !attachType) {
            return NextResponse.json({ error: 'file and attach_type are required' }, { status: 400 });
        }
        if (!['photo', 'doc', 'invoice'].includes(attachType)) {
            return NextResponse.json({ error: 'attach_type must be photo, doc, or invoice' }, { status: 400 });
        }

        const ext = file.name.split('.').pop() || 'bin';
        const path = `${id}/${attachType}_${Date.now()}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        // Use supabaseAdmin for storage — avoids RLS/permission issues on bucket
        const { error: uploadError } = await supabaseAdmin.storage
            .from(BUCKET)
            .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: true });

        if (uploadError) {
            return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
        }

        const { data: urlData } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
        const url = urlData.publicUrl;

        // Store url in attachments jsonb column (works without migration)
        // Fall back gracefully if specific columns don't exist yet
        const { data: existing } = await supabaseAdmin
            .from('ppm_schedules')
            .select('attachments')
            .eq('id', id)
            .single();

        const currentAttachments: Record<string, any> = existing?.attachments || {};

        if (attachType === 'photo') {
            const photos: string[] = Array.isArray(currentAttachments.photos) ? currentAttachments.photos : [];
            currentAttachments.photos = [...photos, url];
        } else if (attachType === 'doc') {
            currentAttachments.certificate = url;
        } else {
            currentAttachments.invoice = url;
        }

        const { error: updateError } = await supabaseAdmin
            .from('ppm_schedules')
            .update({ attachments: currentAttachments, updated_at: new Date().toISOString() })
            .eq('id', id);

        if (updateError) {
            return NextResponse.json({ error: `DB update failed: ${updateError.message}` }, { status: 500 });
        }

        return NextResponse.json({ url, attachments: currentAttachments });
    } catch (err) {
        console.error('PPM attachment upload error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = request.nextUrl;
        const url = searchParams.get('url');
        const attachType = searchParams.get('attach_type') as 'photo' | 'doc' | 'invoice' | null;

        if (!url || !attachType) {
            return NextResponse.json({ error: 'url and attach_type are required' }, { status: 400 });
        }

        // Try to remove from storage
        try {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split(`/${BUCKET}/`);
            if (pathParts.length > 1) {
                await supabase.storage.from(BUCKET).remove([pathParts[1]]);
            }
        } catch {
            // Non-fatal: continue with DB update even if storage removal fails
        }

        const { data: existing, error: fetchError } = await supabaseAdmin
            .from('ppm_schedules')
            .select('completion_photos, completion_doc_url, invoice_url')
            .eq('id', id)
            .single();

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 });
        }

        let updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };

        if (attachType === 'photo') {
            const existing_photos: string[] = existing?.completion_photos || [];
            updatePayload.completion_photos = existing_photos.filter(p => p !== url);
        } else if (attachType === 'doc') {
            updatePayload.completion_doc_url = null;
        } else {
            updatePayload.invoice_url = null;
        }

        const { error: updateError } = await supabaseAdmin
            .from('ppm_schedules')
            .update(updatePayload)
            .eq('id', id);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('PPM attachment delete error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
