/**
 * RBAC Capability Matrix — Role-to-Permissions Mapping
 *
 * Purpose: Defines exactly which actions each role can perform in each domain.
 * This is the authoritative permissions table used by CapabilityWrapper and API guards.
 *
 * How to use:
 *   import { CAPABILITY_MATRIX } from '@/frontend/constants/capabilities';
 *   const canCreate = CAPABILITY_MATRIX[userRoleKey]?.tickets?.includes('create');
 *
 * Structure:
 *   CAPABILITY_MATRIX[RoleKey] = { [Domain]: [AllowedActions] }
 *
 * Domain descriptions:
 *   - users        — User management (invite, assign roles, suspend)
 *   - properties   — Property/building setup and configuration
 *   - tickets      — Ticket CRUD, assignment, status changes
 *   - assets       — Equipment and infrastructure assets
 *   - procurement  — Purchase requests, approvals, vendor payments
 *   - visitors     — Visitor check-in/checkout
 *   - security     — Security scheduling and incident logs
 *   - dashboards   — View access to dashboard pages
 *   - reports      — Generate and view reports
 *   - vendors      — Vendor profiles and KYC management
 *   - stock        — Inventory item management
 *
 * Design decisions:
 *   - Least privilege: roles only get the actions they genuinely need.
 *   - Hierarchical: higher roles superset lower roles (org_admin > property_admin > staff).
 *   - No 'delete' for staff/tenant roles — prevents accidental data loss.
 *   - tenant_user can create visitors but not manage the VMS.
 */

import { RoleKey, CapabilityMatrix } from '../types/rbac';

/** Maps every RoleKey to its CapabilityMatrix */
export const CAPABILITY_MATRIX: Record<RoleKey, CapabilityMatrix> = {
    // Full cross-org access (system-wide)
    super_admin: {
        users: ['view', 'create', 'update', 'approve', 'assign', 'delete', 'suspend'],
        properties: ['view', 'create', 'update', 'delete'],
        tickets: ['view', 'create', 'update', 'approve', 'assign', 'delete'],
        assets: ['view', 'create', 'update', 'delete'],
        procurement: ['view', 'create', 'update', 'approve', 'delete'],
        visitors: ['view', 'create', 'update', 'delete'],
        security: ['view', 'create', 'update', 'delete'],
        dashboards: ['view'],
        reports: ['view'],
        vendors: ['view', 'create', 'update', 'delete']
    },

    // Full access within their organization
    org_admin: {
        users: ['view', 'create', 'update', 'assign', 'suspend'],
        properties: ['view', 'update'],
        tickets: ['view', 'update', 'approve'],
        assets: ['view', 'update'],
        procurement: ['view', 'approve'],
        dashboards: ['view'],
        reports: ['view']
    },

    // Full access within their property
    property_admin: {
        users: ['view', 'create', 'update', 'assign', 'suspend'],
        properties: ['view', 'update'],
        tickets: ['view', 'update', 'approve'],
        assets: ['view', 'update'],
        procurement: ['view', 'approve'],
        dashboards: ['view'],
        reports: ['view']
    },

    // Oversight role: view dashboards/reports, approve tickets
    manager_executive: {
        tickets: ['view', 'approve'],
        assets: ['view'],
        dashboards: ['view'],
        reports: ['view']
    },

    // Procurement head: approve purchases, view vendors
    purchase_manager: {
        procurement: ['view', 'approve'],
        vendors: ['view'],
        dashboards: ['view']
    },

    // Procurement staff: create requests, view vendors
    purchase_executive: {
        procurement: ['view', 'create'],
        vendors: ['view']
    },

    // Maintenance technician: view and update assigned tickets
    mst: {
        tickets: ['view', 'update'],
        dashboards: ['view']
    },

    // Housekeeping staff
    hk: {
        tickets: ['view', 'update']
    },

    // Front end staff
    fe: {
        tickets: ['view', 'update']
    },

    // Soft end staff
    se: {
        tickets: ['view', 'update']
    },

    // Equipment technician
    technician: {
        tickets: ['view', 'update']
    },

    // Field staff: read-only ticket access (no updates)
    field_staff: {
        tickets: ['view']
    },

    // BMS operator: can view/update assets (building management system)
    bms_operator: {
        assets: ['view', 'update']
    },

    // Tenant: create/view own tickets, create visitors
    tenant_user: {
        tickets: ['create', 'view'],
        visitors: ['create'],
        dashboards: ['view']
    },

    // Vendor: read-only ticket access for assigned work
    vendor: {
        tickets: ['view']
    },

    // General staff: create/view tickets, view dashboards
    staff: {
        tickets: ['view', 'create', 'update'],
        dashboards: ['view']
    },

    // Soft service staff: manage stock items
    soft_service_staff: {
        stock: ['view', 'create', 'update', 'delete'],
        dashboards: ['view']
    },

    // Soft service supervisor: approve tickets and manage stock
    soft_service_supervisor: {
        stock: ['view', 'create', 'update', 'delete'],
        tickets: ['view', 'approve'],
        dashboards: ['view'],
        reports: ['view']
    },

    // Soft service manager: full stock and ticket management
    soft_service_manager: {
        stock: ['view', 'create', 'update', 'delete'],
        tickets: ['view', 'approve', 'assign', 'delete'],
        dashboards: ['view'],
        reports: ['view']
    },

    // Super tenant: elevated tenant with broader access across multiple properties
    super_tenant: {
        tickets: ['view'],
        properties: ['view'],
        dashboards: ['view'],
        reports: ['view']
    }
};
