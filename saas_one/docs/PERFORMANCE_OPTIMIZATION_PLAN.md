# Performance Optimization Plan - Supabase + Next.js Dashboard

## Executive Summary

This document outlines a comprehensive performance optimization strategy to reduce login time and dashboard load time to **under 3 seconds** while reducing API calls by **70%+**.

---

## Current Problems Identified

| Issue | Location | Impact |
|-------|----------|--------|
| Multiple `auth.getSession()` calls | Every component with `useAuth()` | Redundant auth checks |
| No session caching for role/org data | `AuthContext.tsx`, `GlobalContext.tsx` | Repeated membership queries |
| `SELECT *` in all queries | All dashboard components | Fetches unnecessary columns |
| Parallel fetch of ALL properties data | `OrgAdminDashboard.tsx:1043-1097` | 4 API calls on load, all fetching full data |
| No pagination on large datasets | `fetchOrgUsers`, visitors, tickets | Full table scans |
| Mock data still referenced | `GlobalContext.tsx:5` | Unused code bloat |
| `fetchProperties()` called on every tab change | `OrgAdminDashboard.tsx:96-100` | Redundant API calls |
| No unified data layer | Each dashboard fetches independently | No shared state |

---

## Architecture: 3-Layer Dashboard Strategy

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAYER 1: INSTANT (<300ms)                    │
│  - Summary counts only (KPIs)                                   │
│  - Single API call: getDashboardSummary()                       │
│  - Renders immediately, shows skeleton for Layer 2              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  LAYER 2: LAZY (300ms - 1.5s)                   │
│  - Tables, charts, recent activity                              │
│  - Paginated (LIMIT 10-20)                                      │
│  - Loads AFTER UI shell renders                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                 LAYER 3: ON DEMAND (User Action)                │
│  - Filters, exports, historical data                            │
│  - Load only when user clicks/interacts                         │
│  - Never prefetch                                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Global Auth & Session Optimization

#### 1.1 Create Enhanced Auth Context

**File: `context/AuthContext.tsx`**

```typescript
'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { User, Session } from '@supabase/supabase-js';

interface UserMembership {
    org_id: string;
    org_name: string;
    org_role: string;
    properties: {
        id: string;
        name: string;
        code: string;
        role: string;
    }[];
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    isLoading: boolean;
    membership: UserMembership | null;
    isMembershipLoading: boolean;
    // Auth actions
    signIn: (email: string, password: string) => Promise<any>;
    signUp: (email: string, password: string, fullName: string) => Promise<any>;
    signInWithGoogle: (propertyCode?: string) => Promise<void>;
    signOut: () => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    // Cache helpers
    refreshMembership: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// In-memory cache to prevent duplicate fetches
const membershipCache = new Map<string, { data: UserMembership; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [membership, setMembership] = useState<UserMembership | null>(null);
    const [isMembershipLoading, setIsMembershipLoading] = useState(false);
    
    const supabase = useMemo(() => createClient(), []);

    // Fetch membership data ONCE after login
    const fetchMembership = useCallback(async (userId: string) => {
        // Check cache first
        const cached = membershipCache.get(userId);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            setMembership(cached.data);
            return;
        }

        setIsMembershipLoading(true);
        try {
            // Single optimized query for all membership data
            const { data, error } = await supabase
                .from('organization_memberships')
                .select(`
                    role,
                    organization:organizations!inner (
                        id,
                        name
                    )
                `)
                .eq('user_id', userId)
                .eq('is_active', true)
                .limit(1)
                .single();

            if (error || !data) {
                setMembership(null);
                return;
            }

            // Fetch property memberships in parallel
            const { data: propData } = await supabase
                .from('property_memberships')
                .select(`
                    role,
                    property:properties!inner (
                        id,
                        name,
                        code
                    )
                `)
                .eq('user_id', userId)
                .eq('is_active', true);

            const membershipData: UserMembership = {
                org_id: data.organization.id,
                org_name: data.organization.name,
                org_role: data.role,
                properties: propData?.map((p: any) => ({
                    id: p.property.id,
                    name: p.property.name,
                    code: p.property.code,
                    role: p.role
                })) || []
            };

            // Cache the result
            membershipCache.set(userId, { data: membershipData, timestamp: Date.now() });
            setMembership(membershipData);
        } catch (err) {
            console.error('Membership fetch error:', err);
        } finally {
            setIsMembershipLoading(false);
        }
    }, [supabase]);

    const refreshMembership = useCallback(async () => {
        if (user?.id) {
            membershipCache.delete(user.id); // Clear cache
            await fetchMembership(user.id);
        }
    }, [user?.id, fetchMembership]);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchMembership(session.user.id);
            }
            setIsLoading(false);
        });

        // Subscribe to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            
            if (event === 'SIGNED_IN' && session?.user) {
                fetchMembership(session.user.id);
            } else if (event === 'SIGNED_OUT') {
                setMembership(null);
            }
            
            setIsLoading(false);
        });

        return () => subscription.unsubscribe();
    }, [supabase, fetchMembership]);

    const signIn = async (email: string, password: string) => {
        const result = await supabase.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        return result;
    };

    const signInWithGoogle = async (propertyCode?: string) => {
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/api/auth/callback`,
                queryParams: propertyCode ? { state: propertyCode } : {}
            }
        });
        if (error) throw error;
    };

    const signUp = async (email: string, password: string, fullName: string) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
        });
        if (error) throw error;
        return data;
    };

    const signOut = async () => {
        if (user?.id) membershipCache.delete(user.id);
        await supabase.auth.signOut();
    };

    const resetPassword = async (email: string) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/api/auth/callback?next=/login?mode=reset`,
        });
        if (error) throw error;
    };

    const value = useMemo(() => ({
        user,
        session,
        isLoading,
        membership,
        isMembershipLoading,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
        resetPassword,
        refreshMembership
    }), [user, session, isLoading, membership, isMembershipLoading, refreshMembership]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
```

