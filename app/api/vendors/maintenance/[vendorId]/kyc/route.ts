import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

type Params = { params: Promise<{ vendorId: string }> };

const KYC_BUCKET = 'vendor-kyc';

const ALLOWED_DOC_TYPES = ['gst', 'pan', 'msme', 'cancelled_cheque'] as const;
type DocType = typeof ALLOWED_DOC_TYPES[number];

const DOC_URL_FIELDS: Record<DocType, string> = {
    gst: 'gst_doc_url',
    pan: 'pan_doc_url',
    msme: 'msme_doc_url',
    cancelled_cheque: 'cancelled_cheque_url',
};

const DOC_NUMBER_FIELDS: Record<DocType, string | null> = {
    gst: 'gst_number',
    pan: 'pan_number',
    msme: 'msme_number',
    cancelled_cheque: null,
};

/**
 * POST /api/vendors/maintenance/[vendorId]/kyc
 * Upload a KYC document. Body: multipart form with:
 *   - file: File
 *   - doc_type: 'gst' | 'pan' | 'msme' | 'cancelled_cheque'
 *   - doc_number: (optional) GST/PAN/MSME number text
 */
export async function POST(request: NextRequest, { params }: Params) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { vendorId } = await params;

    // Verify caller owns this vendor profile or is admin
    const { data: vendorRow } = await supabaseAdmin
        .from('maintenance_vendors')
        .select('user_id, organization_id')
        .eq('id', vendorId)
        .single();

    if (!vendorRow) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });

    const isVendorSelf = vendorRow.user_id === user.id;
    const { data: membership } = await supabaseAdmin
        .from('organization_memberships')
        .select('role')
        .eq('user_id', user.id)
        .eq('organization_id', vendorRow.organization_id)
        .single();
    const isAdmin = membership && ['admin', 'property_admin', 'org_admin', 'org_super_admin', 'owner'].includes(membership.role);

    if (!isVendorSelf && !isAdmin) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const docType = formData.get('doc_type') as string;
    const docNumber = formData.get('doc_number') as string | null;

    if (!file || !docType) {
        return NextResponse.json({ error: 'file and doc_type are required' }, { status: 400 });
    }

    if (!ALLOWED_DOC_TYPES.includes(docType as DocType)) {
        return NextResponse.json({ error: `doc_type must be one of: ${ALLOWED_DOC_TYPES.join(', ')}` }, { status: 400 });
    }

    const ext = file.name.split('.').pop() || 'pdf';
    const storagePath = `${vendorId}/${docType}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    // Upsert to storage
    const { error: uploadError } = await supabaseAdmin.storage
        .from(KYC_BUCKET)
        .upload(storagePath, buffer, {
            contentType: file.type || 'application/octet-stream',
            upsert: true,
        });

    if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

    const { data: { publicUrl } } = supabaseAdmin.storage.from(KYC_BUCKET).getPublicUrl(storagePath);

    // Update vendor row with doc URL (and number if provided)
    const urlField = DOC_URL_FIELDS[docType as DocType];
    const numberField = DOC_NUMBER_FIELDS[docType as DocType];
    const updatePayload: Record<string, any> = {
        [urlField]: publicUrl,
        updated_at: new Date().toISOString(),
    };
    if (numberField && docNumber) {
        updatePayload[numberField] = docNumber;
    }

    const { data: updated, error: updateError } = await supabaseAdmin
        .from('maintenance_vendors')
        .update(updatePayload)
        .eq('id', vendorId)
        .select()
        .single();

    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ url: publicUrl, vendor: updated });
}
