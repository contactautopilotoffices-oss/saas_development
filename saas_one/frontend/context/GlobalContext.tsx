/**
 * Global Context — Hierarchical Property Navigation
 *
 * Purpose: Tracks the user's current position in the property hierarchy
 * (Organization → Property → Building → Floor → Space) and provides
 * navigation helpers to move up/down the hierarchy.
 *
 * Why this exists:
 *   - Many pages need to know the currently selected property, building, etc.
 *   - The context maintains a "breadcrumb trail" of the user's navigation path.
 *   - Navigation helpers (selectProperty, selectBuilding, selectFloor, navigateUp)
 *     manage the drill-down state so pages don't need to manage it themselves.
 *
 * Hierarchy levels (top to bottom):
 *   Organization → Property → Building → Floor → Space
 *
 * Usage:
 *   const { context, selectProperty, navigateUp } = useGlobalContext();
 *
 * Note: Currently backed by mock data (mock-data.ts). Replace with real
 * Supabase queries when connecting to the production database.
 */

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Organization, Property, Building, Floor, Space, SystemContext } from '@/frontend/types/core';
import { MOCK_ORG, MOCK_PROPERTIES, getBuildings, getFloors } from '@/backend/lib/mock-data';

interface GlobalContextType {
    context: SystemContext;
    setContext: (ctx: Partial<SystemContext>) => void;
    // Navigation helpers for drilling down the hierarchy
    selectProperty: (propertyId: string) => void;
    selectBuilding: (buildingId: string) => void;
    selectFloor: (floorId: string) => void;
    navigateUp: () => void;
    isLoading: boolean;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

export function GlobalProvider({ children }: { children: React.ReactNode }) {
    const [context, setContextState] = useState<SystemContext>({
        organization: MOCK_ORG,  // Start with the default mock org
    });
    const [isLoading, setIsLoading] = useState(false);

    /** Merge partial updates into the current context */
    const setContext = (updates: Partial<SystemContext>) => {
        setContextState(prev => ({ ...prev, ...updates }));
    };

    /** Select a property — clears all child selections (building, floor, space) */
    const selectProperty = (propertyId: string) => {
        setIsLoading(true);
        setTimeout(() => {
            const property = MOCK_PROPERTIES.find(p => p.id === propertyId);
            if (property) {
                setContextState(prev => ({
                    ...prev,
                    property,
                    building: undefined,  // Reset children when parent changes
                    floor: undefined,
                    space: undefined
                }));
            }
            setIsLoading(false);
        }, 100);
    };

    /** Select a building within the current property — clears floor and space */
    const selectBuilding = (buildingId: string) => {
        if (!context.property) return;
        setIsLoading(true);
        setTimeout(() => {
            const buildings = getBuildings(context.property!.id);
            const building = buildings.find(b => b.id === buildingId);
            if (building) {
                setContextState(prev => ({
                    ...prev,
                    building,
                    floor: undefined,
                    space: undefined
                }));
            }
            setIsLoading(false);
        }, 100);
    };

    /** Select a floor within the current building — clears space */
    const selectFloor = (floorId: string) => {
        if (!context.building) return;
        setIsLoading(true);
        setTimeout(() => {
            const floors = getFloors(context.building!.id);
            const floor = floors.find(f => f.id === floorId);
            if (floor) {
                setContextState(prev => ({ ...prev, floor, space: undefined }));
            }
            setIsLoading(false);
        }, 100);
    };

    /**
     * Navigate one level up the hierarchy.
     *
     * What it does:
     *   - If space is selected → go back to floor
     *   - If floor is selected → go back to building
     *   - If building is selected → go back to property
     *   - If property is selected → go back to org overview
     */
    const navigateUp = () => {
        if (context.space) {
            setContextState(prev => ({ ...prev, space: undefined }));
        } else if (context.floor) {
            setContextState(prev => ({ ...prev, floor: undefined }));
        } else if (context.building) {
            setContextState(prev => ({ ...prev, building: undefined }));
        } else if (context.property) {
            setContextState(prev => ({ ...prev, property: undefined }));
        }
    };

    return (
        <GlobalContext.Provider value={{
            context,
            setContext,
            selectProperty,
            selectBuilding,
            selectFloor,
            navigateUp,
            isLoading
        }}>
            {children}
        </GlobalContext.Provider>
    );
}

export const useGlobalContext = () => {
    const context = useContext(GlobalContext);
    if (context === undefined) {
        throw new Error('useGlobalContext must be used within a GlobalProvider');
    }
    return context;
};