---

### Phase 2: Unified Dashboard Summary API

#### 2.1 Create Aggregated Summary Endpoint

**File: `app/api/dashboard/summary/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    
    const orgId = searchParams.get('orgId');
    const propertyId = searchParams.get('propertyId');
    const role = searchParams.get('role') || 'user';

    // Verify auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // SINGLE aggregated query using database views
        if (role === 'org_admin' || role === 'org_super_admin') {
            // Org-level summary
            const { data, error } = await supabase
                .rpc('get_org_dashboard_summary', {
                    p_org_id: orgId,
                    p_property_id: propertyId === 'all' ? null : propertyId
                });

            if (error) throw error;
            return NextResponse.json(data);
        } else {
            // Property-level summary
            const { data, error } = await supabase
                .rpc('get_property_dashboard_summary', {
                    p_property_id: propertyId
                });

            if (error) throw error;
            return NextResponse.json(data);
        }
    } catch (err: any) {
        console.error('Dashboard summary error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
```

---

### Phase 3: Database Views & Functions

#### 3.1 Create Optimized SQL Views

```sql
-- ============================================
-- MATERIALIZED VIEW: Org Dashboard Summary
-- ============================================
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_org_dashboard_summary AS
SELECT 
    o.id as org_id,
    o.name as org_name,
    -- Ticket counts
    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'open') as open_tickets,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'in_progress') as in_progress_tickets,
    COUNT(DISTINCT t.id) FILTER (WHERE t.status IN ('resolved', 'closed')) as resolved_tickets,
    COUNT(DISTINCT t.id) as total_tickets,
    -- User counts
    COUNT(DISTINCT om.user_id) as total_org_users,
    -- Property counts
    COUNT(DISTINCT p.id) as total_properties,
    -- Visitor summary (today)
    COUNT(DISTINCT vl.id) FILTER (WHERE vl.check_in_time::date = CURRENT_DATE) as visitors_today,
    -- Vendor summary
    COALESCE(SUM(vdr.revenue_amount) FILTER (WHERE vdr.revenue_date >= date_trunc('month', CURRENT_DATE)), 0) as monthly_revenue
FROM organizations o
LEFT JOIN properties p ON p.organization_id = o.id AND p.deleted_at IS NULL
LEFT JOIN tickets t ON t.property_id = p.id
LEFT JOIN organization_memberships om ON om.organization_id = o.id AND om.is_active = true
LEFT JOIN visitor_logs vl ON vl.property_id = p.id
LEFT JOIN vendors v ON v.property_id = p.id
LEFT JOIN vendor_daily_revenue vdr ON vdr.vendor_id = v.id
WHERE o.deleted_at IS NULL
GROUP BY o.id, o.name;

-- Create index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_org_summary_org_id ON mv_org_dashboard_summary(org_id);

-- ============================================
-- FUNCTION: Refresh Summary (call via cron)
-- ============================================
CREATE OR REPLACE FUNCTION refresh_dashboard_summaries()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_org_dashboard_summary;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get Org Dashboard Summary (RPC)
-- ============================================
CREATE OR REPLACE FUNCTION get_org_dashboard_summary(
    p_org_id UUID,
    p_property_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'tickets', json_build_object(
            'open', COALESCE(SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END), 0),
            'in_progress', COALESCE(SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END), 0),
            'resolved', COALESCE(SUM(CASE WHEN t.status IN ('resolved', 'closed') THEN 1 ELSE 0 END), 0),
            'total', COUNT(t.id)
        ),
        'properties', (
            SELECT json_agg(json_build_object(
                'id', p.id,
                'name', p.name,
                'code', p.code,
                'ticket_count', (SELECT COUNT(*) FROM tickets WHERE property_id = p.id)
            ))
            FROM properties p 
            WHERE p.organization_id = p_org_id AND p.deleted_at IS NULL
        ),
        'visitors_today', (
            SELECT COUNT(*) FROM visitor_logs vl
            JOIN properties p ON p.id = vl.property_id
            WHERE p.organization_id = p_org_id 
            AND vl.check_in_time::date = CURRENT_DATE
            AND (p_property_id IS NULL OR vl.property_id = p_property_id)
        ),
        'monthly_revenue', (
            SELECT COALESCE(SUM(vdr.revenue_amount), 0)
            FROM vendor_daily_revenue vdr
            JOIN vendors v ON v.id = vdr.vendor_id
            JOIN properties p ON p.id = v.property_id
            WHERE p.organization_id = p_org_id
            AND vdr.revenue_date >= date_trunc('month', CURRENT_DATE)
            AND (p_property_id IS NULL OR v.property_id = p_property_id)
        )
    ) INTO result
    FROM tickets t
    JOIN properties p ON p.id = t.property_id
    WHERE p.organization_id = p_org_id
    AND p.deleted_at IS NULL
    AND (p_property_id IS NULL OR t.property_id = p_property_id);
    
    RETURN COALESCE(result, '{"tickets":{"open":0,"in_progress":0,"resolved":0,"total":0},"visitors_today":0,"monthly_revenue":0}'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- FUNCTION: Get Property Dashboard Summary
-- ============================================
CREATE OR REPLACE FUNCTION get_property_dashboard_summary(p_property_id UUID)
RETURNS JSON AS $$
BEGIN
    RETURN json_build_object(
        'tickets', (
            SELECT json_build_object(
                'open', COUNT(*) FILTER (WHERE status = 'open'),
                'in_progress', COUNT(*) FILTER (WHERE status = 'in_progress'),
                'resolved', COUNT(*) FILTER (WHERE status IN ('resolved', 'closed')),
                'total', COUNT(*)
            )
            FROM tickets WHERE property_id = p_property_id
        ),
        'visitors_today', (
            SELECT COUNT(*) FROM visitor_logs 
            WHERE property_id = p_property_id 
            AND check_in_time::date = CURRENT_DATE
        ),
        'monthly_revenue', (
            SELECT COALESCE(SUM(vdr.revenue_amount), 0)
            FROM vendor_daily_revenue vdr
            JOIN vendors v ON v.id = vdr.vendor_id
            WHERE v.property_id = p_property_id
            AND vdr.revenue_date >= date_trunc('month', CURRENT_DATE)
        ),
        'recent_activity', (
            SELECT json_agg(row_to_json(t.*))
            FROM (
                SELECT id, title, status, created_at
                FROM tickets
                WHERE property_id = p_property_id
                ORDER BY created_at DESC
                LIMIT 5
            ) t
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

### Phase 4: Dashboard Data Hook

#### 4.1 Create Unified Dashboard Hook

**File: `hooks/useDashboardData.ts`**

```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';

