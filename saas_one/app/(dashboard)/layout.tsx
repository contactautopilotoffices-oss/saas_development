'use client';

import { useAuth } from "@/frontend/context/AuthContext";
import { useRouter, useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ContextBar } from "@/frontend/components/layout/ContextBar";
import DashboardSidebar, { MobileHeader } from "@/frontend/components/layout/DashboardSidebar";
import Loader from "@/frontend/components/ui/Loader";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isLoading } = useAuth();
    const router = useRouter();
    const params = useParams();
    const pathname = usePathname();
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login');
        }
    }, [user, isLoading, router]);

    // Close mobile sidebar on route change
    useEffect(() => {
        setIsMobileSidebarOpen(false);
    }, [pathname]);

    // Prevent body scroll when mobile sidebar is open
    useEffect(() => {
        if (isMobileSidebarOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isMobileSidebarOpen]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background text-primary font-display font-bold">
                <Loader size="lg" text="Initializing..." />
            </div>
        );
    }

    if (!user) {
        return null;
    }

    const isFullDashboard = pathname?.endsWith('/dashboard');

    if (isFullDashboard) {
        return <>{children}</>;
    }

    return (
        <div className="flex min-h-screen bg-[#fafbfc]">
            {/* Mobile Header */}
            <MobileHeader onMenuToggle={() => setIsMobileSidebarOpen(true)} />

            {/* Sidebar */}
            <DashboardSidebar
                isMobileOpen={isMobileSidebarOpen}
                onMobileClose={() => setIsMobileSidebarOpen(false)}
            />

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 pt-[56px] lg:pt-0 border-l border-slate-300 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.05)] bg-background relative z-10">
                {/* Context Bar - Hidden on mobile, shown on desktop */}
                <div className="hidden lg:block">
                    <ContextBar />
                </div>

                <main className="flex-1 overflow-y-auto touch-scroll responsive-container py-4 lg:py-6">
                    {children}
                </main>
            </div>

        </div>
    );
}
