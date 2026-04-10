/**
 * Intelligent Ticket Assignment Engine
 *
 * Purpose: Automatically assigns newly created tickets to the best-fit Maintenance Staff (MST)
 * based on skill group matching and load balancing (persistent round-robin).
 *
 * How assignment works:
 *   1. Fetch all available MSTs for the property from resolver_stats table.
 *   2. Organize MSTs into skill-group pools (technical, plumbing, vendor, soft_services, general).
 *   3. For each ticket: find the best pool based on skill_group_code.
 *   4. Within the pool: sort by last_assigned_at (oldest first = most available).
 *   5. Assign to the winner and update their last_assigned_at.
 *   6. If no MST is available: status = 'waitlist', no assignment.
 *
 * Round-Robin Strategy:
 *   - Tickets are distributed fairly across MSTs by tracking last_assigned_at.
 *   - The MST who hasn't been assigned in the longest time gets the next ticket.
 *   - This prevents a single MST from being overloaded while others sit idle.
 *
 * Skill Group Routing:
 *   - A ticket classified as 'plumbing' goes to the plumbing pool.
 *   - If the plumbing pool is empty, it falls back to the 'general' pool.
 *   - Staff with role='staff' AND skill='technical' are EXCLUDED — they can only view, not act.
 *
 * Notifications:
 *   - After a successful assignment, NotificationService.afterTicketAssigned() is called
 *     to send in-app and/or push notifications to the assigned MST.
 *
 * API used: Supabase (resolver_stats, property_memberships, mst_skills, tickets tables)
 */

import { NotificationService } from '@/backend/services/NotificationService'

// --- Types ---

/** Result of assigning a single ticket */
interface AssignmentResult {
    ticketId: string
    assignedTo: string | null   // User ID of the assignee (null if waitlisted)
    status: string             // 'assigned' | 'waitlist' | 'error'
    error?: string             // Error message if status = 'error'
}

/** Minimal ticket data needed for assignment */
interface TicketData {
    id: string
    property_id: string
    skill_group_code: string | null  // The department bucket from classification
}

/** Resolver stat record from the DB — tracks MST availability and workload */
interface ResolverStat {
    user_id: string
    last_assigned_at: string | null  // When this MST was last assigned a ticket
    is_checked_in: boolean          // Is the MST currently on shift?
    skill_group?: { code: string } | any  // Their primary skill group
}

// --- Core Assignment Function ---

/**
 * Process intelligent assignment for a batch of tickets.
 *
 * @param supabase    — Authenticated Supabase client
 * @param tickets     — Array of tickets to assign
 * @param propertyId  — The property context (determines which MSTs are available)
 * @returns Summary stats and individual assignment results for each ticket
 *
 * What it does:
 *   1. Fetches resolver_stats for all available MSTs in this property.
 *   2. Fetches extra skill mappings (mst_skills table) for cross-skill assignments.
 *   3. Fetches user roles to exclude staff+technical users.
 *   4. Builds skill-group pools (excluding disqualified users).
 *   5. For each ticket: selects pool → sorts by last_assigned_at → assigns winner.
 *   6. Updates ticket's assigned_to + assigned_at in DB.
 *   7. Updates winner's last_assigned_at for next-round fairness.
 *   8. Triggers notification to the assigned MST.
 */
