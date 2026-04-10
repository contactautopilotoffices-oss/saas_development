/**
 * CapabilityWrapper — RBAC Permission Gate
 *
 * A declarative role-based access control (RBAC) wrapper that conditionally
 * renders children based on the current user's capabilities from CAPABILITY_MATRIX.
 * Before rendering, it fetches the full capability context via authService.getMeContext()
 * and checks whether the requested (domain, action) pair is permitted.
 *
 * KEY PROPS:
 *   - domain:    CapabilityDomain — the resource domain (e.g. 'tickets', 'users', 'procurement')
 *   - action:    CapabilityAction — the operation ('view', 'create', 'edit', 'delete', etc.)
 *   - children:  React.ReactNode — content to render when the user has the required permission
 *   - fallback:  React.ReactNode (optional) — content to render when permission is denied (default: null)
 *
 * KEY STATE:
 *   - context:   RequestContext | null — the resolved user context including capability matrix
 *   - loading:  boolean — true while fetching the user's capability context
 *
 * INTEGRATION:
 *   - Uses authService.getMeContext() to retrieve the user's request context
 *   - Consults CAPABILITY_MATRIX (typed via CapabilityDomain / CapabilityAction) at runtime
 *   - Wraps any feature that needs permission checking; typically used in sidebars, headers, and action buttons
 *   - Returns null (with optional fallback) while loading to avoid premature visibility
 *
 * UX PATTERNS:
 *   - Silently gates content (no visible loading spinner); consumers should handle their own skeletons
 *   - Permission denied renders the optional fallback node, allowing graceful degradation
 *   - Server-side role checks (via getMeContext) ensure the gate respects server-validated roles
 */
'use client';

import React, { useEffect, useState } from 'react';
import { CapabilityDomain, CapabilityAction, RequestContext } from '@/frontend/types/rbac';
import { authService } from '@/backend/services/authService';

interface CapabilityWrapperProps {
    domain: CapabilityDomain;
    action: CapabilityAction;
    children: React.ReactNode;
    fallback?: React.ReactNode;
}

export default function CapabilityWrapper({
    domain,
    action,
    children,
    fallback = null
}: CapabilityWrapperProps) {
    const [context, setContext] = useState<RequestContext | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        authService.getMeContext().then(ctx => {
            setContext(ctx);
            setLoading(false);
        });
    }, []);

    if (loading) return null; // Or a subtle skeleton

    const hasPermission = context?.capabilities[domain]?.includes(action);

    if (!hasPermission) return <>{fallback}</>;

    return <>{children}</>;
}
