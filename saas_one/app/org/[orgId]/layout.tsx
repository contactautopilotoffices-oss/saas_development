'use client';

import { useAuth } from "@/frontend/context/AuthContext";
import { useRouter, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/frontend/utils/supabase/client";
import Loader from "@/frontend/components/ui/Loader";

interface OrgMembership {
    organization_id: string;
    role: string;
}

export default function OrgLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isLoading: authLoading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const orgId = params.orgId as string;

    const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
    const [isCheckingAccess, setIsCheckingAccess] = useState(true);

    useEffect(() => {
        const checkOrgAccess = async () => {
            // Wait for auth to finish loading
            if (authLoading) return;

            // Redirect to login if not authenticated
            if (!user) {
                router.replace('/login');
                return;
            }

            try {
                const supabase = createClient();

                // Check if user has organization membership for this org
                const { data: membership, error } = await supabase
                    .from('organization_memberships')
                    .select('organization_id, role')
                    .eq('user_id', user.id)
                    .eq('organization_id', orgId)
                    .eq('is_active', true)
                    .maybeSingle();

                if (error) {
                    console.error('Org access check error:', error);
                    setIsAuthorized(false);
                    setIsCheckingAccess(false);
                    return;
                }

                if (membership) {
                    // User has org membership - allow access
                    setIsAuthorized(true);
                } else {
                    // No org membership - check if they have property membership in this org
                    const { data: propMembership } = await supabase
                        .from('property_memberships')
                        .select('id')
                        .eq('user_id', user.id)
                        .eq('organization_id', orgId)
                        .eq('is_active', true)
                        .limit(1)
                        .maybeSingle();

                    if (propMembership) {
                        // Has property access - redirect to property dashboard instead
                        const { data: firstProp } = await supabase
                            .from('property_memberships')
                            .select('property_id')
                            .eq('user_id', user.id)
                            .eq('organization_id', orgId)
                            .eq('is_active', true)
                            .limit(1)
                            .single();

                        if (firstProp) {
                            router.replace(`/property/${firstProp.property_id}/dashboard`);
                            return;
                        }
                    }

                    // No access at all
                    setIsAuthorized(false);
                }
            } catch (err) {
                console.error('Access check failed:', err);
                setIsAuthorized(false);
            } finally {
                setIsCheckingAccess(false);
            }
        };

        checkOrgAccess();
    }, [user, authLoading, orgId, router]);

    // Loading state
    if (authLoading || isCheckingAccess) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader size="lg" text="Verifying access..." />
            </div>
        );
    }

    // Not authenticated - will redirect
    if (!user) {
        return null;
    }

    // Not authorized for this org
    if (isAuthorized === false) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
                <div className="text-center max-w-md">
                    <div className="w-16 h-16 bg-error/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-text-primary mb-2">Access Denied</h1>
                    <p className="text-text-secondary mb-6">
                        You don't have permission to access this organization. Please contact your administrator if you believe this is an error.
                    </p>
                    <button
                        onClick={() => router.push('/login')}
                        className="px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary-dark transition-colors"
                    >
                        Return to Login
                    </button>
                </div>
            </div>
        );
    }

    return <>{children}</>;
}
