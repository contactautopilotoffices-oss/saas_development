/**
 * Organization module configuration API.
 * Returns module usage analytics for an organization.
 * GET /api/admin/organizations/[orgId]/modules
 * Auth: Master Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';

/**
 * GET /api/admin/organizations/[orgId]/modules
 * 
 * Get module usage analytics
 * Uses service role - bypasses RLS
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ orgId: string }> }
) {
    const { orgId } = await params;

    // Return empty modules for now
    return NextResponse.json({
        modules: []
    });
}
