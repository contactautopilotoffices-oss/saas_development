/**
 * FoodVendorDashboard
 * Food vendor management dashboard with daily revenue entry, commission tracking,
 * and payment management for cafeteria and food service operations.
 * @remarks Client component using Supabase for data.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
    IndianRupee, LogOut, CheckCircle2, LayoutDashboard,
    FileDown, Clock, Store, Percent, Wallet, ChevronRight, X, History,
    UserCircle, Settings, Mail, Phone, Building, Save, Loader2, Camera, Plus, Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import { useAuth } from '@/frontend/context/AuthContext';
import { useParams, useRouter } from 'next/navigation';
import SignOutModal from '@/frontend/components/ui/SignOutModal';
import VendorExportModal from '@/frontend/components/vendor/VendorExportModal';
import VendorPaymentModal from '@/frontend/components/vendor/VendorPaymentModal';
import SettingsView from './SettingsView';
import Image from 'next/image';

// Types
type ViewState = 'entry' | 'already_submitted' | 'dashboard';

interface VendorProfile {
    id: string;
    shop_name: string;
    owner_name: string | null;
    commission_rate: number;
    property_id: string;
    property_name?: string;
    email?: string;
}

interface CommissionCycle {
    id: string;
    cycle_number: number;
    cycle_start: string;
    cycle_end: string;
    total_revenue: number;
    commission_rate: number;
    commission_due: number;
    status: string;
}

const FoodVendorDashboard = () => {
    const { user, signOut } = useAuth();
    const params = useParams();
    const router = useRouter();
    const propertyId = params?.propertyId as string;
    const supabase = createClient();

    // State
    const [viewState, setViewState] = useState<ViewState>('entry');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [revenue, setRevenue] = useState('');
    const [vendor, setVendor] = useState<VendorProfile | null>(null);
    const [currentCycle, setCurrentCycle] = useState<CommissionCycle | null>(null);
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [activeTab, setActiveTab] = useState<'portal' | 'history' | 'profile' | 'settings'>('portal');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [todayDate] = useState(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }));

    // Date Filtering State
    const [isFiltered, setIsFiltered] = useState(false);
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);

    useEffect(() => {
        if (user && propertyId) {
            initializeDashboard();
        }
    }, [user, propertyId]);

    const initializeDashboard = async () => {
        setIsLoading(true);
        try {
            // 1. Fetch Vendor Profile
            const { data: vendorData, error: vendorError } = await supabase
                .from('vendors')
                .select('*, properties(name)')
                .eq('user_id', user?.id)
                .maybeSingle();

            if (vendorError || !vendorData) {
                console.error('Error fetching vendor:', vendorError);
                return;
            }

            setVendor({
                id: vendorData.id,
                shop_name: vendorData.shop_name,
                owner_name: vendorData.owner_name,
                commission_rate: vendorData.commission_rate,
                property_id: vendorData.property_id,
                property_name: vendorData.properties?.name,
                email: vendorData.email // assuming email might be here or in user
            });

            // 2. Fetch current commission cycle
            const { data: cycleData } = await supabase
                .from('commission_cycles')
                .select('*')
                .eq('vendor_id', vendorData.id)
                .eq('status', 'in_progress')
                .maybeSingle();

            if (cycleData) {
                setCurrentCycle(cycleData);
            }

            // 3. Just fetch initial view based on whether today exists, 
            // but don't force lock-out. We'll show the dashboard by default if today exists,
            // but still allow alternate date entries.
            const todayStr = new Date().toISOString().split('T')[0];
            const { data: entryData } = await supabase
                .from('vendor_daily_revenue')
                .select('id')
                .eq('vendor_id', vendorData.id)
                .eq('entry_date', todayStr)
                .maybeSingle();

            if (entryData) {
                setViewState('dashboard');
            } else {
                setViewState('entry');
            }

            // 4. Fetch revenue history and calculate totals if cycle is missing
            const { data: historyData } = await supabase
                .from('vendor_daily_revenue')
                .select('*')
                .eq('vendor_id', vendorData.id)
                .order('entry_date', { ascending: false })
                .limit(30);

            if (historyData) {
                setHistory(historyData);

                // Calculate metrics based on current view (filtered or active cycle)
                if (isFiltered || !cycleData) {
                    const start = new Date(startDate);
                    const end = new Date(endDate);

                    const filteredRevenue = historyData
                        .filter(entry => {
                            const d = new Date(entry.entry_date || entry.revenue_date);
                            return d >= start && d <= end;
                        })
                        .reduce((sum, entry) => sum + entry.revenue_amount, 0);

                    setCurrentCycle({
                        id: isFiltered ? 'filtered' : 'temp',
                        cycle_number: 1,
                        cycle_start: startDate,
                        cycle_end: endDate,
                        total_revenue: filteredRevenue,
                        commission_rate: vendorData.commission_rate,
                        commission_due: filteredRevenue * (vendorData.commission_rate / 100),
                        status: isFiltered ? 'filtered' : 'in_progress'
                    });
                }
            }
        } catch (err) {
            console.error('Initialization error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // Re-initialize when filters change
    useEffect(() => {
        if (user && propertyId) {
            initializeDashboard();
        }
    }, [startDate, endDate, isFiltered]);

    const handleSubmitRevenue = async () => {
        if (!revenue || isNaN(Number(revenue)) || Number(revenue) <= 0) return;

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/properties/${propertyId}/vendor-revenue`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendor_id: vendor?.id,
                    revenue_amount: Number(revenue),
                    revenue_date: entryDate,
                }),
            });

            let data;
            const text = await response.text();
            try {
                data = text ? JSON.parse(text) : {};
            } catch (e) {
                console.error('Failed to parse response:', text);
                data = { error: 'Invalid response from server' };
            }

            if (!response.ok) {
                if (data.alreadySubmitted) {
                    alert(`Revenue for ${new Date(entryDate).toLocaleDateString()} has already been recorded.`);
                    return;
                }
                throw new Error(data.error || 'Submission failed');
            }

            // After success, go to success screen which allows navigating back or to dashboard
            setViewState('already_submitted');
            setRevenue(''); // Reset revenue for next entry
            // Refresh cycle data
            initializeDashboard();
        } catch (err) {
            console.error('Submission error:', err);
            alert('Failed to record revenue. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleExport = async (options: any) => {
        setIsExporting(true);
        try {
            const params = new URLSearchParams({
                vendorId: vendor?.id || '',
                format: options.format,
            });

            if (options.period === 'today') {
                const today = new Date().toISOString().split('T')[0];
                params.append('startDate', today);
                params.append('endDate', today);
            } else if (options.period === 'month') {
                const monthStart = new Date();
                monthStart.setDate(1);
                params.append('startDate', monthStart.toISOString().split('T')[0]);
                params.append('endDate', new Date().toISOString().split('T')[0]);
            } else if (options.period === 'year') {
                const yearStart = new Date();
                yearStart.setMonth(0, 1);
                params.append('startDate', yearStart.toISOString().split('T')[0]);
                params.append('endDate', new Date().toISOString().split('T')[0]);
            } else if (options.startDate && options.endDate) {
                params.append('startDate', options.startDate);
                params.append('endDate', options.endDate);
            }

            const response = await fetch(`/api/properties/${propertyId}/vendor-export?${params}`);

            if (!response.ok) throw new Error('Export failed');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `revenue_export.${options.format}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setShowExportModal(false);
        } catch (err) {
            console.error('Export error:', err);
            alert('Export failed. Please try again.');
        } finally {
            setIsExporting(false);
        }
    };

    const handlePaymentComplete = async (paymentData: any) => {
        if (!vendor || !currentCycle) return;

        try {
            const response = await fetch(`/api/properties/${propertyId}/payments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vendor_id: vendor.id,
                    cycle_id: currentCycle.id,
                    amount: paymentData.amount,
                    gateway_name: paymentData.method,
                }),
            });

            if (!response.ok) throw new Error('Payment recording failed');

            // Refresh cycle data to show updated stats
            initializeDashboard();
        } catch (err) {
            console.error('Payment completion error:', err);
        }
    };

    // Calculate cycle progress
    const getCycleDay = () => {
        if (!currentCycle) return { day: 1, total: 15 };
        const start = new Date(currentCycle.cycle_start);
        const end = new Date(currentCycle.cycle_end);
        const today = new Date();

        // Calculate dynamic total days based on the cycle period
        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        // Use either today or the cycle end date for day calculation
        const effectiveEnd = today < end ? today : end;
        const diffTime = effectiveEnd.getTime() - start.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

        return {
            day: Math.max(1, diffDays),
            total: Math.max(1, totalDays)
        };
    };

    const getDaysRemaining = () => {
        if (!currentCycle) return 15;
        const end = new Date(currentCycle.cycle_end);
        const today = new Date();
        const diffTime = end.getTime() - today.getTime();
        const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, days);
    };

    if (isLoading) return (
        <div className="min-h-screen flex items-center justify-center bg-white">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-slate-100 border-t-slate-900 rounded-full animate-spin" />
                <p className="text-slate-500 font-bold">Initializing Portal...</p>
            </div>
        </div>
    );

    // DAILY ENTRY SCREEN (Step 1 from PRD)
    if (viewState === 'entry') {
        return (
            <div className="min-h-screen bg-white flex flex-col font-inter">
                <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="max-w-md w-full"
                    >
                        <h1 className="text-3xl md:text-4xl font-black text-slate-900 mb-2 leading-tight">
                            Record Revenue for <br />
                            <span className="text-indigo-600">
                                {new Date(entryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </span>
                        </h1>
                        <p className="text-slate-500 font-medium mb-12">Select any date to record historical or daily revenue.</p>

                        <div className="relative mb-8 space-y-4">
                            <div className="flex items-center justify-center gap-4 mb-4">
                                <span className="text-sm font-bold text-slate-400">Entry for Date:</span>
                                <input
                                    type="date"
                                    value={entryDate}
                                    onChange={(e) => setEntryDate(e.target.value)}
                                    className="bg-slate-50 border-2 border-slate-100 rounded-xl px-4 py-2 font-bold text-slate-600 focus:border-indigo-600 focus:ring-0 transition-all"
                                />
                            </div>
                            <div className="relative">
                                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">₹</span>
                                <input
                                    type="number"
                                    value={revenue}
                                    onChange={(e) => setRevenue(e.target.value)}
                                    placeholder="Enter total revenue"
                                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-indigo-600 focus:ring-0 rounded-3xl py-8 pl-12 pr-8 text-3xl font-black text-slate-900 transition-all placeholder:text-slate-200"
                                    autoFocus
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSubmitRevenue}
                            disabled={isSubmitting || !revenue}
                            className="w-full bg-slate-900 text-white py-6 rounded-3xl font-black text-xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <div className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>Submit & Exit</>
                            )}
                        </button>
                    </motion.div>
                </main>
                <footer className="p-8 flex justify-center gap-8 border-t border-slate-50">
                    <button
                        onClick={() => {
                            setViewState('dashboard');
                            setActiveTab('portal');
                        }}
                        className="text-slate-400 font-bold text-sm flex items-center gap-2 hover:text-indigo-600 transition-colors"
                    >
                        <LayoutDashboard className="w-4 h-4" /> View Dashboard
                    </button>
                    <button
                        onClick={() => {
                            setViewState('dashboard');
                            setActiveTab('history');
                        }}
                        className="text-slate-400 font-bold text-sm flex items-center gap-2 hover:text-indigo-600 transition-colors"
                    >
                        <History className="w-4 h-4" /> View History
                    </button>
                    <button
                        onClick={() => setShowSignOutModal(true)}
                        className="text-slate-400 font-bold text-sm flex items-center gap-2 hover:text-rose-600 transition-colors"
                    >
                        <LogOut className="w-4 h-4" /> Sign Out
                    </button>
                </footer>

                <SignOutModal
                    isOpen={showSignOutModal}
                    onClose={() => setShowSignOutModal(false)}
                    onConfirm={signOut}
                />
            </div>
        );
    }

    // ALREADY SUBMITTED SCREEN (Step 2 from PRD)
    if (viewState === 'already_submitted') {
        return (
            <div className="min-h-screen bg-indigo-600 flex flex-col font-inter text-white">
                <main className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="max-w-md w-full"
                    >
                        <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mb-8 mx-auto">
                            <CheckCircle2 className="w-12 h-12 text-white" />
                        </div>
                        <h1 className="text-3xl font-black mb-4">
                            Revenue for {new Date(entryDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })} <br /> recorded successfully!
                        </h1>
                        <p className="text-indigo-100 font-medium mb-12 text-lg">You're all set for today.</p>

                        <div className="space-y-4">
                            <button
                                onClick={() => {
                                    setViewState('entry');
                                    setRevenue('');
                                }}
                                className="w-full bg-white text-indigo-600 py-5 rounded-2xl font-black text-lg hover:bg-indigo-50 transition-all shadow-lg"
                            >
                                Record Another Day
                            </button>
                            <button
                                onClick={() => {
                                    setViewState('dashboard');
                                    setActiveTab('portal');
                                }}
                                className="w-full bg-indigo-700/50 text-white py-5 rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all border border-indigo-500/30"
                            >
                                View Dashboard
                            </button>
                            <button
                                onClick={() => setShowSignOutModal(true)}
                                className="w-full bg-indigo-700/50 text-white py-5 rounded-2xl font-black text-lg hover:bg-indigo-700 transition-all border border-indigo-500/30"
                            >
                                Logout
                            </button>
                        </div>
                    </motion.div>
                </main>

                <SignOutModal
                    isOpen={showSignOutModal}
                    onClose={() => setShowSignOutModal(false)}
                    onConfirm={signOut}
                />
            </div>
        );
    }

    // MINIMAL DASHBOARD (Step 3 from PRD) - ENHANCED with live data
    const cycleProgress = getCycleDay();
    const daysRemaining = getDaysRemaining();

    return (
        <div className="min-h-screen bg-[#F8F9FC] flex font-inter text-slate-900">
            {/* Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/40 z-20 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar (Very Minimal) */}
            <aside className={`w-72 bg-white border-r border-slate-100 flex flex-col fixed h-full z-30 p-8 transition-transform duration-300 ease-in-out lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="flex items-center justify-between mb-12">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-text-inverse">
                            <Store className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="font-bold text-sm leading-tight text-slate-900 truncate max-w-[120px]">{vendor?.shop_name}</h2>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{vendor?.property_name}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden p-2 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                <nav className="flex-1 space-y-2">
                    <button
                        onClick={() => { setActiveTab('portal'); setSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'portal'
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <LayoutDashboard className="w-4 h-4" />
                        Portal
                    </button>
                    <button
                        onClick={() => { setActiveTab('history'); setSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'history'
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <History className="w-4 h-4" />
                        History
                    </button>
                    <button
                        onClick={() => { setActiveTab('profile'); setSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'profile'
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <UserCircle className="w-4 h-4" />
                        Profile
                    </button>
                    <button
                        onClick={() => { setActiveTab('settings'); setSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'settings'
                            ? 'bg-primary/10 text-primary'
                            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                            }`}
                    >
                        <Settings className="w-4 h-4" />
                        Settings
                    </button>
                </nav>

                <div className="pt-8 border-t border-slate-50">
                    <button
                        onClick={() => setShowSignOutModal(true)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-sm transition-all group"
                    >
                        <LogOut className="w-4 h-4 group-hover:translate-x-1 transition-transform" /> Sign Out
                    </button>
                </div>
            </aside>

            <main className="flex-1 lg:ml-72 p-4 sm:p-6 lg:p-12">
                <header className="mb-8 lg:mb-12 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="lg:hidden p-2.5 bg-white rounded-xl border border-slate-100 shadow-sm hover:bg-slate-50 transition-all"
                        >
                            <Menu className="w-5 h-5 text-slate-600" />
                        </button>
                        <div>
                            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight text-slate-900">
                                {activeTab === 'portal' && 'Vendor Portal'}
                                {activeTab === 'history' && 'Revenue History'}
                                {activeTab === 'profile' && 'Vendor Profile'}
                                {activeTab === 'settings' && 'Account Settings'}
                            </h1>
                            <p className="text-slate-500 font-medium text-sm">
                                {activeTab === 'portal' && 'Monitoring your revenue and commissions.'}
                                {activeTab === 'history' && 'Track your past submissions and earnings.'}
                                {activeTab === 'profile' && 'View your store and contact information.'}
                                {activeTab === 'settings' && 'Update your personal account details.'}
                            </p>
                        </div>
                    </div>
                    {activeTab === 'history' && (
                        <div className="flex items-center gap-2 sm:gap-4 w-full sm:w-auto">
                            <button
                                onClick={() => setViewState('entry')}
                                className="flex-1 sm:flex-none px-4 sm:px-6 py-3 bg-emerald-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 text-xs sm:text-sm"
                            >
                                <Plus className="w-4 h-4" />
                                <span className="hidden sm:inline">Record Missing Date</span>
                                <span className="sm:hidden">Record</span>
                            </button>
                            <button
                                onClick={() => setShowExportModal(true)}
                                className="flex-1 sm:flex-none px-4 sm:px-6 py-3 bg-white border border-slate-100 text-slate-600 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-slate-50 transition-all text-xs sm:text-sm"
                            >
                                <FileDown className="w-4 h-4" />
                                Export
                            </button>
                        </div>
                    )}
                    {activeTab === 'portal' && (
                        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm w-full sm:w-auto">
                            <div className="flex items-center gap-2 px-3">
                                <Clock className="w-4 h-4 text-slate-400" />
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Period:</span>
                            </div>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setIsFiltered(true);
                                }}
                                className="text-xs font-bold text-slate-900 border-none bg-slate-50 rounded-lg py-1.5 focus:ring-0 flex-1 min-w-[120px]"
                            />
                            <span className="text-slate-300">to</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setIsFiltered(true);
                                }}
                                className="text-xs font-bold text-slate-900 border-none bg-slate-50 rounded-lg py-1.5 focus:ring-0 flex-1 min-w-[120px]"
                            />
                            {isFiltered && (
                                <button
                                    onClick={() => {
                                        setIsFiltered(false);
                                        setStartDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
                                        setEndDate(new Date().toISOString().split('T')[0]);
                                    }}
                                    className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg transition-colors"
                                    title="Reset Filter"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    )}
                </header>

                <AnimatePresence mode="wait">
                    {activeTab === 'portal' ? (
                        <motion.div
                            key="portal"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="space-y-4 lg:space-y-12"
                        >
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-8">
                                <div className="bg-white p-4 lg:p-8 rounded-2xl lg:rounded-3xl border border-slate-100 shadow-sm">
                                    <div className="w-10 h-10 lg:w-12 lg:h-12 bg-indigo-50 text-indigo-600 rounded-xl lg:rounded-2xl flex items-center justify-center mb-3 lg:mb-6">
                                        <Store className="w-5 h-5 lg:w-6 lg:h-6" />
                                    </div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Store Details</p>
                                    <h3 className="text-lg lg:text-xl font-black text-slate-900">{vendor?.shop_name}</h3>
                                    <div className="mt-2 lg:mt-4 flex items-center gap-2 text-sm font-bold text-indigo-600">
                                        <Percent className="w-4 h-4" />
                                        {vendor?.commission_rate}% Commission
                                    </div>
                                </div>

                                <div className="md:col-span-2 bg-card text-text-primary p-4 lg:p-8 rounded-2xl lg:rounded-3xl border border-border shadow-sm flex flex-col justify-between">
                                    <div className="flex justify-between items-start gap-2">
                                        <div>
                                            <p className="text-[10px] font-black text-text-tertiary uppercase tracking-widest mb-1">
                                                {currentCycle?.status === 'filtered' ? 'Custom Period Summary' : 'Current Commission Cycle'}
                                            </p>
                                            <h3 className="text-xl lg:text-2xl font-black text-text-primary">
                                                {currentCycle?.status === 'filtered' ? (
                                                    <span>Summary View</span>
                                                ) : (
                                                    <>Day {cycleProgress.day} <span className="text-text-tertiary">/ {cycleProgress.total}</span></>
                                                )}
                                            </h3>
                                        </div>
                                        <div className="bg-primary/10 text-primary px-3 py-1.5 lg:px-4 lg:py-2 rounded-xl text-[10px] lg:text-xs font-bold border border-primary/20 whitespace-nowrap">
                                            {currentCycle?.status === 'filtered' ? 'Filtered View' : `Due in ${daysRemaining} Days`}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 lg:gap-8 mt-4 lg:mt-8">
                                        <div>
                                            <p className="text-[10px] font-black text-text-tertiary uppercase tracking-widest mb-1">Revenue so far</p>
                                            <p className="text-2xl font-black text-text-primary">
                                                ₹{(currentCycle?.total_revenue || 0).toLocaleString('en-IN')}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-text-tertiary uppercase tracking-widest mb-1">Commission Accrued</p>
                                            <p className="text-2xl font-black text-emerald-600">
                                                ₹{(currentCycle?.commission_due || 0).toLocaleString('en-IN')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 lg:flex lg:flex-wrap lg:items-center lg:gap-4">
                                <button
                                    onClick={() => setViewState('entry')}
                                    className="px-3 lg:px-8 py-3 lg:py-4 bg-emerald-600 text-white rounded-xl lg:rounded-2xl font-black flex items-center justify-center gap-1.5 lg:gap-2 hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 text-xs lg:text-sm"
                                >
                                    <Plus className="w-4 h-4" />
                                    <span className="hidden sm:inline">Record Revenue</span>
                                    <span className="sm:hidden">Record</span>
                                </button>
                                <button
                                    onClick={() => setShowPaymentModal(true)}
                                    className="px-3 lg:px-8 py-3 lg:py-4 bg-indigo-600 text-white rounded-xl lg:rounded-2xl font-black flex items-center justify-center gap-1.5 lg:gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 text-xs lg:text-sm"
                                >
                                    <Wallet className="w-4 h-4" />
                                    <span className="hidden sm:inline">Pay Commission</span>
                                    <span className="sm:hidden">Pay</span>
                                </button>
                                <button
                                    onClick={() => setShowExportModal(true)}
                                    className="px-3 lg:px-8 py-3 lg:py-4 bg-white border border-slate-100 text-slate-600 rounded-xl lg:rounded-2xl font-black flex items-center justify-center gap-1.5 lg:gap-2 hover:bg-slate-50 transition-all text-xs lg:text-sm"
                                >
                                    <FileDown className="w-5 h-5" />
                                    Export Data
                                </button>
                            </div>
                        </motion.div>
                    ) : activeTab === 'history' ? (
                        <motion.div
                            key="history"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="bg-white rounded-2xl lg:rounded-3xl border border-slate-100 shadow-sm overflow-hidden"
                        >
                            {/* Mobile card view */}
                            <div className="md:hidden">
                                {history.length === 0 ? (
                                    <div className="px-4 py-12 text-center text-slate-400 italic font-medium">
                                        No history entries found.
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-50">
                                        {history.map((entry) => (
                                            <div key={entry.id} className="p-4 flex items-center justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm text-slate-900">
                                                        {new Date(entry.entry_date || entry.revenue_date).toLocaleDateString('en-IN', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric'
                                                        })}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                                        {new Date(entry.created_at).toLocaleString('en-IN', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="font-black text-sm text-slate-900">₹{entry.revenue_amount.toLocaleString('en-IN')}</p>
                                                    <p className="font-bold text-xs text-emerald-600 mt-0.5">
                                                        C: ₹{(entry.revenue_amount * (vendor?.commission_rate || 10) / 100).toLocaleString('en-IN')}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Desktop table view */}
                            <div className="hidden md:block overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead className="bg-slate-50 border-b border-slate-100">
                                        <tr>
                                            <th className="px-6 lg:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Revenue Date</th>
                                            <th className="px-6 lg:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount Reported</th>
                                            <th className="px-6 lg:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Commission ({vendor?.commission_rate}%)</th>
                                            <th className="px-6 lg:px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Submission Date</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {history.length === 0 ? (
                                            <tr>
                                                <td colSpan={4} className="px-6 lg:px-8 py-12 text-center text-slate-400 italic font-medium">
                                                    No history entries found.
                                                </td>
                                            </tr>
                                        ) : (
                                            history.map((entry) => (
                                                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-6 lg:px-8 py-5 font-bold text-slate-900">
                                                        {new Date(entry.entry_date || entry.revenue_date).toLocaleDateString('en-IN', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            year: 'numeric'
                                                        })}
                                                    </td>
                                                    <td className="px-6 lg:px-8 py-5 font-black text-slate-900">
                                                        ₹{entry.revenue_amount.toLocaleString('en-IN')}
                                                    </td>
                                                    <td className="px-6 lg:px-8 py-5 font-black text-emerald-600">
                                                        ₹{(entry.revenue_amount * (vendor?.commission_rate || 10) / 100).toLocaleString('en-IN')}
                                                    </td>
                                                    <td className="px-6 lg:px-8 py-5 text-slate-400 text-sm font-medium">
                                                        {new Date(entry.created_at).toLocaleString('en-IN', {
                                                            day: 'numeric',
                                                            month: 'short',
                                                            hour: '2-digit',
                                                            minute: '2-digit'
                                                        })}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </motion.div>
                    ) : activeTab === 'settings' ? (
                        <motion.div
                            key="settings"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <SettingsView onUpdate={initializeDashboard} />
                        </motion.div>
                    ) : (
                        <motion.div
                            key="profile"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="flex justify-center"
                        >
                            <div className="bg-white border border-slate-100 rounded-3xl shadow-lg w-full max-w-md overflow-hidden">
                                <div className="bg-primary/5 p-6 md:p-12 flex flex-col items-center border-b border-slate-100">
                                    <div className="w-24 h-24 bg-primary rounded-full flex items-center justify-center border-4 border-white mb-6 overflow-hidden shadow-xl">
                                        {user?.user_metadata?.user_photo_url || user?.user_metadata?.avatar_url ? (
                                            <Image
                                                src={user.user_metadata.user_photo_url || user.user_metadata.avatar_url}
                                                alt="Profile"
                                                width={96}
                                                height={96}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <span className="text-4xl font-black text-white">
                                                {user?.user_metadata?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'V'}
                                            </span>
                                        )}
                                    </div>
                                    <h2 className="text-2xl font-black text-slate-900 mb-1">{vendor?.shop_name}</h2>
                                    <p className="text-primary font-bold">{vendor?.property_name}</p>
                                    <div className="mt-4 px-4 py-1.5 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest">
                                        Food Vendor
                                    </div>
                                </div>
                                <div className="p-4 md:p-8 space-y-6">
                                    <div className="grid grid-cols-1 gap-4 md:gap-6">
                                        <div className="flex justify-between items-center py-3 border-b border-slate-50">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor Name</span>
                                            <span className="text-sm font-bold text-slate-900">{vendor?.owner_name || user?.user_metadata?.full_name || 'Not Set'}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-3 border-b border-slate-50">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Address</span>
                                            <span className="text-sm font-medium text-slate-600">{user?.email}</span>
                                        </div>
                                        <div className="flex justify-between items-center py-3 border-b border-slate-50">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Commission Rate</span>
                                            <span className="text-sm font-black text-indigo-600">{vendor?.commission_rate}%</span>
                                        </div>
                                        <div className="flex justify-between items-center py-3 border-b border-slate-50">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Shop Status</span>
                                            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold border border-emerald-100 capitalize">
                                                Active
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setActiveTab('settings')}
                                        className="w-full py-4 bg-slate-50 text-slate-600 rounded-2xl font-bold text-sm hover:bg-slate-100 transition-all border border-slate-100 flex items-center justify-center gap-2"
                                    >
                                        <Settings className="w-4 h-4" /> Edit Profile Settings
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </main>

            <SignOutModal
                isOpen={showSignOutModal}
                onClose={() => setShowSignOutModal(false)}
                onConfirm={signOut}
            />

            <VendorExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                onExport={handleExport}
                isExporting={isExporting}
            />

            <VendorPaymentModal
                isOpen={showPaymentModal}
                onClose={() => setShowPaymentModal(false)}
                amountDue={currentCycle?.commission_due || 0}
                vendorName={vendor?.shop_name || 'Vendor'}
                onPaymentComplete={handlePaymentComplete}
            />
        </div>
    );
};

export default FoodVendorDashboard;
