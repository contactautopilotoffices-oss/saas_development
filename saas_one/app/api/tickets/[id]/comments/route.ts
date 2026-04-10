/**
 * POST /api/tickets/[id]/comments
 * Add a comment to a ticket. Internal comments (is_internal=true) can only be posted by Master Admins.
 * Body: { comment, is_internal? }
 * Returns the created comment with user data (full_name, email, photo).
 *
 * GET /api/tickets/[id]/comments
 * Get all comments for a ticket, ordered by created_at ascending.
 * Returns comments with nested user data (id, full_name, email).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();
        
        // Use getUser() for security, but handle it gracefully
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            console.error('Auth check failed for comment:', authError);
            return NextResponse.json({ 
                error: 'Unauthorized. Please ensure you are logged in.',
                details: authError?.message 
            }, { status: 401 });
        }

        const body = await request.json();
        const { comment, is_internal } = body;

        if (!comment) {
            return NextResponse.json({ error: 'Comment is required' }, { status: 400 });
        }

        // Verify user can access this ticket (relying on RLS)
        const { data: ticket, error: ticketError } = await supabase
            .from('tickets')
            .select('id, title')
            .eq('id', ticketId)
            .single();

        if (ticketError || !ticket) {
            console.error('Ticket access verification failed:', ticketError);
            return NextResponse.json({ 
                error: 'Ticket not found or you do not have permission to view it.' 
            }, { status: 404 });
        }

        // Check if internal comment (only Master Admin can post internal)
        const adminClient = createAdminClient();
        const { data: userRecord } = await adminClient
            .from('users')
            .select('is_master_admin')
            .eq('id', user.id)
            .single();

        const isMasterAdmin = userRecord?.is_master_admin === true;
        const finalIsInternal = is_internal && isMasterAdmin;

        const { data: newComment, error: insertError } = await supabase
            .from('ticket_comments')
            .insert({
                ticket_id: ticketId,
                user_id: user.id,
                comment,
                is_internal: finalIsInternal
            })
            .select(`
                *,
                user:users(id, full_name, email, user_photo_url)
            `)
            .single();

        if (insertError) {
            console.error('Database error adding comment:', insertError);
            return NextResponse.json({ 
                error: 'Failed to add comment to database.',
                details: insertError.message 
            }, { status: 500 });
        }

        return NextResponse.json(newComment, { status: 201 });

    } catch (error) {
        console.error('Add comment API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

/**
 * GET /api/tickets/[id]/comments
 * 
 * Get all comments for a ticket
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: ticketId } = await params;
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: comments, error: fetchError } = await supabase
            .from('ticket_comments')
            .select(`
        *,
        user:users(id, full_name, email)
      `)
            .eq('ticket_id', ticketId)
            .order('created_at', { ascending: true });

        if (fetchError) {
            console.error('Error fetching comments:', fetchError);
            return NextResponse.json({ error: 'Failed to fetch comments' }, { status: 500 });
        }

        return NextResponse.json(comments || []);

    } catch (error) {
        console.error('Get comments API error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
