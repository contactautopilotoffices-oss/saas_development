/**
 * GET /api/vms/[propertyId]/hosts
 * Get searchable list of hosts (staff + tenants) for auto-complete
 * Uses service role to allow anonymous kiosk access
 * Params: q (search query), limit (default 20)
 * Returns: array of { id, name, email, role }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    try {
        const { propertyId } = await params;
        const { searchParams } = new URL(request.url);

        // Use service role client for anonymous kiosk access
        const supabaseAdmin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        );

        const search = searchParams.get('q') || '';
        const limit = parseInt(searchParams.get('limit') || '20');

        // Get property members who can receive visitors
        let query = supabaseAdmin
            .from('property_memberships')
            .select(`
                user_id,
                role,
                user:users!inner(id, full_name, email)
            `)
            .eq('property_id', propertyId)
            .eq('is_active', true);

        // Apply search filter in DB
        if (search) {
            query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`, { foreignTable: 'users' });
        }

        const { data: memberships, error } = await query
            .limit(limit)
            .order('full_name', { foreignTable: 'users' });

        if (error) {
            console.error('Hosts fetch error:', error);
            return NextResponse.json({ error: 'Failed to fetch hosts' }, { status: 500 });
        }

        // Format results
        const hosts = (memberships || []).map((m: any) => ({
            id: m.user_id,
            name: m.user.full_name,
            email: m.user.email,
            role: m.role,
        }));

        return NextResponse.json({
            hosts,
            total: hosts.length,
        });
    } catch (error) {
        console.error('Hosts error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