export async function processIntelligentAssignment(
    supabase: any,
    tickets: TicketData[],
    propertyId: string
): Promise<{ summary: any; results: AssignmentResult[] }> {
    const results: AssignmentResult[] = []

    // --- Step 1: Fetch available MSTs ---
    // resolver_stats tracks: availability, check-in status, last assignment time
    // We only want MSTs who are currently available (is_available = true)
    const { data: resolverStats, error: statsError } = await supabase
        .from('resolver_stats')
        .select(`
            user_id,
            last_assigned_at,
            is_checked_in,
            skill_group:skill_groups(code)
        `)
        .eq('property_id', propertyId)
        .eq('is_available', true)

    if (statsError) {
        console.error('Error fetching resolver stats:', statsError)
        throw statsError
    }

    const typedResolverStats: ResolverStat[] = resolverStats || []

    // --- Step 2: Fetch extra skill mappings ---
    // mst_skills allows MSTs to have additional skills beyond their primary one
    // e.g., an 'mst' with plumbing skill can also handle plumbing tickets
    const { data: mstSkills } = await supabase
        .from('mst_skills')
        .select('user_id, skill_code')
        .in('user_id', typedResolverStats.map((rs: any) => rs.user_id))

    // --- Step 2.5: Fetch user roles ---
    // property_memberships.role tells us if a user is 'staff', 'mst', 'hk', etc.
    const { data: userRoles } = await supabase
        .from('property_memberships')
        .select('user_id, role')
        .eq('property_id', propertyId)
        .eq('is_active', true)
        .in('user_id', typedResolverStats.map((rs: any) => rs.user_id))

    // Build a fast lookup map: userId → role
    const userRoleMap: Record<string, string> = {}
    ;(userRoles || []).forEach((ur: any) => { userRoleMap[ur.user_id] = ur.role })

    // --- Step 3: Build skill-group pools ---
    // Each pool contains the resolver_stats for MSTs who can handle that group
    const mstPools: Record<string, ResolverStat[]> = {
        technical: [], plumbing: [], soft_services: [], vendor: [], general: []
    }

    typedResolverStats.forEach((rs: ResolverStat) => {
        const userId = rs.user_id
        const userRole = userRoleMap[userId]
        const primarySkill = rs.skill_group?.code
        const extraSkills = (mstSkills || [])
            .filter((s: any) => s.user_id === userId)
            .map((s: any) => s.skill_code)

        const allSkills = new Set([primarySkill, ...extraSkills].filter(Boolean))

        // EXCLUDE: Users with role='staff' AND skill='technical'
        // Staff+technical users can only VIEW tickets, not be assigned work
        const isStaffTechnical = userRole === 'staff' && allSkills.has('technical')
        if (isStaffTechnical) {
            console.log(`Skipping staff technical user ${userId} from assignment pools`)
            return  // Don't add to any pool
        }

        // Add this MST to each skill pool they belong to
        allSkills.forEach(skill => {
            if (mstPools[skill]) {
                mstPools[skill].push(rs)
            }
        })

        // Everyone (except staff+technical) goes into the general pool as fallback
        mstPools.general.push(rs)
    })

    // --- Step 4: Process each ticket ---
    for (const ticket of tickets) {
        try {
            // Select pool: try ticket's skill group first, fall back to general
            const poolName = (ticket.skill_group_code || 'general').toLowerCase()
            let pool = mstPools[poolName]?.length > 0 ? mstPools[poolName] : mstPools.general

            // Within the pool, prioritize checked-in MSTs (prefer on-shift workers)
            const checkedInPool = pool.filter(p => p.is_checked_in)
            if (checkedInPool.length > 0) pool = checkedInPool

            let assignedTo: string | null = null
            let status = 'waitlist'

            if (pool.length > 0) {
                // Persistent Round-Robin: Sort by last_assigned_at (nulls first = never assigned)
                // The MST with the oldest (or null) last_assigned_at gets the ticket
                pool.sort((a, b) => {
                    if (!a.last_assigned_at) return -1
                    if (!b.last_assigned_at) return 1
                    return new Date(a.last_assigned_at).getTime() - new Date(b.last_assigned_at).getTime()
                })

                const winner = pool[0]
                assignedTo = winner.user_id
                status = 'assigned'

                // Update winner's local record for the next ticket in this batch
                // (The DB is also updated below, but this keeps the in-memory sort correct)
                winner.last_assigned_at = new Date().toISOString()
            }

            // Update the ticket in the database
            const { error: updateError } = await supabase
                .from('tickets')
                .update({
                    status: status,
                    assigned_to: assignedTo,
                    assigned_at: assignedTo ? new Date().toISOString() : null,
                })
                .eq('id', ticket.id)

            if (updateError) throw updateError

            // Update winner's last_assigned_at in DB (for persistence across requests)
            if (assignedTo) {
                await supabase
                    .from('resolver_stats')
                    .update({ last_assigned_at: new Date().toISOString() })
                    .eq('user_id', assignedTo)
                    .eq('property_id', propertyId)

                // Trigger notification to the assigned MST
                NotificationService.afterTicketAssigned(ticket.id, true).catch(err => {
                    console.error('[Intelligent Assignment] Notification failed:', err)
                })
            }

            results.push({ ticketId: ticket.id, assignedTo, status })
        } catch (err: any) {
            results.push({ ticketId: ticket.id, assignedTo: null, status: 'error', error: err.message })
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
    }
}
