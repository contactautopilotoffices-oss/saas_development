'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

interface CacheEntry {
    data: any;
    timestamp: number;
}

interface DataCacheContextType {
    getCachedData: (key: string) => any | null;
    setCachedData: (key: string, data: any) => void;
    invalidateCache: (key?: string) => void;
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined);

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Keys that should persist to localStorage (large data worth preserving across refreshes)
const PERSISTENT_KEY_PREFIXES = ['tickets-'];

const isPersistentKey = (key: string) =>
    PERSISTENT_KEY_PREFIXES.some(prefix => key.startsWith(prefix));

const readFromStorage = (key: string): CacheEntry | null => {
    try {
        const raw = localStorage.getItem(`cache:${key}`);
        if (!raw) return null;
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() - entry.timestamp > CACHE_TTL) {
            localStorage.removeItem(`cache:${key}`);
            return null;
        }
        return entry;
    } catch {
        return null;
    }
};

const writeToStorage = (key: string, data: any) => {
    try {
        const entry: CacheEntry = { data, timestamp: Date.now() };
        localStorage.setItem(`cache:${key}`, JSON.stringify(entry));
    } catch {
        // localStorage full or unavailable — silently skip
    }
};

export function DataCacheProvider({ children }: { children: React.ReactNode }) {
    const [cache, setCache] = useState<Record<string, CacheEntry>>({});

    const getCachedData = useCallback((key: string) => {
        // 1. Check in-memory first (fastest)
        const mem = cache[key];
        if (mem && Date.now() - mem.timestamp <= CACHE_TTL) return mem.data;

        // 2. Fall back to localStorage for persistent keys
        if (isPersistentKey(key)) {
            const stored = readFromStorage(key);
            if (stored) return stored.data;
        }

        return null;
    }, [cache]);

    const setCachedData = useCallback((key: string, data: any) => {
        const entry: CacheEntry = { data, timestamp: Date.now() };
        setCache(prev => ({ ...prev, [key]: entry }));

        // Also persist to localStorage for ticket data
        if (isPersistentKey(key)) {
            writeToStorage(key, data);
        }
    }, []);

    const invalidateCache = useCallback((key?: string) => {
        if (key) {
            setCache(prev => {
                const next = { ...prev };
                delete next[key];
                return next;
            });
            if (isPersistentKey(key)) localStorage.removeItem(`cache:${key}`);
        } else {
            setCache({});
            // Clear all cache: keys from localStorage
            Object.keys(localStorage)
                .filter(k => k.startsWith('cache:'))
                .forEach(k => localStorage.removeItem(k));
        }
    }, []);

    return (
        <DataCacheContext.Provider value={{ getCachedData, setCachedData, invalidateCache }}>
            {children}
        </DataCacheContext.Provider>
    );
}

export function useDataCache() {
    const context = useContext(DataCacheContext);
    if (!context) {
        throw new Error('useDataCache must be used within a DataCacheProvider');
    }
    return context;
}
