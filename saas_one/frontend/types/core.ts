export type Role =
    | 'SUPER_ADMIN'
    | 'UNIFIED_ADMIN'
    | 'PROPERTY_ADMIN'
    | 'TENANT'
    | 'VENDOR';

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    phoneNumber?: string;
    role: Role;
    organizationId: string;
    assignedPropertyIds?: string[]; // For Property Admins / Tenants
}

// --- Hierarchy Context Models ---

export interface Organization {
    id: string;
    name: string;
    code: string;
}

export interface Property {
    id: string;
    organizationId: string;
    name: string;
    address: string;
    image?: string;
    type: 'COMMERCIAL' | 'RESIDENTIAL' | 'INDUSTRIAL';
}

export interface Building {
    id: string;
    propertyId: string;
    name: string;
    code: string;
}

export interface Floor {
    id: string;
    buildingId: string;
    name: string;
    level: number;
}

export interface Space {
    id: string;
    floorId: string;
    name: string;
    type: 'OFFICE' | 'MEETING_ROOM' | 'UTILITY' | 'COMMON';
    capacity?: number;
}

// The "Context" object that drives the UI
export interface SystemContext {
    organization?: Organization;
    property?: Property;
    building?: Building;
    floor?: Floor;
    space?: Space;
}