interface DashboardSummary {
    tickets: {
        open: number;
        in_progress: number;
        resolved: number;
        total: number;
    };
    properties?: Array<{
        id: string;
        name: string;
        code: string;
        ticket_count: number;
    }>;
    visitors_today: number;
    monthly_revenue: number;
    recent_activity?: any[];
}

interface UseDashboardDataOptions {
    orgId?: string;
    propertyId?: string;
    role?: string;
    autoFetch?: boolean;
}

export function useDashboardData(options: UseDashboardDataOptions) {
    const { membership } = useAuth();
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const fetchedRef = useRef(false);

    const orgId = options.orgId || membership?.org_id;
    const propertyId = options.propertyId;
    const role = options.role || membership?.org_role || 'user';

    const fetchSummary = useCallback(async () => {
        if (!orgId) return;

        setIsLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({
                orgId,
                role,
                ...(propertyId && propertyId !== 'all' ? { propertyId } : {})
            });

            const res = await fetch(`/api/dashboard/summary?${params}`);
            if (!res.ok) throw new Error('Failed to fetch summary');

            const data = await res.json();
            setSummary(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [orgId, propertyId, role]);

    // Auto-fetch on mount (ONCE)
    useEffect(() => {
        if (options.autoFetch !== false && !fetchedRef.current && orgId) {
            fetchedRef.current = true;
            fetchSummary();
        }
    }, [orgId, fetchSummary, options.autoFetch]);

    // Refetch when propertyId changes
    useEffect(() => {
        if (fetchedRef.current && propertyId) {
            fetchSummary();
        }
    }, [propertyId, fetchSummary]);

    return {
        summary,
        isLoading,
        error,
        refetch: fetchSummary
    };
}
```

---

### Phase 5: Optimized Dashboard Component

#### 5.1 Refactored Overview Tab

**File: `components/dashboard/OptimizedOverviewTab.tsx`**

```typescript
'use client';

import React, { Suspense, memo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { Ticket, Users, IndianRupee, Building2, TrendingUp } from 'lucide-react';
import { motion } from 'framer-motion';

// LAYER 1: Summary Cards (loads immediately)
const SummaryCards = memo(function SummaryCards({ 
    summary, 
    isLoading 
}: { 
    summary: any; 
    isLoading: boolean 
}) {
    const cards = [
        {
            title: 'Open Tickets',
            value: summary?.tickets?.open || 0,
            icon: Ticket,
            color: 'text-amber-500',
            bg: 'bg-amber-50'
        },
        {
            title: 'In Progress',
            value: summary?.tickets?.in_progress || 0,
            icon: TrendingUp,
            color: 'text-blue-500',
            bg: 'bg-blue-50'
        },
        {
            title: 'Resolved',
            value: summary?.tickets?.resolved || 0,
            icon: Ticket,
            color: 'text-emerald-500',
            bg: 'bg-emerald-50'
        },
        {
            title: 'Visitors Today',
            value: summary?.visitors_today || 0,
            icon: Users,
            color: 'text-purple-500',
            bg: 'bg-purple-50'
        },
        {
            title: 'Monthly Revenue',
            value: `₹${(summary?.monthly_revenue || 0).toLocaleString('en-IN')}`,
            icon: IndianRupee,
            color: 'text-green-500',
            bg: 'bg-green-50'
        }
    ];

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            {cards.map((card, i) => (
                <motion.div
                    key={card.title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"
                >
                    <div className={`w-10 h-10 ${card.bg} ${card.color} rounded-xl flex items-center justify-center mb-4`}>
                        <card.icon className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                        {card.title}
                    </p>
                    {isLoading ? (
                        <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" />
                    ) : (
                        <h3 className="text-2xl font-black text-slate-900">
                            {card.value}
                        </h3>
                    )}
                </motion.div>
            ))}
        </div>
    );
});

// LAYER 2: Property Cards (lazy loaded)
const PropertyCards = React.lazy(() => import('./PropertyCards'));

// LAYER 3: Charts (on-demand)
const Charts = React.lazy(() => import('./DashboardCharts'));

export default function OptimizedOverviewTab({
    orgId,
    selectedPropertyId,
    onPropertySelect
}: {
    orgId: string;
    selectedPropertyId: string;
    onPropertySelect: (id: string) => void;
}) {
    const { summary, isLoading, error } = useDashboardData({
        orgId,
        propertyId: selectedPropertyId,
        autoFetch: true
    });

    if (error) {
        return (
            <div className="p-8 text-center text-red-500">
                Error loading dashboard: {error}
            </div>
        );
    }

    return (
        <div className="p-6 lg:p-12">
            {/* LAYER 1: Always visible */}
            <SummaryCards summary={summary} isLoading={isLoading} />

            {/* LAYER 2: Lazy loaded */}
            <Suspense fallback={
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse" />
                    ))}
                </div>
            }>
                <PropertyCards 
                    properties={summary?.properties || []}
                    selectedId={selectedPropertyId}
                    onSelect={onPropertySelect}
                />
            </Suspense>

            {/* LAYER 3: Only render if user scrolls down or interacts */}
            {summary && !isLoading && (
                <Suspense fallback={null}>
                    <Charts orgId={orgId} propertyId={selectedPropertyId} />
                </Suspense>
            )}
        </div>
    );
}
```

---

### Phase 6: RLS Performance Fixes

#### 6.1 Optimized RLS Policies

```sql
-- ============================================
-- CRITICAL: Store role directly on users table
-- ============================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_org_id UUID REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_org_role TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS property_ids UUID[];

