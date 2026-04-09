/**
 * RBAC (Role-Based Access Control) Types
 *
 * Purpose: Defines the type system for roles, capabilities, and permissions.
 * This is the single source of truth for what each role can and cannot do.
 *
 * Key concepts:
 *   - RoleKey: The specific role a user has (e.g., 'mst', 'property_admin')
 *   - RoleLevel: Numeric hierarchy (0=highest, 4=lowest) for quick comparisons
 *   - CapabilityDomain: The functional area (e.g., 'tickets', 'users', 'procurement')
 *   - CapabilityAction: What can be done (view, create, update, approve, assign, delete, suspend)
 *   - CapabilityMatrix: Map of domain → allowed actions for a given role
 *
 * How permissions are checked:
 *   - CAPABILITY_MATRIX[roleKey][domain] → array of allowed actions
 *   - Check: CAPABILITY_MATRIX[roleKey]?.tickets?.includes('create')
 *
 * Role hierarchy (RoleLevel):
 *   0 = super_admin          — Cross-org full access
 *   1 = org_admin           — Full access within one org
 *   2 = property_admin      — Full access within one property
 *   3 = manager_executive   — Reports and ticket oversight
 *   4 = staff/tenant/vendor — Limited, domain-specific access
 */

export type RoleLevel = 0 | 1 | 2 | 3 | 4;

/** All valid role keys in the system */
export type RoleKey =
    | 'super_admin'
    | 'org_admin'
    | 'property_admin'
    | 'manager_executive'
    | 'purchase_manager'
    | 'purchase_executive'
    | 'mst' | 'hk' | 'fe' | 'se' | 'technician' | 'field_staff' | 'bms_operator' | 'staff'
    | 'soft_service_staff' | 'soft_service_supervisor' | 'soft_service_manager'
    | 'tenant_user' | 'vendor'
    | 'super_tenant';

/** All functional areas that can be permission-controlled */
export type CapabilityDomain =
    | 'users'           // User management
    | 'properties'      // Property/building management
    | 'tickets'         // Ticket creation, updates, assignment
    | 'assets'          // Inventory and equipment
    | 'procurement'     // Purchase requests and vendor payments
    | 'visitors'        // Visitor management system
    | 'security'        // Security guard scheduling and logs
    | 'dashboards'      // Dashboard access
    | 'reports'         // Report generation
    | 'vendors'         // Vendor management
    | 'stock';          // Stock/inventory management

/** All possible actions within a domain */
export type CapabilityAction = 'view' | 'create' | 'update' | 'approve' | 'assign' | 'delete' | 'suspend';

/** Maps a role + domain to a list of allowed actions */
export type CapabilityMatrix = Partial<Record<CapabilityDomain, CapabilityAction[]>>;

/**
 * User entity — the primary user record in the application.
 * Stored in the `users` table with a FK to auth.users.
 */
export interface User {
    id: string;
    external_auth_id?: string;     // SSO link (Zoho, etc.)
    full_name: string;
    email: string;
    phone?: string;
    role_key: RoleKey;            // Their primary role
    role_level: RoleLevel;       // Numeric role level (0-4)
    property_id: string;         // Their primary property (context)
    status: 'invited' | 'active' | 'suspended';
    created_at: number;           // Unix timestamp
}

/**
 * Request context — lightweight auth context for API route handlers.
 * Contains everything needed to authorize a request.
 */
export interface RequestContext {
    user_id: string;
    role_key: RoleKey;
    role_level: RoleLevel;
    property_id: string;
    capabilities: CapabilityMatrix;  // Pre-built permission map for this role
}
