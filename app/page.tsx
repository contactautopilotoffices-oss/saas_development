'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/frontend/context/AuthContext';
import { createClient } from '@/frontend/utils/supabase/client';
import HeroSection from '@/frontend/components/landing/HeroSection';
import BuildingStory from '@/frontend/components/landing/BuildingStory';
import Loader from '@/frontend/components/ui/Loader';

export default function Home() {
    const { user, isLoading, membership, isMembershipLoading, signOut } = useAuth();
    const router = useRouter();
    const [isRedirecting, setIsRedirecting] = useState(false);

    useEffect(() => {
        const handleAuthRedirect = async () => {
            // Only proceed if auth and membership are fully loaded
            if (isLoading || isMembershipLoading) return;
            if (!user) {
                setIsRedirecting(false);
                return;
            }

            // At this point, user is logged in. 
            // We check for membership data provided by context.
            setIsRedirecting(true);

            // 1. Check if user is master admin (we still check this from DB as it's sensitive and not in membership)
            const supabase = createClient();
            const { data: userProfile } = await supabase
                .from('users')
                .select('is_master_admin')
                .eq('id', user.id)
                .maybeSingle();

            if (userProfile?.is_master_admin) {
                router.replace('/master');
                return;
            }

            // 2. Check Org Membership from context
            const ORG_ROUTED_ROLES = ['org_super_admin', 'super_tenant', 'owner', 'admin', 'org_admin', 'maintenance_vendor'];
            if (membership?.org_id && membership?.org_role && ORG_ROUTED_ROLES.includes(membership.org_role)) {
                router.replace(`/org/${membership.org_id}/dashboard`);
                return;
            }

            // 3. Check Property Memberships from context
            if (membership?.properties && membership.properties.length > 0) {
                // Determine the best property/role to redirect to
                // For now, take the first one
                const prop = membership.properties[0];
                const { id: property_id, role } = prop;

                if (role === 'property_admin') {
                    router.replace(`/property/${property_id}/dashboard`);
                } else if (role === 'tenant') {
                    router.replace(`/property/${property_id}/tenant`);
                } else if (role === 'security') {
                    router.replace(`/property/${property_id}/security`);
                } else if (role === 'staff') {
                    router.replace(`/property/${property_id}/staff`);
                } else if (role === 'mst') {
                    router.replace(`/property/${property_id}/mst`);
                } else if (role === 'vendor') {
                    router.replace(`/property/${property_id}/vendor`);
                } else {
                    router.replace(`/property/${property_id}/dashboard`);
                }
                return;
            }

            // 4. NO MEMBERSHIP FOUND - Purgatory state
            // If the user has a session but no membership, we MUST sign them out.
            // This prevents the redirect loop: Middleware -> /login -> / -> Landing (Logged In) -> Login -> Loop
            console.warn('User logged in but no memberships found. Force signing out to prevent loop.');
            await signOut();
            setIsRedirecting(false);
        };

        handleAuthRedirect();
    }, [user, isLoading, isMembershipLoading, membership, router, signOut]);

    // Show loader while checking auth or redirecting
    if (isLoading || isRedirecting) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-950">
                <Loader size="lg" text="Loading..." />
            </div>
        );
    }

    // Show landing page for unauthenticated users
    return (
        <main className="flex flex-col min-h-screen bg-black overflow-x-hidden">
            <HeroSection />
            <BuildingStory />
        </main>
    );
}

