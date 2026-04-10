/**
 * Dashboard Service — Aggregated Dashboard Data
 *
 * Purpose: Provides pre-aggregated summary data for various dashboard views.
 * Abstracts the complexity of multiple Supabase queries behind a simple API.
 *
 * Why this exists:
 *   - Dashboards need data from many tables — this centralizes the queries.
 *   - Reduces boilerplate in API route handlers.
 *   - Provides typed return shapes for each dashboard level.
 *
 * Dashboard levels:
 *   - Property level: Single building/property metrics
 *   - Org level: All properties under an organization
 *
 * Note: Currently uses mock data for getSummary() (returns hardcoded values).
 * The other methods make real Supabase queries.
 */

import { createClient } from '@/frontend/utils/supabase/client'

const supabase = createClient()

/** Summary statistics returned by getSummary() */
export interface DashboardSummary {
    active_visitors: number      // Current visitors checked in
    occupancy_percentage: number // Building occupancy rate
    open_tickets: number        // Tickets currently in open/assigned/in_progress states
    sla_percentage: number      // Percentage of tickets resolved within SLA
    high_priority_count: number // Number of High/Critical priority tickets
}

export const dashboardService = {
    /**
     * Get a high-level summary for a property dashboard.
     *
     * What it returns:
     *   - Active visitor count
     *   - Occupancy rate
     *   - Open ticket count
     *   - SLA compliance percentage
     *   - High priority ticket count
     *
     * @param propertyId — The property to get the summary for
     * @returns DashboardSummary object with key metrics
     *
     * Current implementation: Returns mock/hardcoded data.
     * To implement for real: query tickets, visitor_logs, property_occupancy tables.
     */
    getSummary: async (propertyId: string): Promise<DashboardSummary> => {
        return {
            active_visitors: 142,
            occupancy_percentage: 78,
            open_tickets: 24,
            sla_percentage: 95,
            high_priority_count: 5
        }
    },

    /**
     * Get the property admin overview — count of open activities/tickets.
     *
     * @param propertyId — The property to query
     * @returns Object with open_tickets count
     */
    getPropertyOverview: async (propertyId: string) => {
        const { count, error } = await supabase
            .from('property_activities')
            .select('*', { count: 'exact', head: true })
            .eq('property_id', propertyId)
            .eq('status', 'open')

        if (error) throw error
        return { open_tickets: count }
    },

    /**
     * Get an organization-level portfolio overview — list of all properties with ticket counts.
     * Used by org admins and super admins to see the full picture across their portfolio.
     *
     * @param orgId — The organization UUID
     * @returns Array of { name, ticket_count } for each property
     */
    getOrgPortfolioOverview: async (orgId: string) => {
        const { data: properties, error } = await supabase
            .from('properties')
            .select(`
                id,
                name,
                property_activities (count)
            `)
            .eq('organization_id', orgId)

        if (error) throw error

        return properties.map(p => ({
            name: p.name,
            ticket_count: (p.property_activities as any)[0]?.count || 0
        }))
    }
}
