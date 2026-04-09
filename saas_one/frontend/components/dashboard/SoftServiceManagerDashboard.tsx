/**
 * SoftServiceManagerDashboard
 * Dedicated dashboard for soft service managers with vendor and checklist management.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    Sparkles, Package, ClipboardCheck, LogOut, Menu, X, LayoutDashboard, Settings, UserCircle, Bell, ScanLine
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import { createClient } from '@/frontend/utils/supabase/client';
import { useAuth } from '@/frontend/context/AuthContext';
import Skeleton from '@/frontend/components/ui/Skeleton';
import SignOutModal from '@/frontend/components/ui/SignOutModal';
import NotificationBell from './NotificationBell';

const StockDashboard = dynamic(
    () => import('@/frontend/components/stock/StockDashboard'),
    { ssr: false, loading: () => <div className="p-8"><Skeleton className="h-96" /></div> }
);

const SOPDashboard = dynamic(
    () => import('@/frontend/components/sop/SOPDashboard'),
    { ssr: false, loading: () => <div className="p-8"><Skeleton className="h-96" /></div> }
);

const StockMovementModal = dynamic(
    () => import('@/frontend/components/stock/StockMovementModal'),
    { ssr: false }
);

const UniversalQRScannerModal = dynamic(
    () => import('@/frontend/components/shared/UniversalQRScannerModal'),
    { ssr: false }
);

type Tab = 'stock' | 'scanner' | 'checklist' | 'settings' | 'profile';

interface SoftServiceManagerDashboardProps {
    propertyId: string;
    userRole?: string;
}

const SoftServiceManagerDashboard: React.FC<SoftServiceManagerDashboardProps> = ({ propertyId, userRole = '' }) => {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { user, signOut } = useAuth();
    const supabase = useMemo(() => createClient(), []);

    const isManager = userRole === 'soft_service_manager' || userRole === 'soft_service_supervisor';
    const [activeTab, setActiveTab] = useState<Tab>(() => {
        const tab = searchParams?.get('tab') as Tab;
        if (tab && ['stock', 'scanner', 'checklist', 'settings', 'profile'].includes(tab)) return tab;
        return isManager ? 'stock' : 'checklist';
    });
    const [property, setProperty] = useState<any>(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const [showScannerModal, setShowScannerModal] = useState(false);
    const [showUniversalScanner, setShowUniversalScanner] = useState(false);
    const [preSelectedStockItemId, setPreSelectedStockItemId] = useState<string | undefined>();

    // Sync tab with URL
    useEffect(() => {
        const tab = searchParams?.get('tab') as Tab;
        if (tab && tab !== activeTab && ['stock', 'scanner', 'checklist', 'settings', 'profile'].includes(tab)) {
            setActiveTab(tab);
        }
    }, [searchParams]);

    useEffect(() => {
        const fetchProperty = async () => {
            const { data } = await supabase
                .from('properties')
                .select('*')
                .eq('id', propertyId)
                .maybeSingle();
            setProperty(data);
        };
        fetchProperty();
    }, [propertyId, supabase]);

    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
        setSidebarOpen(false);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.pushState({}, '', url.toString());
    };

    return (
        <div className="min-h-screen w-screen max-w-full overflow-x-hidden bg-white flex font-inter text-text-primary">
            {/* Mobile Overlay */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside className={`
                w-64 bg-white border-r border-slate-300 flex flex-col inset-y-0 z-50 transition-all duration-300
                fixed left-0
                ${sidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 lg:translate-x-0 lg:opacity-100'}
                overflow-hidden
            `}>
                {/* Mobile Close Button */}
                <button
                    onClick={() => setSidebarOpen(false)}
                    className="absolute top-4 right-4 lg:hidden p-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                    <X className="w-5 h-5 text-text-secondary" />
                </button>
                <div className="p-4 lg:p-5 pb-2 flex-shrink-0">
                    <div className="flex flex-col items-center gap-1 mb-3">
                        <img src="/autopilot-logo-new.png" alt="Autopilot Logo" className="h-10 w-auto object-contain" />
                        <p className="text-[10px] text-text-tertiary font-black uppercase tracking-[0.2em]">{isManager ? 'Soft Service Manager' : 'Staff Soft Service'}</p>
                    </div>
                </div>

                <nav className="flex-1 px-4 overflow-y-auto min-h-0 custom-scrollbar">
                    {/* Operations */}
                    <div className="mb-6">
                        <p className="px-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                            <span className="w-1 h-3 bg-primary rounded-full"></span>
                            Operations
                        </p>
                        <div className="space-y-1">
                            {isManager && (
                                <>
                                    <button
                                        onClick={() => handleTabChange('stock')}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'stock'
                                            ? 'bg-primary text-text-inverse shadow-sm'
                                            : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                            }`}
                                    >
                                        <Package className="w-4 h-4" />
                                        Stock Management
                                    </button>
                                    <button
                                        onClick={() => { setSidebarOpen(false); setShowUniversalScanner(true); }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 font-bold text-sm text-text-secondary hover:bg-muted hover:text-text-primary"
                                    >
                                        <ScanLine className="w-4 h-4" />
                                        Scanner
                                    </button>
                                </>
                            )}
                            <button
                                onClick={() => handleTabChange('checklist')}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'checklist'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <ClipboardCheck className="w-4 h-4" />
                                Checklists
                            </button>
                        </div>
                    </div>

                    {/* System & Personal */}
                    <div className="mb-6">
                        <p className="px-4 text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                            <span className="w-1 h-3 bg-primary rounded-full"></span>
                            System & Personal
                        </p>
                        <div className="space-y-1">
                            <button
                                onClick={() => handleTabChange('settings')}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'settings'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Settings className="w-4 h-4" />
                                Settings
                            </button>
                            <button
                                onClick={() => handleTabChange('profile')}
                                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'profile'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <UserCircle className="w-4 h-4" />
                                Profile
                            </button>
                        </div>
                    </div>
                </nav>

                <div className="px-4 pt-3 pb-12 border-t border-border mt-auto flex-shrink-0 bg-white">
                    <button
                        onClick={() => setShowSignOutModal(true)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-text-secondary hover:bg-red-50 hover:text-red-600 transition-all font-bold text-xs"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            <SignOutModal
                isOpen={showSignOutModal}
                onClose={() => setShowSignOutModal(false)}
                onConfirm={signOut}
            />

            <StockMovementModal
                isOpen={showScannerModal}
                onClose={() => { setShowScannerModal(false); setPreSelectedStockItemId(undefined); }}
                propertyId={propertyId}
                preSelectedItemId={preSelectedStockItemId}
                autoOpenScanner={!preSelectedStockItemId}
            />

            {showUniversalScanner && (
                <UniversalQRScannerModal
                    title="Scanner"
                    onClose={() => setShowUniversalScanner(false)}
                    onResult={(result: any) => {
                        setShowUniversalScanner(false);
                        if (result.type === 'checklist') {
                            router.push(`/checklist/${result.templateId}`);
                        } else if (result.type === 'stock') {
                            router.push(`/property/${propertyId}/soft-service-manager?tab=stock&scanItem=${result.itemId}`);
                        } else if (result.type === 'barcode') {
                            router.push(`/property/${propertyId}/soft-service-manager?tab=stock&scanItem=${result.value}`);
                        }
                    }}
                />
            )}

            {/* Main Content */}
            <main className="flex-1 min-w-0 lg:ml-64 flex flex-col bg-background border-l border-slate-300 shadow-[-4px_0_12px_-4px_rgba(0,0,0,0.05)] relative z-10 min-h-screen overflow-x-hidden">
                <header className="h-14 bg-white sticky top-0 z-30 flex justify-between items-center px-3 sm:px-5 md:px-8 border-b border-border shadow-sm">
                    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                        {/* Mobile Menu Toggle */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-1.5 -ml-1 lg:hidden text-text-tertiary hover:text-text-primary transition-colors shrink-0"
                        >
                            <Menu className="w-7 h-7" />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-[clamp(0.8rem,3.5vw,1.05rem)] font-black text-text-primary tracking-tight leading-tight truncate">Service Hub</h1>
                            <p className="text-primary text-[clamp(0.5rem,2vw,0.6rem)] font-bold uppercase tracking-widest leading-tight truncate">{property?.name || 'Property Dashboard'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                        <NotificationBell />
                        <button
                            onClick={() => handleTabChange('profile')}
                            className="w-9 h-9 bg-primary rounded-2xl flex items-center justify-center text-text-inverse font-bold text-sm hover:scale-105 transition-transform shadow-sm shadow-primary/20 shrink-0"
                        >
                            {user?.email?.[0].toUpperCase() || 'M'}
                        </button>
                    </div>
                </header>

                <div className={`flex-1 overflow-y-auto ${activeTab === 'checklist' ? 'p-0' : 'p-2 md:p-5 lg:p-8'}`} key={activeTab}>

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={activeTab}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="h-full"
                        >
                            {activeTab === 'stock' && (
                                <StockDashboard propertyId={propertyId} hideReports={true} initialItemId={searchParams?.get('scanItem') ?? undefined} />
                            )}

                            {activeTab === 'scanner' && (
                                <StockDashboard propertyId={propertyId} hideReports={true} hideInventory={true} />
                            )}

                            {activeTab === 'checklist' && (
                                <SOPDashboard propertyId={propertyId} />
                            )}

                            {activeTab === 'settings' && (
                                <div className="p-12 text-center text-slate-400 font-bold italic bg-white rounded-3xl border border-slate-100 shadow-sm">
                                    <Settings className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                    <h3 className="text-xl font-bold text-slate-900 mb-2 font-inter not-italic">Settings</h3>
                                    <p className="text-slate-500 font-inter not-italic font-medium">Settings management loading...</p>
                                </div>
                            )}

                            {activeTab === 'profile' && (
                                <div className="p-12 text-center text-slate-400 font-bold italic bg-white rounded-3xl border border-slate-100 shadow-sm">
                                    <UserCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                                    <h3 className="text-xl font-bold text-slate-900 mb-2 font-inter not-italic">Profile</h3>
                                    <p className="text-slate-500 font-inter not-italic font-medium">User profile loading...</p>
                                </div>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};
export default SoftServiceManagerDashboard;