-- Create function to sync user metadata
CREATE OR REPLACE FUNCTION sync_user_membership_cache()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user's primary org when org membership changes
    UPDATE users
    SET 
        primary_org_id = NEW.organization_id,
        primary_org_role = NEW.role
    WHERE id = NEW.user_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to keep user metadata in sync
CREATE TRIGGER trg_sync_user_org_membership
AFTER INSERT OR UPDATE ON organization_memberships
FOR EACH ROW EXECUTE FUNCTION sync_user_membership_cache();

-- ============================================
-- SIMPLIFIED RLS Policies (no subqueries)
-- ============================================

-- Tickets: Simple equality check
DROP POLICY IF EXISTS "tickets_org_access" ON tickets;
CREATE POLICY "tickets_org_access" ON tickets
FOR ALL USING (
    property_id = ANY(
        (SELECT property_ids FROM users WHERE id = auth.uid())
    )
);

-- Properties: Direct org check
DROP POLICY IF EXISTS "properties_org_access" ON properties;
CREATE POLICY "properties_org_access" ON properties
FOR ALL USING (
    organization_id = (SELECT primary_org_id FROM users WHERE id = auth.uid())
);

-- Create indexes for RLS performance
CREATE INDEX IF NOT EXISTS idx_users_primary_org ON users(primary_org_id);
CREATE INDEX IF NOT EXISTS idx_users_property_ids ON users USING GIN(property_ids);
CREATE INDEX IF NOT EXISTS idx_tickets_property_id ON tickets(property_id);
CREATE INDEX IF NOT EXISTS idx_properties_org_id ON properties(organization_id);
```

---

### Phase 7: Query Optimization Checklist

#### 7.1 Remove SELECT * Everywhere

| Current | Optimized |
|---------|-----------|
| `.select('*')` | `.select('id, name, status, created_at')` |
| No LIMIT | `.limit(20)` |
| No ORDER | `.order('created_at', { ascending: false })` |
| Full table scan | `.eq('property_id', propertyId)` |

#### 7.2 Add Indexes

```sql
-- High-impact indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_property_status 
ON tickets(property_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tickets_created_desc 
ON tickets(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitor_logs_property_date 
ON visitor_logs(property_id, check_in_time DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_vendor_revenue_date 
ON vendor_daily_revenue(vendor_id, revenue_date DESC);
```

---

## Expected Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Login time | 3-5s | <1s | 70%+ |
| Dashboard first paint | 4-6s | <300ms | 90%+ |
| Full dashboard load | 8-10s | <3s | 70%+ |
| API calls per dashboard | 8-12 | 2-3 | 75%+ |
| Data transferred | ~2MB | ~200KB | 90%+ |

---

## Implementation Roadmap

### Week 1: Foundation
- [ ] Update AuthContext.tsx with membership caching
- [ ] Create `/api/dashboard/summary` endpoint
- [ ] Add SQL views and functions

### Week 2: Integration
- [ ] Create `useDashboardData` hook
- [ ] Refactor OrgAdminDashboard to use 3-layer approach
- [ ] Refactor PropertyAdminDashboard

### Week 3: Optimization
- [ ] Apply RLS fixes
- [ ] Add database indexes
- [ ] Remove SELECT * from all queries

### Week 4: Testing & Polish
- [ ] Performance testing
- [ ] Edge case handling
- [ ] Documentation

---

## Files to Create/Modify

| Action | File |
|--------|------|
| **MODIFY** | `context/AuthContext.tsx` |
| **CREATE** | `hooks/useDashboardData.ts` |
| **CREATE** | `app/api/dashboard/summary/route.ts` |
| **MODIFY** | `components/dashboard/OrgAdminDashboard.tsx` |
| **MODIFY** | `components/dashboard/PropertyAdminDashboard.tsx` |
| **CREATE** | `components/dashboard/OptimizedOverviewTab.tsx` |
| **CREATE** | `supabase/migrations/optimize_dashboard.sql` |

---

## Approval Required

Before implementing:
1. SQL migrations require database admin approval
2. Auth changes require security review
3. API changes require backend review

**Ready to proceed with implementation?**
