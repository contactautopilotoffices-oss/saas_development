import { createClient } from '@/frontend/utils/supabase/server';
import { NotificationService } from '@/backend/services/NotificationService';

interface AssignmentResult {
    ticketId: string;
    assignedTo: string | null;
    status: string;
    error?: string;
}

interface TicketData {
    id: string;
    property_id: string;
    skill_group_code: string | null;
}

interface ResolverStat {
    user_id: string;
    last_assigned_at: string | null;
    is_checked_in: boolean;
    skill_group?: { code: string } | any;
}

/**
 * Intelligent Assignment Logic
 * Assigns tickets to MSTs based on skill groups and load balancing (persistent round-robin)
 */
export async function processIntelligentAssignment(
    supabase: any,
    tickets: TicketData[],
    propertyId: string
): Promise<{ summary: any; results: AssignmentResult[] }> {
    const results: AssignmentResult[] = [];

    // 1. Fetch resolver stats for load balancing (sorting by last_assigned_at ensures persistent round-robin)
    const { data: resolverStats, error: statsError } = await supabase
        .from('resolver_stats')
        .select(`
            user_id, 
            last_assigned_at,
            is_checked_in,
            skill_group:skill_groups(code)
        `)
        .eq('property_id', propertyId)
        .eq('is_available', true);

    if (statsError) {
        console.error('Error fetching resolver stats:', statsError);
        throw statsError;
    }

    const typedResolverStats: ResolverStat[] = resolverStats || [];

    // 2. Fetch specific skill mappings
    const { data: mstSkills } = await supabase
        .from('mst_skills')
        .select('user_id, skill_code')
        .in('user_id', typedResolverStats.map((rs: any) => rs.user_id));

    // 2.5 Fetch user roles from property_memberships to identify staff
    const { data: userRoles } = await supabase
        .from('property_memberships')
        .select('user_id, role')
        .eq('property_id', propertyId)
        .eq('is_active', true)
        .in('user_id', typedResolverStats.map((rs: any) => rs.user_id));

    // Create a map of user_id -> role for quick lookup
    const userRoleMap: Record<string, string> = {};
    (userRoles || []).forEach((ur: any) => {
        userRoleMap[ur.user_id] = ur.role;
    });

    // 3. Map MSTs to pools (excluding staff with technical skill from assignment)
    const mstPools: Record<string, ResolverStat[]> = {
        technical: [],
        plumbing: [],
        soft_services: [],
        vendor: [],
        general: []
    };

    typedResolverStats.forEach((rs: ResolverStat) => {
        const userId = rs.user_id;
        const userRole = userRoleMap[userId];
        const primarySkill = rs.skill_group?.code;
        const extraSkills = mstSkills?.filter((s: any) => s.user_id === userId).map((s: any) => s.skill_code) || [];

        const allSkills = new Set([primarySkill, ...extraSkills].filter(Boolean));

        // Skip staff with technical skill - they can only view, not be assigned
        const isStaffTechnical = userRole === 'staff' && allSkills.has('technical');
        if (isStaffTechnical) {
            console.log(`Skipping staff technical user ${userId} from assignment pools`);
            return; // Don't add to any pools
        }

        allSkills.forEach(skill => {
            if (mstPools[skill]) {
                mstPools[skill].push(rs);
            }
        });

        // Everyone (except staff technical) is in general
        mstPools.general.push(rs);
    });

    // 4. Process tickets
    for (const ticket of tickets) {
        try {
            const poolName = (ticket.skill_group_code || 'general').toLowerCase();
            let pool = mstPools[poolName]?.length > 0 ? mstPools[poolName] : mstPools.general;

            // Prioritize checked-in users if any are available
            const checkedInPool = pool.filter(p => p.is_checked_in);
            if (checkedInPool.length > 0) pool = checkedInPool;

            let assignedTo = null;
            let status = 'waitlist';

            if (pool.length > 0) {
                // Persistent Round-Robin: Sort by last_assigned_at (nulls first)
                pool.sort((a, b) => {
                    if (!a.last_assigned_at) return -1;
                    if (!b.last_assigned_at) return 1;
                    return new Date(a.last_assigned_at).getTime() - new Date(b.last_assigned_at).getTime();
                });

                const winner = pool[0];
                assignedTo = winner.user_id;
                status = 'assigned';

                // Update the winner's local stats for the next ticket in this batch
                winner.last_assigned_at = new Date().toISOString();
            }

            // Update database
                const { error: updateError } = await supabase
                    .from('tickets')
                    .update({
                        status: status,
                        assigned_to: assignedTo,
                        assigned_at: assignedTo ? new Date().toISOString() : null,
                    })
                    .eq('id', ticket.id);

            if (updateError) throw updateError;

            // Update winner's last_assigned_at in database
            if (assignedTo) {
                await supabase
                    .from('resolver_stats')
                    .update({ last_assigned_at: new Date().toISOString() })
                    .eq('user_id', assignedTo)
                    .eq('property_id', propertyId);

                // Trigger Notification
                NotificationService.afterTicketAssigned(ticket.id, true).catch(err => {
                    console.error('[Intelligent Assignment] Notification failed:', err);
                });
            }

            results.push({ ticketId: ticket.id, assignedTo, status });
        } catch (err: any) {
            results.push({ ticketId: ticket.id, assignedTo: null, status: 'error', error: err.message });
        }
    }

    return {
        summary: {
            total: results.length,
            assigned: results.filter(r => r.status === 'assigned').length,
            waitlisted: results.filter(r => r.status === 'waitlist').length,
            errors: results.filter(r => r.status === 'error').length,
        },
        results
    };
}
