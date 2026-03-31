import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

const BUCKET = 'amc-documents';

/**
 * POST /api/amc/contracts/[id]/documents
 * FormData: file (File), doc_type ('contract'|'invoice'|'renewal'|'certificate')
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: contractId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const docType = formData.get('doc_type') as string | null;

        if (!file || !docType) {
            return NextResponse.json({ error: 'file and doc_type are required' }, { status: 400 });
        }
        if (!['contract', 'invoice', 'renewal', 'certificate'].includes(docType)) {
            return NextResponse.json({ error: 'Invalid doc_type' }, { status: 400 });
        }

        const ext = file.name.split('.').pop() || 'bin';
        const path = `${contractId}/${docType}_${Date.now()}.${ext}`;
        const arrayBuffer = await file.arrayBuffer();
        const buffer = new Uint8Array(arrayBuffer);

        const { error: uploadError } = await supabase.storage
            .from(BUCKET)
            .upload(path, buffer, { contentType: file.type, upsert: false });

        if (uploadError) {
            return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
        const fileUrl = urlData.publicUrl;

        const { data, error } = await supabaseAdmin
            .from('amc_documents')
            .insert({
                contract_id: contractId,
                doc_type: docType,
                file_url: fileUrl,
                file_name: file.name,
                uploaded_by: user.id,
            })
            .select()
            .single();

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ document: data }, { status: 201 });
    } catch (err) {
        console.error('AMC document upload error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * DELETE /api/amc/contracts/[id]/documents?doc_id=...
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: contractId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = request.nextUrl;
        const docId = searchParams.get('doc_id');
        if (!docId) {
            return NextResponse.json({ error: 'doc_id is required' }, { status: 400 });
        }

        // Fetch doc to get file_url for storage removal
        const { data: doc } = await supabaseAdmin
            .from('amc_documents')
            .select('file_url')
            .eq('id', docId)
            .eq('contract_id', contractId)
            .single();

        if (doc?.file_url) {
            try {
                const urlObj = new URL(doc.file_url);
                const pathParts = urlObj.pathname.split(`/${BUCKET}/`);
                if (pathParts.length > 1) {
                    await supabase.storage.from(BUCKET).remove([pathParts[1]]);
                }
            } catch {
                // Non-fatal
            }
        }

        const { error } = await supabaseAdmin
            .from('amc_documents')
            .delete()
            .eq('id', docId)
            .eq('contract_id', contractId);

        if (error) return NextResponse.json({ error: error.message }, { status: 500 });

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('AMC document delete error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
