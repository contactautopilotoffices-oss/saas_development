/**
 * Mock data for development and testing.
 * Provides realistic fake data for properties, users, tickets, etc.
 */

import { Building, Floor, Organization, Property, Space } from "@/frontend/types/core";

export const MOCK_ORG: Organization = {
    id: 'org_001',
    name: 'Autopilot Corp',
    code: 'autopilot-corp',
};

export const MOCK_PROPERTIES: Property[] = [
    {
        id: 'prop_001',
        organizationId: 'org_001',
        name: 'Autopilot HQ',
        address: '100 Innovation Dr, San Francisco, CA',
        type: 'COMMERCIAL',
        image: '/hero-building.jpg' // using the existing public image
    },
    {
        id: 'prop_002',
        organizationId: 'org_001',
        name: 'Sander House',
        address: '250 Executive Park, New York, NY',
        type: 'RESIDENTIAL',
    }
];

export const MOCK_BUILDINGS: Record<string, Building[]> = {
    'prop_001': [
        { id: 'bld_001', propertyId: 'prop_001', name: 'Tower A', code: 'T-A' },
        { id: 'bld_002', propertyId: 'prop_001', name: 'Tower B', code: 'T-B' },
    ],
    'prop_002': [
        { id: 'bld_003', propertyId: 'prop_002', name: 'Main Residence', code: 'MR' },
    ]
};

export const MOCK_FLOORS: Record<string, Floor[]> = {
    'bld_001': Array.from({ length: 10 }, (_, i) => ({
        id: `fl_a_${i}`,
        buildingId: 'bld_001',
        name: `Level ${i + 1}`,
        level: i + 1
    })),
    'bld_002': Array.from({ length: 5 }, (_, i) => ({
        id: `fl_b_${i}`,
        buildingId: 'bld_002',
        name: `Level ${i + 1}`,
        level: i + 1
    })),
    'bld_003': Array.from({ length: 20 }, (_, i) => ({
        id: `fl_r_${i}`,
        buildingId: 'bld_003',
        name: `Floor ${i + 1}`,
        level: i + 1
    })),
};

export function getProperties(orgId: string) {
    return MOCK_PROPERTIES.filter(p => p.organizationId === orgId);
}

export function getBuildings(propertyId: string) {
    return MOCK_BUILDINGS[propertyId] || [];
}

export function getFloors(buildingId: string) {
    return MOCK_FLOORS[buildingId] || [];
}
