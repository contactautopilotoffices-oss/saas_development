/**
 * User Service — CRUD Operations on User Records
 *
 * Purpose: Provides typed, reusable methods for querying and updating user data.
 * Currently backed by mock data (in-memory array) — a placeholder for real DB operations.
 *
 * Why this exists:
 *   - Provides a clean abstraction layer between API routes and data access.
 *   - When switching from mock data to real Supabase queries, only this file changes.
 *   - Keeps API route handlers thin and focused on HTTP concerns.
 *
 * Note: The current implementation uses mock in-memory data with artificial delays
 * (simulating network latency). Replace the mock arrays with Supabase queries
 * when connecting to the production database.
 *
 * Mock data contains sample users with different roles for development/testing.
 */

import { User, RoleKey, RoleLevel } from '@/frontend/types/rbac'

// Mock user store — replace with Supabase queries in production
const MOCK_USERS: User[] = [
    {
        id: 'u1',
        full_name: 'Amol Lokhande',
        email: 'amol@email.com',
        role_key: 'mst',
        role_level: 1,
        property_id: 'prop-1',
        status: 'active',
        created_at: Date.now()
    },
    {
        id: 'u2',
        full_name: 'Sarah Chen',
        email: 'sarah@email.com',
        role_key: 'property_admin',
        role_level: 3,
        property_id: 'prop-1',
        status: 'active',
        created_at: Date.now()
    },
    {
        id: 'u3',
        full_name: 'Mike Ross',
        email: 'mike@email.com',
        role_key: 'tenant_user',
        role_level: 0,
        property_id: 'prop-1',
        status: 'active',
        created_at: Date.now()
    }
]

export const userService = {
    /**
     * Get all users belonging to a specific property.
     *
     * @param propertyId — Filter by this property ID
     * @returns Array of User objects (mock data filtered by property_id)
     */
    getUsers: async (propertyId: string): Promise<User[]> => {
        await new Promise(resolve => setTimeout(resolve, 400))  // Simulate network latency
        return MOCK_USERS.filter(u => u.property_id === propertyId)
    },

    /**
     * Create a new user record.
     *
     * @param user — User data without id and created_at (those are generated here)
     * @returns The newly created User object with generated id and timestamp
     */
    createUser: async (user: Omit<User, 'id' | 'created_at'>): Promise<User> => {
        await new Promise(resolve => setTimeout(resolve, 600))  // Simulate network latency
        const newUser: User = {
            ...user,
            id: `u-${Math.random().toString(36).substr(2, 9)}`,  // Generate random ID
            created_at: Date.now()
        }
        MOCK_USERS.push(newUser)
        return newUser
    },

    /**
     * Update a user's role and/or role level.
     *
     * @param userId    — The user to update
     * @param roleKey   — New role key (e.g., 'mst', 'property_admin')
     * @param roleLevel — New numeric role level (0-4)
     */
    updateRole: async (userId: string, roleKey: RoleKey, roleLevel: RoleLevel): Promise<void> => {
        await new Promise(resolve => setTimeout(resolve, 300))  // Simulate network latency
        const user = MOCK_USERS.find(u => u.id === userId)
        if (user) {
            user.role_key = roleKey
            user.role_level = roleLevel
        }
    },

    /**
     * Activate or suspend a user account.
     *
     * @param userId — The user to update
     * @param status — 'active' or 'suspended'
     */
    updateStatus: async (userId: string, status: 'active' | 'suspended'): Promise<void> => {
        await new Promise(resolve => setTimeout(resolve, 300))  // Simulate network latency
        const user = MOCK_USERS.find(u => u.id === userId)
        if (user) {
            user.status = status
        }
    }
}
