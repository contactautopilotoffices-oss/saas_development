/**
 * Snag import report for a specific batch.
 * GET: Fetch report for import batch.
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ importId: string }> }
) {
    try {
        const { importId } = await params;
        const supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Fetch the import record
        const { data: importRecord, error: importError } = await supabase
            .from('snag_imports')
            .select('*')
            .eq('id', importId)
            .single();

        if (importError || !importRecord) {
            return NextResponse.json({ error: 'Import not found' }, { status: 404 });
        }

        // Fetch property details
        const { data: property } = await supabase
            .from('properties')
            .select('id, name, code, address')
            .eq('id', importRecord.property_id)
            .single();

        // Fetch all tickets from this import batch
        const { data: tickets, error: ticketsError } = await supabase
            .from('tickets')
            .select(`
                id,
                title,
                description,
                category,
                status,
                priority,
                floor_number,
                location,
                created_at,
                resolved_at,
                raised_by,
                assigned_to,
                photo_before_url,
                photo_after_url,
                ticket_number,
                raiser:raised_by(id, full_name, email),
                assignee:assigned_to(id, full_name, email)
            `)
            .eq('import_batch_id', importId)
            .order('floor_number', { ascending: true })
            .order('created_at', { ascending: false });

        if (ticketsError) {
            console.error('Error fetching tickets:', ticketsError);
            return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
        }

        const allTickets = tickets || [];

        // Calculate KPIs
        const totalSnags = allTickets.length;
        const closedSnags = allTickets.filter(t => t.status === 'resolved' || t.status === 'closed').length;
        const openSnags = allTickets.filter(t => t.status === 'open' || t.status === 'in_progress' || t.status === 'waitlist').length;
        const closureRate = totalSnags > 0 ? ((closedSnags / totalSnags) * 100).toFixed(1) : '0';

        // Group by floor
        const floorGroups: Record<string, typeof allTickets> = {};
        const floorCounts: Record<string, number> = {};

        allTickets.forEach(ticket => {
            let floor = 'Unspecified';
            if (ticket.floor_number === 0) floor = 'ground floor';
            else if (ticket.floor_number === -1) floor = 'basement';
            else if (ticket.floor_number !== null) floor = `floor ${ticket.floor_number}`;

            if (!floorGroups[floor]) {
                floorGroups[floor] = [];
                floorCounts[floor] = 0;
            }
            floorGroups[floor].push(ticket);
            floorCounts[floor]++;
        });

        // Group by category/department
        const categoryStats: Record<string, { open: number; closed: number }> = {};

        allTickets.forEach(ticket => {
            const category = ticket.category || 'other';
            if (!categoryStats[category]) {
                categoryStats[category] = { open: 0, closed: 0 };
            }
            if (ticket.status === 'resolved' || ticket.status === 'closed') {
                categoryStats[category].closed++;
            } else {
                categoryStats[category].open++;
            }
        });

        // Convert to chart data format
        const floorLabels = Object.keys(floorCounts);
        const floorData = Object.values(floorCounts);

        const deptLabels = Object.keys(categoryStats).map(c =>
            c.charAt(0).toUpperCase() + c.slice(1).replace('_', ' ')
        );
        const deptOpen = Object.values(categoryStats).map(s => s.open);
        const deptClosed = Object.values(categoryStats).map(s => s.closed);

        // Format tickets for display
        const formattedTickets = allTickets.map(ticket => ({
            id: ticket.id,
            ticketNumber: `#${ticket.id.slice(0, 8).toUpperCase()}`,
            title: ticket.title,
            description: ticket.description,
            category: ticket.category,
            status: ticket.status,
            priority: ticket.priority,
            floor: ticket.floor_number !== null ? `${ticket.floor_number}` : null,
            floorLabel: ticket.floor_number === 0 ? 'ground floor' :
                ticket.floor_number === -1 ? 'basement' :
                    ticket.floor_number !== null ? `floor ${ticket.floor_number}` : 'unspecified',
            location: ticket.location,
            reportedDate: ticket.created_at,
            closedDate: ticket.resolved_at,
            spocName: (ticket.raiser as any)?.full_name || 'Unknown',
            spocEmail: (ticket.raiser as any)?.email || '',
            assigneeName: (ticket.assignee as any)?.full_name || 'Unassigned',
            beforePhoto: (ticket as any).photo_before_url,
            afterPhoto: (ticket as any).photo_after_url,
            ticketNumberDisplay: ticket.ticket_number || `#${ticket.id.slice(0, 8).toUpperCase()}`,
        }));

        return NextResponse.json({
            success: true,
            import: {
                id: importRecord.id,
                filename: importRecord.filename,
                createdAt: importRecord.created_at,
                completedAt: importRecord.completed_at,
                totalRows: importRecord.total_rows,
                validRows: importRecord.valid_rows,
            },
            property: property || { name: 'Unknown Property', code: 'N/A' },
            kpis: {
                totalSnags,
                closedSnags,
                openSnags,
                closureRate: parseFloat(closureRate),
            },
            charts: {
                floor: {
                    labels: floorLabels,
                    data: floorData,
                },
                department: {
                    labels: deptLabels,
                    open: deptOpen,
                    closed: deptClosed,
                },
            },
            floorGroups,
            tickets: formattedTickets,
        });

    } catch (error) {
        console.error('Report API error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ importId: string }> }
) {
    try {
        const { importId } = await params;
        const supabase = await createClient();

        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. Delete associated tickets first (to clean up)
        const { error: ticketsDeleteError } = await supabase
            .from('tickets')
            .delete()
            .eq('import_batch_id', importId);

        if (ticketsDeleteError) {
            console.error('Error deleting associated tickets:', ticketsDeleteError);
            // Continue anyway, maybe there were no tickets
        }

        // 2. Delete the import record
        const { error: importDeleteError } = await supabase
            .from('snag_imports')
            .delete()
            .eq('id', importId);

        if (importDeleteError) {
            console.error('Error deleting import record:', importDeleteError);
            return NextResponse.json({ error: 'Failed to delete import record' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Import deleted successfully' });

    } catch (error) {
        console.error('Delete Import API error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
