/**
 * Generate invite links API.
 * Creates and lists custom signup invite links for properties.
 * POST: Create invite link | GET: List invite links.
 * Auth: Master Admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

/**
 * POST /api/invite-links/generate
 * 
 * Generate a custom signup link for a property (Master Admin only)
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify Master Admin
        const adminClient = createAdminClient();
        const { data: userRecord } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .single();

        if (!userRecord?.is_master_admin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { organization_id, property_id, role, expires_at, max_uses, metadata } = body;

        if (!organization_id || !property_id || !role) {
            return NextResponse.json(
                { error: 'Missing required fields: organization_id, property_id, role' },
                { status: 400 }
            );
        }

        // Generate unique code
        const { data: codeData } = await adminClient.rpc('generate_invite_code');
        const invitationCode = codeData || `INV_${Math.random().toString(36).substring(2, 15)}`;

        // Calculate expiry (default 7 days)
        const expiresAtDate = expires_at
            ? new Date(expires_at)
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Create invite link
        const { data: inviteLink, error: insertError } = await adminClient
            .from('invite_links')
            .insert({
                organization_id,
                property_id,
                role,
                invitation_code: invitationCode,
                expires_at: expiresAtDate.toISOString(),
                created_by: user.id,
                max_uses: max_uses || 1,
                metadata: metadata || {}
            })
            .select(`
        *,
        organization:organizations(id, name, code),
        property:properties(id, name, code)
      `)
            .single();

        if (insertError) {
            console.error('Error creating invite link:', insertError);
            return NextResponse.json({ error: 'Failed to create invite link' }, { status: 500 });
        }

        // Construct the full URL
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const inviteUrl = `${baseUrl}/join?code=${invitationCode}`;

        return NextResponse.json({
            ...inviteLink,
            invite_url: inviteUrl
        }, { status: 201 });

    } catch (error) {
        console.error('Generate invite link API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * GET /api/invite-links/generate
 * 
 * List all invite links (Master Admin only)
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Verify Master Admin
        const adminClient = createAdminClient();
        const { data: userRecord } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .single();

        if (!userRecord?.is_master_admin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const organizationId = searchParams.get('organization_id');
        const propertyId = searchParams.get('property_id');

        let query = adminClient
            .from('invite_links')
            .select(`
        *,
        organization:organizations(id, name, code),
        property:properties(id, name, code),
        created_by_user:users!invite_links_created_by_fkey(id, full_name, email)
      `)
            .order('created_at', { ascending: false });

        if (organizationId) {
            query = query.eq('organization_id', organizationId);
        }

        if (propertyId) {
            query = query.eq('property_id', propertyId);
        }

        const { data: inviteLinks, error: fetchError } = await query;

        if (fetchError) {
            console.error('Error fetching invite links:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch invite links' }, { status: 500 });
        }

        // Add full URL to each link
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const linksWithUrls = (inviteLinks || []).map(link => ({
            ...link,
            invite_url: `${baseUrl}/join?code=${link.invitation_code}`
        }));

        return NextResponse.json(linksWithUrls);

    } catch (error) {
        console.error('List invite links API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
