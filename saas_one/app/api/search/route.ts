/**
 * Cross-table global search across tickets, users, properties, and organizations.
 *
 * HTTP Methods: GET
 *
 * GET — Performs a case-insensitive ILIKE search in parallel across four tables
 *   and returns a unified, typed result array for autocomplete/typeahead use.
 *   Query params: q (search string, minimum 2 characters)
 *   Returns: { results: SearchResult[] } where each result has:
 *     type: 'ticket' | 'user' | 'property' | 'organization'
 *     label: display name (e.g. ticket title, user full name)
 *     sublabel: secondary info (e.g. ticket number, email)
 *     plus all fields from the source table (id, etc.)
 *
 * Depends on:
 *   - Supabase auth (createClient — session-based)
 *   - tickets, users, properties, organizations tables
 */

import { createClient } from '@/frontend/utils/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.length < 2) {
        return NextResponse.json({ results: [] });
    }

    const supabase = await createClient();

    try {
        // Parallel search across multiple tables
        const [
            ticketsRes,
            usersRes,
            propertiesRes,
            orgsRes
        ] = await Promise.all([
            // Search Tickets
            supabase
                .from('tickets')
                .select('id, title, ticket_number, status, priority, organization_id')
                .or(`title.ilike.%${query}%,description.ilike.%${query}%,ticket_number.ilike.%${query}%`)
                .limit(5),

            // Search Users
            supabase
                .from('users')
                .select('id, full_name, email')
                .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
                .limit(5),

            // Search Properties
            supabase
                .from('properties')
                .select('id, name, code, address, organization_id')
                .or(`name.ilike.%${query}%,code.ilike.%${query}%,address.ilike.%${query}%`)
                .limit(5),

            // Search Organizations (Master Admin only or restricted by role)
            supabase
                .from('organizations')
                .select('id, name, code')
                .or(`name.ilike.%${query}%,code.ilike.%${query}%`)
                .limit(5)
        ]);

        const results = [
            ...(ticketsRes.data?.map(t => ({ ...t, type: 'ticket', label: t.title, sublabel: `#${t.ticket_number}` })) || []),
            ...(usersRes.data?.map(u => ({ ...u, type: 'user', label: u.full_name, sublabel: u.email })) || []),
            ...(propertiesRes.data?.map(p => ({ ...p, type: 'property', label: p.name, sublabel: p.code })) || []),
            ...(orgsRes.data?.map(o => ({ ...o, type: 'organization', label: o.name, sublabel: o.code })) || [])
        ];

        return NextResponse.json({ results });
    } catch (error) {
        console.error('Search API Error:', error);
        return NextResponse.json({ error: 'Search failed' }, { status: 500 });
    }
}
