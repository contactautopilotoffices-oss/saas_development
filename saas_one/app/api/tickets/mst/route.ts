/**
 * GET /api/tickets/mst
 * MST-specific ticket views with query params: propertyId, view, department
 * Views:
 *   - my_active: current MST's single active (in_progress, not paused) ticket + paused tickets
 *   - department: all property tickets by department, categorized into waitlist/my/others
 *   - all: all property tickets grouped by status (waitlist/assigned/in_progress/paused/completed)
 *   - load: MST workload data (active count, paused count, availability) sorted by least loaded
 * Auth: Supabase session. MST role (mst or staff) enforced via property_memberships.role check.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { TicketDepartment } from '@/frontend/types/ticketing';

// Type for ticket from database
interface DbTicket {
    id: string;
    status: string;
    department: TicketDepartment;
    assigned_to: string | null;
    work_paused: boolean;
    [key: string]: unknown;
}

// Type for MST member from database
interface DbMstMember {
    user_id: string;
    user: {
        id: string;
        full_name: string;
        email: string;
    }[] | null;
}

// Type for MST load
interface MstLoadItem {
    userId: string;
    fullName: string;
    email: string | undefined;
    activeTicketCount: number;
    pausedTicketCount: number;
    isAvailable: boolean;
}

/**
 * GET /api/tickets/mst
 * MST-specific ticket views:
 * - view=my_active: Current user's active ticket (in_progress, not paused)
 * - view=department: Tickets by department (technical, soft_services, vendor)
 * - view=all: All property tickets (read-only)
 * - view=load: MST workload data for the property
 */
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const propertyId = searchParams.get('propertyId') || searchParams.get('property_id');
        const view = searchParams.get('view') || 'all';
        const department = searchParams.get('department') || searchParams.get('dept') as TicketDepartment | null;

        if (!propertyId) {
            return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
        }

        // Base ticket select query with relations
        const ticketSelect = `
            *,
            assignee:users!assigned_to(id, full_name, email, user_photo_url),
            creator:users!raised_by(id, full_name, email),
            property:properties(id, name, code),
            ticket_escalation_logs(from_level, to_level, escalated_at, from_employee:users!from_employee_id(full_name, user_photo_url), to_employee:users!to_employee_id(full_name, user_photo_url))
        `;

        switch (view) {
            case 'my_active': {
                // Get current user's active ticket (assigned + in_progress, not paused)
                const { data: activeTicket, error } = await supabase
                    .from('tickets')
                    .select(ticketSelect)
                    .eq('property_id', propertyId)
                    .eq('assigned_to', user.id)
                    .in('status', ['assigned', 'in_progress'])
                    .eq('work_paused', false)
                    .order('work_started_at', { ascending: false, nullsFirst: false })
                    .limit(1)
                    .maybeSingle();

                if (error) {
                    console.error('Error fetching active ticket:', error);
                    return NextResponse.json({ error: 'Failed to fetch active ticket' }, { status: 500 });
                }

                // Also get paused tickets for the user
                const { data: pausedTickets } = await supabase
                    .from('tickets')
                    .select(ticketSelect)
                    .eq('property_id', propertyId)
                    .eq('assigned_to', user.id)
                    .eq('work_paused', true)
                    .order('work_paused_at', { ascending: false });

                return NextResponse.json({
                    activeTicket,
                    pausedTickets: pausedTickets || [],
                    hasActiveWork: !!activeTicket,
                });
            }

            case 'department': {
                // Get tickets by department with categorization
                let query = supabase
                    .from('tickets')
                    .select(ticketSelect)
                    .eq('property_id', propertyId)
                    .not('status', 'in', '("closed","resolved")')
                    .order('created_at', { ascending: false });

                if (department) {
                    query = query.eq('department', department);
                }

                const { data: tickets, error } = await query;

                if (error) {
                    console.error('Error fetching department tickets:', error);
                    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
                }

                // Categorize tickets
                const waitlist = (tickets || []).filter((t: DbTicket) => 
                    t.status === 'waitlist' || (t.status === 'open' && !t.assigned_to)
                );
                const myTickets = (tickets || []).filter((t: DbTicket) => 
                    t.assigned_to === user.id
                );
                const othersTickets = (tickets || []).filter((t: DbTicket) => 
                    t.assigned_to && t.assigned_to !== user.id
                );

                // Get counts by department
                const departmentCounts = {
                    technical: (tickets || []).filter((t: DbTicket) => t.department === 'technical').length,
                    soft_services: (tickets || []).filter((t: DbTicket) => t.department === 'soft_services').length,
                    vendor: (tickets || []).filter((t: DbTicket) => t.department === 'vendor').length,
                };

                return NextResponse.json({
                    tickets: tickets || [],
                    categorized: {
                        waitlist,
                        myTickets,
                        othersTickets,
                    },
                    departmentCounts,
                    currentDepartment: department,
                });
            }

            case 'all': {
                // Get all property tickets (read-only view)
                const { data: tickets, error } = await supabase
                    .from('tickets')
                    .select(ticketSelect)
                    .eq('property_id', propertyId)
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (error) {
                    console.error('Error fetching all tickets:', error);
                    return NextResponse.json({ error: 'Failed to fetch tickets' }, { status: 500 });
                }

                // Group by status for summary
                const statusCounts = {
                    waitlist: (tickets || []).filter((t: DbTicket) => t.status === 'waitlist').length,
                    assigned: (tickets || []).filter((t: DbTicket) => t.status === 'assigned').length,
                    in_progress: (tickets || []).filter((t: DbTicket) => t.status === 'in_progress').length,
                    paused: (tickets || []).filter((t: DbTicket) => t.status === 'paused' || t.work_paused).length,
                    completed: (tickets || []).filter((t: DbTicket) => ['closed', 'resolved'].includes(t.status)).length,
                };

                return NextResponse.json({
                    tickets: tickets || [],
                    statusCounts,
                    total: tickets?.length || 0,
                });
            }

            case 'load': {
                // Get MST workload data for the property
                // First, get all MSTs in the property
                const { data: mstMembers, error: membersError } = await supabase
                    .from('property_memberships')
                    .select(`
                        user_id,
                        user:users!user_id(id, full_name, email)
                    `)
                    .eq('property_id', propertyId)
                    .in('role', ['mst', 'staff']);

                if (membersError) {
                    console.error('Error fetching MST members:', membersError);
                    return NextResponse.json({ error: 'Failed to fetch MST data' }, { status: 500 });
                }

                // Get ticket counts for each MST
                const mstLoads: MstLoadItem[] = await Promise.all((mstMembers || []).map(async (member: DbMstMember) => {
                    const { count: activeCount } = await supabase
                        .from('tickets')
                        .select('*', { count: 'exact', head: true })
                        .eq('property_id', propertyId)
                        .eq('assigned_to', member.user_id)
                        .in('status', ['assigned', 'in_progress'])
                        .eq('work_paused', false);

                    const { count: pausedCount } = await supabase
                        .from('tickets')
                        .select('*', { count: 'exact', head: true })
                        .eq('property_id', propertyId)
                        .eq('assigned_to', member.user_id)
                        .eq('work_paused', true);

                    // Get resolver availability status
                    const { data: resolverStats } = await supabase
                        .from('resolver_stats')
                        .select('is_available')
                        .eq('user_id', member.user_id)
                        .eq('property_id', propertyId)
                        .maybeSingle();

                    return {
                        userId: member.user_id,
                        fullName: member.user?.[0]?.full_name || 'Unknown',
                        email: member.user?.[0]?.email,
                        activeTicketCount: activeCount || 0,
                        pausedTicketCount: pausedCount || 0,
                        isAvailable: resolverStats?.is_available ?? true,
                    };
                }));

                // Sort by active ticket count (least loaded first)
                mstLoads.sort((a: MstLoadItem, b: MstLoadItem) => a.activeTicketCount - b.activeTicketCount);

                return NextResponse.json({
                    mstLoads,
                    totalMsts: mstLoads.length,
                    suggestedAssignee: mstLoads.find((m: MstLoadItem) => m.isAvailable) || mstLoads[0] || null,
                });
            }

            default:
                return NextResponse.json({ error: `Unknown view: ${view}` }, { status: 400 });
        }
    } catch (error) {
        console.error('MST tickets API error:', error);
        return NextResponse.json({ 
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
