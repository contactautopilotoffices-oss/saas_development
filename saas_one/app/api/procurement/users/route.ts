/**
 * Procurement users API.
 * Lists procurement team members.
 * GET /api/procurement/users
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';

export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const adminSupabase = createAdminClient();

        // 1. Fetch users from property_memberships
        const { data: propMemberships, error: propError } = await adminSupabase
            .from('property_memberships')
            .select(`
                user_id,
                user:users!user_id(id, full_name, email, user_photo_url),
                role
            `)
            .eq('role', 'procurement')
            .eq('is_active', true);

        if (propError) {
            console.error('Error fetching property procurement users:', propError);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }

        // De-duplicate users globally
        const userMap = new Map();
        
        // Add property-level procurement users
        if (propMemberships) {
            propMemberships.forEach(m => {
                if (m.user && !userMap.has(m.user_id)) {
                    const u = m.user as any;
                    userMap.set(m.user_id, {
                        id: u.id,
                        full_name: u.full_name,
                        email: u.email,
                        user_photo_url: u.user_photo_url,
                        role: m.role
                    });
                }
            });
        }

        // 2. Fetch users from organization_memberships (Global View)
        const { data: orgMemberships, error: orgError } = await adminSupabase
            .from('organization_memberships')
            .select(`
                user_id,
                user:users!user_id(id, full_name, email, user_photo_url),
                role
            `)
            .eq('role', 'procurement');

        if (orgError) {
            console.error('Error fetching org procurement users:', orgError);
        }

        if (orgMemberships) {
            orgMemberships.forEach(m => {
                if (m.user && !userMap.has(m.user_id)) {
                    const u = m.user as any;
                    userMap.set(m.user_id, {
                        id: u.id,
                        full_name: u.full_name,
                        email: u.email,
                        user_photo_url: u.user_photo_url,
                        role: m.role
                    });
                }
            });
        }

        return NextResponse.json(Array.from(userMap.values()));
    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
