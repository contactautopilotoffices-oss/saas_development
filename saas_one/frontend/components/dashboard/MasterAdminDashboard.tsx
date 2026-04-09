/**
 * MasterAdminDashboard — Top-Level Master Admin Dashboard Entry Point
 *
 * The root dashboard for users with is_master_admin = true. It routes to different
 * feature tabs (overview, analytics, organizations, tickets, users, etc.) and provides
 * a full-featured admin interface for managing organizations, users, tickets, AI insights,
 * WhatsApp templates, and more. The component enforces the master admin role by re-verifying
 * against the database before loading any data.
 *
 * KEY STATE:
 *   - activeTab:     Tab — the currently selected tab (type: 'overview' | 'analytics' | 'organizations' | ...)
 *   - searchQuery:   string — live search filter for organizations and users
 *   - organizations: Organization[] — all organizations fetched from Supabase
 *   - users:        SystemUser[] — all system users fetched from Supabase
 *   - stats:        { entities, activeSessions, securityAlerts, pendingDeletions } — dashboard summary stats
 *   - toast:        { message, type } | null — ephemeral toast notification
 *   - selectedOrg:   Organization | null — the org selected for drill-down (org detail view)
 *   - showCreateOrgModal / showCreateUserModal / showCreateTicketModal — modal visibility flags
 *
 * TABS / SUB-VIEWS:
 *   - overview:          MasterStats + org/user counts + quick actions
 *   - analytics:         AnalyticsTab component
 *   - organizations:     OrgPropertyDashboard (CRUD orgs with drill-down)
 *   - tickets:          TicketsView
 *   - users:            User management table
 *   - visitors:          Visitor management
 *   - invite-links:     InviteLinkGenerator
 *   - ai-insights:      AIInsightsDashboard
 *   - ai-assistant:     MasterAdminChatbot
 *   - issue-config:     IssueCategoryKanban
 *   - modules:          Module management
 *   - settings:         System settings
 *   - resolvers:        ResolverStatsList (MST performance)
 *   - super-tenants:    Super tenant management
 *   - whatsapp-templates: WhatsAppTemplatesManager
 *
 * INTEGRATION:
 *   - Verifies is_master_admin in a useEffect before fetching any data
 *   - Composes OrgPropertyDashboard, TicketsView, AdminSPOCDashboard, InviteLinkGenerator,
 *     AIInsightsDashboard, IssueCategoryKanban, AnalyticsTab, MasterAdminChatbot,
 *     ResolverStatsList, and WhatsAppTemplatesManager as tab content
 *   - Uses Supabase auth + database for all data operations
 *   - Uses useAuth() for sign-out and useTheme() for theme toggle
 *   - Renders TicketCreateModal for creating tickets from the admin view
 *   - Toast notifications for CRUD operation feedback (auto-dismiss after 3s)
 *
 * UI/UX PATTERNS:
 *   - Tab bar with icon + label for each feature area
 *   - Search input that filters the active list (organizations or users)
 *   - Create modals for org, user, and ticket creation
 *   - Sign-out confirmation via SignOutModal
 *   - Framer-motion toast for success/error feedback
 *   - Role check gate prevents non-admin users from accessing any data
 */
'use client';

import React, { useState, useEffect } from 'react';
import {
    ShieldCheck, Users, Building2, AlertTriangle, Activity,
    LayoutGrid, Settings, Trash2, RefreshCcw,
    CheckCircle2, AlertCircle, Search, Plus, ExternalLink, XCircle, Filter,
    Key, Eye, EyeOff, Globe, Copy, X, Ticket, Link as LinkIcon, LogOut,
    UserCircle, FileDown, Brain, Wrench, MessageCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import { useAuth } from '@/frontend/context/AuthContext';
import OrgPropertyDashboard from './OrgPropertyDashboard';
import TicketsView from './TicketsView';
import AdminSPOCDashboard from '../tickets/AdminSPOCDashboard';
import InviteLinkGenerator from './InviteLinkGenerator';
import { HapticCard } from '@/frontend/components/ui/HapticCard';
import SignOutModal from '@/frontend/components/ui/SignOutModal';
import { useTheme } from '@/frontend/context/ThemeContext';
import { Sun, Moon } from 'lucide-react';
import TicketCreateModal from '@/frontend/components/tickets/TicketCreateModal';
import AIInsightsDashboard from './AIInsightsDashboard';
import IssueCategoryKanban from '@/frontend/components/admin/IssueCategoryKanban';
import AnalyticsTab from './AnalyticsTab';
import MasterAdminChatbot from './MasterAdminChatbot';
import ResolverStatsList from '@/frontend/components/mst/ResolverStatsList';
import { MessageSquareCode } from 'lucide-react';
import WhatsAppTemplatesManager from '@/frontend/components/admin/WhatsAppTemplatesManager';

type Tab = 'overview' | 'analytics' | 'organizations' | 'tickets' | 'users' | 'visitors' | 'invite-links' | 'ai-insights' | 'ai-assistant' | 'issue-config' | 'modules' | 'settings' | 'resolvers' | 'super-tenants' | 'whatsapp-templates';

interface Organization {
    id: string;
    name: string;
    code: string;
    is_deleted: boolean;
    deleted_at: string | null;
    deletion_secret: string | null;
    available_modules: string[];
    created_at: string;
    properties?: { count: number }[];
    organization_memberships?: { count: number }[];
}

interface SystemUser {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    created_at: string;
    organization_memberships?: { role: string; organization_id: string; is_active?: boolean }[];
    property_memberships?: { role: string; organization_id: string; is_active?: boolean; property: { name: string; code: string } }[];
    is_master_admin?: boolean;
}

const MasterAdminDashboard = () => {
    const { user, signOut } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [searchQuery, setSearchQuery] = useState('');
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [users, setUsers] = useState<SystemUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateOrgModal, setShowCreateOrgModal] = useState(false);
    const [showCreateUserModal, setShowCreateUserModal] = useState(false);
    const [showCreateTicketModal, setShowCreateTicketModal] = useState(false);
    const [stats, setStats] = useState({
        entities: 0,
        activeSessions: 0,
        securityAlerts: 0,
        pendingDeletions: 0
    });
    const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null); // For drill-down
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const supabase = createClient();

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        // Strict Role Check before Data Fetch
        const initDashboard = async () => {
            // Re-verify master admin just in case (optional but safe)
            const { data: userProfile } = await supabase
                .from('users')
                .select('is_master_admin')
                .eq('id', user?.id)
                .single();

            if (userProfile?.is_master_admin) {
                fetchOrganizations();
                fetchUsers();
                fetchStats();
            }
        };

        if (user) {
            initDashboard();
        }
    }, [user]);

    // Restore tab from URL and handle back navigation
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['overview', 'analytics', 'organizations', 'tickets', 'users', 'visitors', 'invite-links', 'ai-insights', 'ai-assistant', 'issue-config', 'modules', 'settings', 'resolvers', 'super-tenants', 'whatsapp-templates'].includes(tab)) {
            setActiveTab(tab as Tab);
        }
    }, [searchParams]);

    // Robust Unified Scroll Restoration for Master Admin
    useEffect(() => {
        // We restore scroll when the tab is 'tickets' and we're not loading
        if (activeTab === 'tickets' && !isLoading) {
            const savedScrollY = sessionStorage.getItem(`mastScrollY`);
            const lastTicketId = sessionStorage.getItem(`mastLastTicketId`);

            if (savedScrollY || lastTicketId) {
                const scrollContainer = document.getElementById('main-scroll-container');
                let retryCount = 0;
                const maxRetries = 10; // Increased to 10 (approx 500ms total window)

                const attemptRestoration = () => {
                    const container = scrollContainer || window;
                    
                    // Set scroll behavior to auto to avoid smooth-scroll race conditions
                    if (container instanceof HTMLElement) {
                        container.style.setProperty('scroll-behavior', 'auto', 'important');
                    }

                    // Priority 1: Scroll the specific ticket into center view
                    if (lastTicketId) {
                        const targetElement = document.getElementById(`ticket-${lastTicketId}`);
                        if (targetElement) {
                            targetElement.scrollIntoView({ behavior: 'auto', block: 'center' });
                            
                            // Successful restoration
                            sessionStorage.removeItem(`mastLastTicketId`);
                            sessionStorage.removeItem(`mastScrollY`);
                            
                            if (container instanceof HTMLElement) {
                                setTimeout(() => { container.style.scrollBehavior = ''; }, 100);
                            }
                            return;
                        }
                    }

                    // Priority 2: Fallback to exact pixel offset
                    if (savedScrollY) {
                        const targetY = parseInt(savedScrollY, 10);
                        
                        // Wait if the container hasn't physically grown enough yet to accommodate the scroll
                        const currentHeight = container instanceof HTMLElement ? container.scrollHeight : document.body.scrollHeight;
                        if (currentHeight < targetY && retryCount < maxRetries) {
                            // Container is still too short (likely rendering items), keep retrying
                        } else {
                            container.scrollTo({ top: targetY, behavior: 'auto' });
                            sessionStorage.removeItem(`mastScrollY`);
                            sessionStorage.removeItem(`mastLastTicketId`);
                            
                            if (container instanceof HTMLElement) {
                                setTimeout(() => { container.style.scrollBehavior = ''; }, 100);
                            }
                            return;
                        }
                    }

                    // Retry logic
                    if (retryCount < maxRetries) {
                        retryCount++;
                        setTimeout(attemptRestoration, 50);
                    }
                };

                // Start restoration cycle with a small initial delay to ensure DOM paint
                setTimeout(attemptRestoration, 60);
            }
        }
    }, [activeTab, isLoading]);

    // Helper to change tab with URL persistence
    const handleTabChange = (tab: Tab) => {
        setActiveTab(tab);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.pushState({}, '', url.toString());
    };

    // We now fetch users on mount to ensure counts are accurate across the dashboard

    const fetchOrganizations = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('organizations')
            .select('*, properties(count)')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching organizations:', error);
            setIsLoading(false);
            return;
        }

        setOrganizations(data ?? []);
        setIsLoading(false);
    };

    const fetchUsers = async () => {
        setIsLoading(true);
        try {
            // Use the secure Admin API endpoint to bypass client-side RLS issues
            const response = await fetch('/api/admin/users');

            if (!response.ok) {
                // Determine error message based on status
                if (response.status === 403) throw new Error('You do not have permission to view users.');
                if (response.status === 401) throw new Error('Session expired. Please log in again.');
                throw new Error('Failed to fetch users.');
            }

            const data = await response.json();
            setUsers(data || []);
        } catch (err: any) {
            console.error('Error fetching users:', err);
            showToast(
                err.message || 'Failed to load users',
                'error',
            );
        } finally {
            setIsLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const response = await fetch('/api/admin/dashboard-stats');
            if (!response.ok) throw new Error('Failed to fetch stats');
            const data = await response.json();
            setStats(data);
        } catch (err) {
            console.error('Error fetching dashboard stats:', err);
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

        try {
            const response = await fetch('/api/users/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to delete user');
            }

            showToast('User deleted successfully.');
            fetchUsers();
        } catch (error: any) {
            showToast(error.message || 'Failed to delete user', 'error');
        }
    };

    const handleSoftDelete = async (orgId: string) => {
        await supabase
            .from('organizations')
            .update({
                is_deleted: true,
                deleted_at: new Date().toISOString()
            })
            .eq('id', orgId);
        fetchOrganizations();
    };

    const handleRestoreOrg = async (orgId: string) => {
        await supabase
            .from('organizations')
            .update({
                is_deleted: false,
                deleted_at: null
            })
            .eq('id', orgId);
        fetchOrganizations();
    };

    const handleUpdateUserRole = async (userId: string, newRole: string, orgId: string) => {
        await supabase
            .from('organization_memberships')
            .upsert({
                user_id: userId,
                organization_id: orgId,
                role: newRole
            });
        fetchUsers();
    };

    const handleToggleUserStatus = async (userId: string, orgId: string, currentStatus: boolean) => {
        await supabase
            .from('organization_memberships')
            .update({ is_active: !currentStatus })
            .eq('user_id', userId)
            .eq('organization_id', orgId);
        fetchUsers();
    };

    const handleUpdateModules = async (orgId: string, modules: string[]) => {
        await supabase
            .from('organizations')
            .update({ available_modules: modules })
            .eq('id', orgId);
        fetchOrganizations();
    };

    const handleRestoreWithSecret = async (secret: string) => {
        const { data, error } = await supabase
            .from('organizations')
            .update({
                is_deleted: false,
                deleted_at: null
            })
            .eq('deletion_secret', secret)
            .select();

        if (error || !data || data.length === 0) {
            throw new Error('Invalid secret key or organization not found.');
        }
        fetchOrganizations();
    };

    const navItems: { id: Tab, label: string, icon: any }[] = [
        { id: 'overview', label: 'Console', icon: ShieldCheck },
        { id: 'analytics', label: 'Engagement', icon: Activity },
        { id: 'resolvers', label: 'Resolvers', icon: Wrench },
        { id: 'organizations', label: 'Organizations', icon: Building2 },
        { id: 'tickets', label: 'Support Tickets', icon: Ticket },
        { id: 'users', label: 'User Directory', icon: Users },
        { id: 'super-tenants', label: 'Super Tenants', icon: Key },
        { id: 'visitors', label: 'Visitors', icon: UserCircle },
        { id: 'invite-links', label: 'Invite Links', icon: LinkIcon },
        { id: 'ai-insights', label: 'AI Intelligence', icon: Brain },
        { id: 'ai-assistant', label: 'AI Assistant', icon: MessageSquareCode },
        { id: 'issue-config', label: 'Issue Mapping', icon: LayoutGrid },
        { id: 'whatsapp-templates', label: 'WhatsApp Templates', icon: MessageCircle },
        { id: 'modules', label: 'Module Control', icon: LayoutGrid },
        { id: 'settings', label: 'System', icon: Settings },
    ];

    return (
        <div className="min-h-screen bg-background flex font-inter text-foreground">
            {/* Sidebar */}
            <div className="w-72 bg-sidebar border-r border-border flex flex-col p-6 fixed inset-y-0 left-0 overflow-hidden z-20">
                <div className="flex items-center gap-3 mb-8 flex-shrink-0">
                    <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
                        <div className="w-5 h-5 border-2 border-primary rounded-sm rotate-45"></div>
                    </div>
                    <div className="flex flex-col">
                        <span className="font-black text-xl tracking-tighter text-text-primary">MASTER</span>
                        <span className="text-[10px] font-bold text-text-tertiary uppercase tracking-widest -mt-1">Control Hub</span>
                    </div>
                </div>

                <nav className="space-y-2 flex-1 overflow-y-auto pr-2 custom-scrollbar min-h-0">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => handleTabChange(item.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 font-bold text-sm ${activeTab === item.id
                                ? 'bg-primary text-text-inverse shadow-sm'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                }`}
                        >
                            <item.icon className="w-4 h-4" />
                            {item.label}
                        </button>
                    ))}
                </nav>

                <div className="pt-6 pb-12 border-t border-border flex-shrink-0">
                    <div className="bg-orange-500/10 p-4 rounded-2xl border border-orange-500/20 mb-4">
                        <p className="text-[10px] font-black text-brand-orange uppercase tracking-widest mb-1">Status</p>
                        <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-bold text-foreground">Production Mode</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 px-2 mb-6">
                        <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm">
                            {user?.email?.[0].toUpperCase() || 'M'}
                        </div>
                        <div className="flex-1 overflow-hidden">
                            <p className="font-bold text-sm text-foreground truncate">
                                {user?.user_metadata?.full_name || 'Master Admin'}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate font-medium">
                                {user?.email}
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowSignOutModal(true)}
                        className="flex items-center gap-3 px-4 py-3.5 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 rounded-2xl w-full transition-all duration-300 text-sm font-bold group"
                    >
                        <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        Sign Out
                    </button>
                </div>
            </div>

            <SignOutModal
                isOpen={showSignOutModal}
                onClose={() => setShowSignOutModal(false)}
                onConfirm={signOut}
            />

            {/* Main Content */}
            <main id="main-scroll-container" className={`flex-1 ${activeTab === 'ai-assistant' ? 'p-0' : 'p-12'} lg:ml-72 transition-all duration-500 overflow-y-auto`}>
                {activeTab !== 'ai-assistant' && (
                    <header className="flex justify-between items-center mb-12">
                        <div>
                            <h2 className="text-3xl font-black text-text-primary tracking-tight capitalize">{activeTab.replace('-', ' ')}</h2>
                            <p className="text-text-tertiary text-sm font-medium mt-1">Real-time system oversight and governance.</p>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                                <input
                                    type="text"
                                    placeholder="Search master data..."
                                    className="pl-10 pr-4 py-2.5 bg-surface-elevated border border-border rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 w-64"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            {activeTab === 'organizations' && (
                                <button
                                    onClick={() => setShowCreateOrgModal(true)}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-text-inverse font-bold text-xs rounded-xl uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                                >
                                    <Plus className="w-4 h-4" /> New Org
                                </button>
                            )}
                            {activeTab === 'users' && (
                                <button
                                    onClick={() => setShowCreateUserModal(true)}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-primary text-text-inverse font-bold text-xs rounded-xl uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                                >
                                    <Plus className="w-4 h-4" /> New User
                                </button>
                            )}
                            <button
                                onClick={() => setShowSignOutModal(true)}
                                className="flex items-center gap-2 px-5 py-2.5 bg-rose-500 text-white font-bold text-xs rounded-xl uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg shadow-rose-100"
                            >
                                <LogOut className="w-4 h-4" /> Sign Out
                            </button>
                        </div>
                    </header>
                )}

                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {activeTab === 'overview' && <OverviewGrid stats={stats} />}
                        {activeTab === 'analytics' && <AnalyticsTab />}
                        {activeTab === 'organizations' && (
                            selectedOrg ? (
                                <OrgPropertyDashboard
                                    organization={selectedOrg}
                                    onBack={() => setSelectedOrg(null)}
                                />
                            ) : (
                                <OrganizationsList
                                    organizations={organizations}
                                    users={users} // Pass users to compute counts
                                    isLoading={isLoading}
                                    onSoftDelete={handleSoftDelete}
                                    onRestore={handleRestoreOrg}
                                    onDrillDown={(org) => setSelectedOrg(org)}
                                />
                            )
                        )}
                        {activeTab === 'tickets' && (
                            <AdminSPOCDashboard
                                organizationId=""
                                adminUser={{
                                    full_name: user?.user_metadata?.full_name || 'Master Admin',
                                    avatar_url: user?.user_metadata?.avatar_url
                                }}
                            />
                        )}
                        {activeTab === 'users' && (
                            <UserDirectory
                                users={users}
                                organizations={organizations}
                                onUpdateRole={handleUpdateUserRole}
                                onToggleStatus={handleToggleUserStatus}
                                onDeleteUser={handleDeleteUser}
                                onAddUser={() => setShowCreateUserModal(true)}
                            />
                        )}
                        {activeTab === 'visitors' && (
                            <MasterVisitorsTab />
                        )}
                        {activeTab === 'invite-links' && (
                            <InviteLinkGenerator organizations={organizations} />
                        )}
                        {activeTab === 'ai-insights' && (
                            <AIInsightsDashboard isDark={theme === 'dark'} />
                        )}
                        {activeTab === 'ai-assistant' && (
                            <MasterAdminChatbot />
                        )}
                        {activeTab === 'whatsapp-templates' && (
                            <WhatsAppTemplatesManager />
                        )}
                        {activeTab === 'modules' && (
                            <ModuleConfig
                                organizations={organizations}
                                onUpdateModules={handleUpdateModules}
                            />
                        )}
                        {activeTab === 'issue-config' && (
                            <IssueCategoryKanban />
                        )}
                        {activeTab === 'settings' && (
                            <SystemSettings onRestore={handleRestoreWithSecret} />
                        )}
                        {activeTab === 'resolvers' && (
                            <ResolverStatsList />
                        )}
                        {activeTab === 'super-tenants' && (
                            <SuperTenantManagerTab
                                users={users}
                                organizations={organizations}
                                showToast={showToast}
                            />
                        )}
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Toast Notification */}
            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]"
                    >
                        <div className={`px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${toast.type === 'success'
                            ? 'bg-emerald-900 border-emerald-500/50 text-emerald-50'
                            : 'bg-rose-900 border-rose-500/50 text-rose-50'
                            }`}>
                            {toast.type === 'success' ? (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            ) : (
                                <AlertTriangle className="w-5 h-5 text-rose-400" />
                            )}
                            <span className="font-bold text-sm tracking-tight">{toast.message}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Modals */}
            <AnimatePresence>
                {showCreateOrgModal && (
                    <CreateOrgModal
                        onClose={() => setShowCreateOrgModal(false)}
                        onCreated={() => {
                            fetchOrganizations();
                        }}
                        showToast={showToast}
                    />
                )}
                {showCreateUserModal && (
                    <CreateUserModal
                        onClose={() => setShowCreateUserModal(false)}
                        onCreated={fetchUsers}
                        organizations={organizations}
                        showToast={showToast}
                    />
                )}
                {showCreateTicketModal && (
                    <TicketCreateModal
                        isOpen={showCreateTicketModal}
                        onClose={() => setShowCreateTicketModal(false)}
                        isAdminMode={true}
                        showInternalToggle={true}
                        organizations={organizations}
                        onSuccess={() => {
                            showToast('Request created successfully', 'success');
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// Sub-component: Overview Grid with Haptic Hover
const OverviewGrid = ({ stats }: { stats: any }) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [reducedMotion, setReducedMotion] = useState(false);

    // Detect prefers-reduced-motion
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReducedMotion(mediaQuery.matches);
        const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    const kpiStats = [
        {
            id: 'licensed-entities',
            label: 'Licensed Entities',
            value: stats.entities.toString(),
            icon: Building2,
            trend: '-',
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            analytics: {
                title: 'Entity Growth',
                items: [
                    { region: 'Current Total', count: stats.entities, delta: '-' },
                ]
            }
        },
        {
            id: 'active-sessions',
            label: 'Active Sessions',
            value: stats.activeSessions.toString(),
            icon: Activity,
            trend: stats.activeSessions > 0 ? 'LIVE' : '-',
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            analytics: {
                title: 'Engagement',
                items: [
                    { label: 'Live Users', count: stats.activeSessions, delta: '0' },
                ]
            }
        },
        {
            id: 'security-alerts',
            label: 'Security Alerts',
            value: stats.securityAlerts.toString(),
            icon: ShieldCheck,
            trend: stats.securityAlerts === 0 ? 'SAFE' : 'NOTICE',
            color: 'text-indigo-600',
            bg: 'bg-indigo-50',
            analytics: {
                title: 'Threat Timeline',
                items: [
                    { label: 'Resolved Today', count: stats.securityAlerts, delta: '-' },
                ]
            }
        },
        {
            id: 'pending-deletions',
            label: 'Pending Deletions',
            value: stats.pendingDeletions.toString(),
            icon: Trash2,
            trend: stats.pendingDeletions > 0 ? 'QUEUED' : '-',
            color: 'text-rose-600',
            bg: 'bg-rose-50',
            analytics: {
                title: 'Deletion Queue',
                items: [
                    { label: 'Pending', count: stats.pendingDeletions, delta: '-' },
                ]
            }
        },
    ];

    return (
        <div className="space-y-8">
            <div
                className="grid gap-6 transition-all duration-500 ease-out"
                style={{
                    gridTemplateColumns: expandedId
                        ? 'repeat(4, minmax(0, 1fr))'
                        : 'repeat(4, minmax(0, 1fr))'
                }}
            >
                {kpiStats.map((stat) => {
                    const isExpanded = expandedId === stat.id;
                    const isSibling = expandedId !== null && !isExpanded;

                    return (
                        <HapticCard
                            key={stat.id}
                            id={stat.id}
                            isExpanded={isExpanded}
                            onActivate={setExpandedId}
                            reducedMotion={reducedMotion}
                            className={`${isSibling ? 'opacity-60' : ''} kpi-card`}
                            baseContent={
                                <>
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="w-12 h-12 kpi-icon flex items-center justify-center">
                                            <stat.icon className="w-6 h-6 text-secondary" />
                                        </div>
                                        <span className="text-[11px] font-body font-medium text-text-tertiary px-2 py-1 rounded-lg tracking-wider">
                                            {stat.trend}
                                        </span>
                                    </div>
                                    <p className="text-4xl metric-number text-text-primary mb-1">{stat.value}</p>
                                    <p className="text-[10px] font-body font-medium text-text-tertiary tracking-widest">{stat.label}</p>
                                </>
                            }
                            expandedContent={
                                <div className="pt-4 space-y-3">
                                    <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
                                        {stat.analytics.title}
                                    </h4>
                                    {stat.analytics.items.map((item: any, idx: number) => (
                                        <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                                            <span className="text-sm font-bold text-slate-700">
                                                {item.region || item.time || item.label || item.name}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-black text-slate-900">
                                                    {item.count || item.expires}
                                                </span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${item.status === 'Urgent' ? 'bg-rose-100 text-rose-600' :
                                                    item.delta?.startsWith('+') ? 'bg-emerald-100 text-emerald-600' :
                                                        'bg-slate-100 text-slate-500'
                                                    }`}>
                                                    {item.delta || item.status}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            }
                        />
                    );
                })}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-panel p-8">
                    <h3 className="text-2xl font-display font-semibold text-text-primary mb-6">Regional Performance</h3>
                    <div className="space-y-6">
                        {[
                            { name: 'North America', status: 'Optimal', load: 45 },
                            { name: 'European Union', status: 'Maintenance', load: 88 },
                            { name: 'Asia Pacific', status: 'Optimal', load: 12 },
                        ].map((reg, i) => (
                            <div key={i} className="space-y-2">
                                <div className="flex justify-between text-xs font-body font-medium tracking-widest text-text-secondary">
                                    <span>{reg.name}</span>
                                    <span className={reg.load > 80 ? 'text-error' : 'text-success'}>{reg.status}</span>
                                </div>
                                <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div className={`h-full ${reg.load > 80 ? 'bg-error' : 'bg-success'} rounded-full`} style={{ width: `${reg.load}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="glass-panel p-8">
                    <h3 className="text-2xl font-display font-semibold text-text-primary mb-6">System Health</h3>
                    <div className="space-y-4">
                        {[
                            { id: 'AUTH-SV', label: 'Auth Middleware', status: 'Healthy' },
                            { id: 'DB-IDX', label: 'Global Indexes', status: 'Warning' },
                            { id: 'OAUTH-API', label: 'OAuth Gateway', status: 'Healthy' }
                        ].map((svc, i) => (
                            <div key={i} className="flex items-center justify-between p-4 premium-list">
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-body font-medium text-text-tertiary px-2 py-0.5 border border-border/10 rounded-md tracking-widest">{svc.id}</span>
                                    <span className="text-sm font-body font-medium text-text-secondary">{svc.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${svc.status === 'Healthy' ? 'bg-success' : 'bg-warning'}`} />
                                    <span className="text-xs font-body font-medium text-text-tertiary">{svc.status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// Sub-component: Organization Management
const OrganizationsList = ({ organizations, users, isLoading, onSoftDelete, onRestore, onDrillDown }: {
    organizations: Organization[];
    users: SystemUser[];
    isLoading: boolean;
    onSoftDelete: (id: string) => void;
    onRestore: (id: string) => void;
    onDrillDown?: (org: Organization) => void;
}) => {
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    return (
        <div className="space-y-6">
            <div className="premium-list overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-text-primary/5 border-b border-border/10">
                        <tr>
                            <th className="px-8 py-5 text-[10px] font-body font-medium text-text-tertiary tracking-widest">Organization</th>
                            <th className="px-8 py-5 text-[10px] font-body font-medium text-text-tertiary tracking-widest">Properties</th>
                            <th className="px-8 py-5 text-[10px] font-body font-medium text-text-tertiary tracking-widest">Usage</th>
                            <th className="px-8 py-5 text-[10px] font-body font-medium text-text-tertiary tracking-widest">Status</th>
                            <th className="px-8 py-5 text-[10px] font-body font-medium text-text-tertiary tracking-widest">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/10">
                        {organizations.map((org) => {
                            // Correct deduplicated count of users in this organization
                            const orgMemberIds = new Set([
                                ...(users.filter(u => Array.isArray(u.organization_memberships) && u.organization_memberships.some(m => m.organization_id === org.id)).map(u => u.id)),
                                ...(users.filter(u => Array.isArray(u.property_memberships) && u.property_memberships.some(pm => pm.organization_id === org.id)).map(u => u.id))
                            ]);

                            const propertiesCount = org.properties?.[0]?.count || 0;

                            return (
                                <tr
                                    key={org.id}
                                    className="group hover:bg-slate-50/50 transition-colors cursor-pointer"
                                    onClick={() => onDrillDown?.(org)}
                                >
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xs font-bold border border-primary/20">
                                                {org.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-text-primary text-sm leading-none mb-1">{org.name}</p>
                                                <p className="text-xs text-text-tertiary font-medium">/{org.code}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="text-sm font-black text-slate-700">{propertiesCount} Entities</span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-bold text-slate-600">{orgMemberIds.size} Users</span>
                                            <div className="w-20 h-1 bg-slate-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-slate-400 rounded-full" style={{ width: orgMemberIds.size > 0 ? '70%' : '0%' }} />
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        {org.is_deleted ? (
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-rose-100 animate-pulse">
                                                Cooling Down
                                            </div>
                                        ) : (
                                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-100">
                                                Active
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-8 py-6" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center gap-2">
                                            <button className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-lg transition-all border border-transparent hover:border-slate-100">
                                                <ExternalLink className="w-4 h-4" />
                                            </button>
                                            {org.is_deleted ? (
                                                <button
                                                    onClick={() => onRestore(org.id)}
                                                    className="p-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-all border border-indigo-100"
                                                >
                                                    <RefreshCcw className="w-4 h-4" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => setDeleteConfirmId(org.id)}
                                                    className="p-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Delete Confirmation Modal */}
            <AnimatePresence>
                {deleteConfirmId && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    >
                        <motion.div
                            initial={{ scale: 0.95 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.95 }}
                            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl"
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-rose-100 rounded-2xl flex items-center justify-center">
                                    <AlertTriangle className="w-6 h-6 text-rose-600" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Soft Delete Organization</h3>
                                    <p className="text-sm text-slate-500">This action has a 24-hour cooling period.</p>
                                </div>
                            </div>
                            <p className="text-slate-600 mb-8">
                                The organization will be marked for deletion. You can restore it within 24 hours using the secret key that was generated during creation.
                            </p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="flex-1 py-3 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        onSoftDelete(deleteConfirmId);
                                        setDeleteConfirmId(null);
                                    }}
                                    className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 transition-colors"
                                >
                                    Confirm Delete
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// Sub-component: User Directory with Role Management
const UserDirectory = ({ users, organizations, onUpdateRole, onToggleStatus, onDeleteUser, onAddUser }: {
    users: SystemUser[];
    organizations: Organization[];
    onUpdateRole: (userId: string, role: string, orgId: string) => void;
    onToggleStatus: (userId: string, orgId: string, current: boolean) => void;
    onDeleteUser: (userId: string) => void;
    onAddUser: () => void;
}) => {
    const roleOptions = ['master_admin', 'org_super_admin', 'property_admin', 'staff', 'tenant'];
    const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>('all');

    const filteredUsers = selectedOrgFilter === 'all'
        ? users
        : users.filter(u =>
            (Array.isArray(u.organization_memberships) && u.organization_memberships.some(m => m.organization_id === selectedOrgFilter)) ||
            (Array.isArray(u.property_memberships) && u.property_memberships.some(m => m.organization_id === selectedOrgFilter))
        );

    return (
        <div className="premium-list p-8">
            <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                    <h3 className="text-xl font-display font-semibold text-text-primary">System Users ({filteredUsers.length})</h3>
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                        <select
                            value={selectedOrgFilter}
                            onChange={(e) => setSelectedOrgFilter(e.target.value)}
                            className="pl-10 pr-8 py-2 bg-text-primary/5 border border-border/10 rounded-xl text-xs font-body font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 appearance-none cursor-pointer text-text-secondary"
                        >
                            <option value="all">All Organizations</option>
                            {organizations.map(org => (
                                <option key={org.id} value={org.id}>{org.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={onAddUser}
                        className="px-5 py-2.5 bg-success text-text-inverse font-body font-semibold text-xs rounded-xl tracking-widest flex items-center gap-2 hover:opacity-90 transition-smooth"
                    >
                        <Plus className="w-4 h-4" /> ADD USER
                    </button>
                    <button className="px-5 py-2.5 bg-text-primary text-text-inverse font-body font-semibold text-xs rounded-xl tracking-widest flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-smooth">
                        <Users className="w-4 h-4" /> EXPORT AUDIT LOG
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {filteredUsers.length === 0 ? (
                    <div className="text-center py-12 text-text-tertiary italic font-body">No users found for this selection.</div>
                ) : (
                    filteredUsers.map((user) => {
                        const isMasterAdmin = user.is_master_admin === true;

                        // Collect all memberships to display
                        // We want to show specific org memberships if filtered, or ALL memberships if 'all' is selected
                        const orgMemberships = Array.isArray(user.organization_memberships)
                            ? user.organization_memberships.filter(m => selectedOrgFilter === 'all' || m.organization_id === selectedOrgFilter)
                            : [];

                        const propMemberships = Array.isArray(user.property_memberships) ? user.property_memberships : [];

                        const hasMemberships = orgMemberships.length > 0 || propMemberships.length > 0;

                        return (
                            <div key={user.id} className="flex items-center justify-between p-6 border border-border/10 rounded-3xl hover:border-border/20 transition-smooth group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                        <Users className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h4 className="font-display font-semibold text-text-primary flex items-center gap-2">
                                            {user.full_name || 'Unknown User'}
                                            {user.is_master_admin && (
                                                <span className="text-[9px] bg-text-primary text-text-inverse font-body font-semibold px-1.5 py-0.5 rounded-md tracking-widest border border-text-primary flex items-center gap-1">
                                                    <ShieldCheck className="w-3 h-3" /> MASTER
                                                </span>
                                            )}
                                        </h4>
                                        <p className="text-xs font-body font-medium text-text-tertiary">{user.email}</p>

                                        {/* Context Badges (Where do they belong?) */}
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {isMasterAdmin && (
                                                <span className="text-xs text-indigo-600 font-bold italic">
                                                    Platform-level access
                                                </span>
                                            )}

                                            {!isMasterAdmin && !hasMemberships && (
                                                <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-100">
                                                    Unassigned
                                                </span>
                                            )}

                                            {orgMemberships.map((m, idx) => {
                                                const orgName = organizations.find(o => o.id === m.organization_id)?.name || 'Unknown Org';
                                                return (
                                                    <span key={`org-${idx}`} className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 flex items-center gap-1">
                                                        <Building2 className="w-3 h-3" /> {orgName}
                                                    </span>
                                                );
                                            })}

                                            {propMemberships.map((m, idx) => (
                                                <span key={`prop-${idx}`} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 flex items-center gap-1">
                                                    <Building2 className="w-3 h-3" /> {m.property?.name || 'Unknown Property'}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Roles Column */}
                                <div className="flex items-center gap-8">
                                    <div className="flex flex-col items-end gap-1">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Assigned Roles</span>

                                        {isMasterAdmin && (
                                            <span className="text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded uppercase font-black">
                                                MASTER ADMIN
                                            </span>
                                        )}

                                        {orgMemberships.map((m, idx) => (
                                            <div key={`org-role-${idx}`} className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-400 font-medium">Org:</span>
                                                <select
                                                    value={m.role}
                                                    onChange={(e) => onUpdateRole(user.id, e.target.value, m.organization_id)}
                                                    className="text-sm font-bold text-emerald-700 bg-transparent cursor-pointer border-b border-dotted border-emerald-300 focus:outline-none"
                                                >
                                                    {roleOptions.map(role => (
                                                        <option key={role} value={role}>{role.replace('_', ' ').toUpperCase()}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        ))}

                                        {propMemberships.map((m, idx) => (
                                            <div key={`prop-role-${idx}`} className="flex items-center gap-2">
                                                <span className="text-[10px] text-slate-400 font-medium">Prop:</span>
                                                <span className="text-sm font-bold text-blue-700 border-b border-dotted border-blue-300">
                                                    {m.role?.replace('_', ' ').toUpperCase()}
                                                </span>
                                            </div>
                                        ))}

                                        {!isMasterAdmin && !hasMemberships && (
                                            <span className="text-xs text-slate-300 italic">No Role</span>
                                        )}
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {/* Status Toggles Logic - complex for multiple roles, maybe just show delete for now */}
                                        <button
                                            onClick={() => onDeleteUser(user.id)}
                                            className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                                            title="Delete User"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

// Sub-component: Module Configuration
const ModuleConfig = ({ organizations, onUpdateModules }: {
    organizations: Organization[];
    onUpdateModules: (orgId: string, modules: string[]) => void;
}) => {
    const modulesList = [
        { id: 'ticketing', name: 'Ticketing & SLA', desc: 'Manage maintenance requests with SLAs.' },
        { id: 'viewer', name: '2.5D Building Viewer', desc: 'Interactive floor-wise visual maps.' },
        { id: 'analytics', name: 'Performance Analytics', desc: 'Deep insights into operational health.' },
        { id: 'procurement', name: 'Inventory Control', desc: 'Stock and vendor management.' },
        { id: 'visitors', name: 'Visitor Management', desc: 'Gate pass and visitor tracking.' },
    ];

    const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
    const [activeModules, setActiveModules] = useState<string[]>([]);

    useEffect(() => {
        if (selectedOrg) {
            const org = organizations.find(o => o.id === selectedOrg);
            setActiveModules(org?.available_modules || []);
        }
    }, [selectedOrg, organizations]);

    const toggleModule = (moduleId: string) => {
        setActiveModules(prev => {
            if (prev.includes(moduleId)) {
                return prev.filter(m => m !== moduleId);
            }
            return [...prev, moduleId];
        });
    };

    const handleSave = () => {
        if (selectedOrg) {
            onUpdateModules(selectedOrg, activeModules);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 bg-white border border-slate-100 rounded-[32px] p-8 h-fit">
                <h3 className="text-lg font-black text-slate-900 mb-6">Select Organization</h3>
                <div className="space-y-2">
                    {organizations.map((org) => (
                        <button
                            key={org.id}
                            onClick={() => setSelectedOrg(org.id)}
                            className={`w-full text-left p-4 rounded-2xl border transition-all ${selectedOrg === org.id
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-50 bg-slate-50 text-slate-400 hover:border-slate-200'
                                }`}
                        >
                            <p className="text-sm font-black">{org.name}</p>
                            <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedOrg === org.id ? 'text-white/40' : 'text-slate-300'}`}>
                                {org.available_modules?.length || 0} Active Modules
                            </p>
                        </button>
                    ))}
                </div>
            </div>

            <div className="lg:col-span-2 space-y-6">
                {!selectedOrg ? (
                    <div className="h-96 border-2 border-dashed border-slate-100 rounded-[32px] flex items-center justify-center text-slate-300 font-bold italic">
                        Choose an organization on the left to configure modules.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <header className="flex justify-between items-center mb-8 bg-slate-50 p-6 rounded-[24px]">
                            <div>
                                <h4 className="text-lg font-black text-slate-800">Capability Matrix</h4>
                                <p className="text-xs text-slate-400 font-medium italic">Customizing licensing for {organizations.find((o) => o.id === selectedOrg)?.name}</p>
                            </div>
                            <button
                                onClick={handleSave}
                                className="px-6 py-3 bg-emerald-500 text-white font-black text-xs rounded-xl uppercase tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-600 transition-all"
                            >
                                Save Configuration
                            </button>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {modulesList.map((mod) => (
                                <div key={mod.id} className="bg-white border border-slate-100 p-6 rounded-[28px] flex flex-col justify-between hover:shadow-lg transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${activeModules.includes(mod.id) ? 'bg-emerald-100' : 'bg-slate-50'}`}>
                                            <CheckCircle2 className={`w-5 h-5 ${activeModules.includes(mod.id) ? 'text-emerald-600' : 'text-slate-400'}`} />
                                        </div>
                                        <button
                                            onClick={() => toggleModule(mod.id)}
                                            className={`relative inline-flex items-center h-6 w-11 rounded-full transition-colors ${activeModules.includes(mod.id) ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                        >
                                            <span className={`inline-block w-5 h-5 transform bg-white rounded-full transition-transform shadow ${activeModules.includes(mod.id) ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                        </button>
                                    </div>
                                    <div>
                                        <p className="font-black text-slate-900 mb-1">{mod.name}</p>
                                        <p className="text-[11px] text-slate-400 font-medium leading-relaxed">{mod.desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// Sub-component: Create Organization Modal
const CreateOrgModal = ({ onClose, onCreated, showToast }: { onClose: () => void; onCreated: () => void; showToast: (msg: string, type: 'success' | 'error') => void }) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [createdSecret, setCreatedSecret] = useState<string | null>(null);
    const [showSecret, setShowSecret] = useState(false);

    const handleCreate = async () => {
        if (!name || !code) return;

        setIsCreating(true);

        try {
            // Use API route that bypasses RLS with admin client
            const response = await fetch('/api/organizations/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    name,
                    code: code.toLowerCase().replace(/\s+/g, '-'),
                    available_modules: ['ticketing', 'viewer', 'analytics']
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create organization');
            }

            setCreatedSecret(data.deletion_secret);
            showToast(`Organization "${name}" created.`, 'success');
        } catch (error: any) {
            showToast(error.message || 'Failed to create organization', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleCopySecret = () => {
        if (createdSecret) {
            navigator.clipboard.writeText(createdSecret);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[9998] p-4"
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-white/20"
            >
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 mb-1">Create Organization</h3>
                        <p className="text-sm text-slate-500">Set up a new organization entity.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>

                {!createdSecret ? (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Organization Name*</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    setCode(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                                }}
                                placeholder="e.g. Acme Corporation"
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700">Organization Code*</label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value)}
                                placeholder="e.g. acme-corp"
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100"
                            />
                            <p className="text-xs text-slate-400">Will be used in URLs: /acme-corp/dashboard</p>
                        </div>

                        <button
                            onClick={handleCreate}
                            disabled={isCreating || !name || !code}
                            className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isCreating ? 'Creating...' : 'Create Organization'}
                        </button>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center">
                            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-4" />
                            <h4 className="text-lg font-black text-slate-900 mb-2">Organization Created!</h4>
                            <p className="text-sm text-slate-600">Save this deletion secret key. You'll need it to restore the organization if soft-deleted.</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <Key className="w-4 h-4" /> Deletion Secret Key
                            </label>
                            <div className="flex items-center gap-2">
                                <div className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm">
                                    {showSecret ? createdSecret : '••••••••••••••••••••••'}
                                </div>
                                <button
                                    onClick={() => setShowSecret(!showSecret)}
                                    className="p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                                >
                                    {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                                <button
                                    onClick={handleCopySecret}
                                    className="p-3 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                                >
                                    <Copy className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                onCreated();
                                onClose();
                            }}
                            className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};

// Sub-component: System Settings
const SystemSettings = ({ onRestore }: { onRestore: (secret: string) => Promise<void> }) => {
    const [secret, setSecret] = useState('');
    const [isRestoring, setIsRestoring] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    const handleRestore = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsRestoring(true);
        setMessage(null);
        try {
            await onRestore(secret);
            setMessage({ type: 'success', text: 'Organization successfully restored!' });
            setSecret('');
        } catch (err: any) {
            setMessage({ type: 'error', text: err.message || 'Restoration failed.' });
        } finally {
            setIsRestoring(false);
        }
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-6">
                <div className="bg-white border border-slate-100 p-8 rounded-[40px] shadow-sm">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                            <RefreshCcw className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-slate-900">Organization Recovery</h3>
                            <p className="text-sm text-slate-500 font-medium">Restore soft-deleted entities using their secret key.</p>
                        </div>
                    </div>

                    <form onSubmit={handleRestore} className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest pl-1">Secret Key</label>
                            <div className="relative">
                                <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="password"
                                    value={secret}
                                    onChange={(e) => setSecret(e.target.value)}
                                    placeholder="Enter sk_..."
                                    className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-slate-100 font-mono text-sm"
                                    required
                                />
                            </div>
                        </div>

                        {message && (
                            <div className={`p-4 rounded-xl text-sm font-bold flex items-center gap-2 ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                {message.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                {message.text}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isRestoring || !secret}
                            className="w-full py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {isRestoring ? 'Verifying...' : 'Restore Organization'}
                            {!isRestoring && <RefreshCcw className="w-4 h-4" />}
                        </button>
                    </form>
                </div>

                <div className="bg-white border border-slate-100 p-8 rounded-[40px] shadow-sm">
                    <h3 className="text-xl font-black text-slate-900 mb-6">Backup & Maintenance</h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                            <div>
                                <p className="text-sm font-bold text-slate-800">Maintenance Mode</p>
                                <p className="text-[10px] text-slate-400 font-medium">Prevents new logins while active.</p>
                            </div>
                            <div className="w-12 h-6 bg-slate-200 rounded-full relative cursor-not-allowed">
                                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                            </div>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl opacity-50">
                            <div>
                                <p className="text-sm font-bold text-slate-800">Database Snapshot</p>
                                <p className="text-[10px] text-slate-400 font-medium">Last: 4 hours ago</p>
                            </div>
                            <button className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest text-slate-400">Trigger</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-slate-900 p-8 rounded-[40px] text-white overflow-hidden relative">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                    <h3 className="text-xl font-black mb-6 flex items-center gap-2">
                        <Globe className="w-5 h-5 text-indigo-400" />
                        Global API Configuration
                    </h3>
                    <div className="space-y-4">
                        {[
                            { label: 'Supabase Instance', value: 'production-main', status: 'Healthy' },
                            { label: 'OAuth Flow', value: 'enabled', status: 'Healthy' },
                            { label: 'Edge Runtime', value: 'v4.2.1', status: 'Optimal' }
                        ].map((item, i) => (
                            <div key={i} className="flex justify-between items-center py-3 border-b border-white/10 last:border-0">
                                <div>
                                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">{item.label}</p>
                                    <p className="text-sm font-bold">{item.value}</p>
                                </div>
                                <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 rounded-lg border border-white/10">
                                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                    <span className="text-[10px] font-black text-white/60 uppercase">{item.status}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-orange-50 border border-orange-100 p-8 rounded-[40px]">
                    <h3 className="text-xl font-black text-orange-900 mb-2 italic">Developer Portal</h3>
                    <p className="text-xs text-orange-700 font-medium mb-6">Access system logs, sandbox environments, and API documentation.</p>
                    <button className="w-full py-4 bg-orange-600 text-white font-bold rounded-2xl hover:bg-orange-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-orange-200">
                        Launch Console
                        <ExternalLink className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
};

// Sub-component: Create User Modal
const CreateUserModal = ({ onClose, onCreated, organizations, showToast }: {
    onClose: () => void;
    onCreated: () => void;
    organizations: Organization[];
    showToast: (msg: string, type: 'success' | 'error') => void;
}) => {
    const [email, setEmail] = useState('');
    const [fullName, setFullName] = useState('');
    const [manualPassword, setManualPassword] = useState(''); // New State
    const [selectedOrgId, setSelectedOrgId] = useState(organizations[0]?.id || '');
    const [role, setRole] = useState('staff');
    const [isCreating, setIsCreating] = useState(false);
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

    const handleCreate = async () => {
        const isMasterAdmin = role === 'master_admin';
        if (!email || !fullName || (!isMasterAdmin && !selectedOrgId)) return;

        setIsCreating(true);

        try {
            const response = await fetch('/api/users/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password: manualPassword || undefined, // Send if present
                    full_name: fullName,
                    organization_id: isMasterAdmin ? undefined : selectedOrgId,
                    role: isMasterAdmin ? 'staff' : role,
                    create_master_admin: isMasterAdmin
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create user');
            }

            if (data.temp_password) {
                // Auto-generated case
                setGeneratedPassword(data.temp_password);
                showToast(`User created with auto-generated password.`, 'success');
            } else {
                // Manual password case (API doesn't return it back)
                // We show what the admin typed just for confirmation, or just a success message.
                // Let's reuse the success view but with the manual password.
                setGeneratedPassword(manualPassword);
                showToast(`User created with manual password.`, 'success');
            }

        } catch (error: any) {
            showToast(error.message || 'Failed to create user', 'error');
        } finally {
            setIsCreating(false);
        }
    };

    const handleCopyPassword = () => {
        if (generatedPassword) {
            navigator.clipboard.writeText(generatedPassword);
            showToast('Password copied to clipboard', 'success');
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[9998] p-4"
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-white/90 backdrop-blur-xl rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-white/20"
            >
                {generatedPassword ? (
                    <div className="space-y-6 text-center">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 mb-2">User Created!</h3>
                            <p className="text-sm text-slate-500">
                                Share these credentials with the user securely. <br />
                                <span className="text-rose-500 font-bold">This password will not be shown again.</span>
                            </p>
                        </div>

                        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-left space-y-4">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Email</p>
                                <p className="font-bold text-slate-900">{email}</p>
                            </div>
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Password</p>
                                <div className="flex items-center gap-2">
                                    <code className="bg-white px-3 py-2 rounded-lg border border-slate-200 font-mono text-lg font-bold text-slate-800 flex-1">
                                        {generatedPassword}
                                    </code>
                                    <button
                                        onClick={handleCopyPassword}
                                        className="p-3 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                                        title="Copy Password"
                                    >
                                        <Copy className="w-5 h-5 text-slate-600" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={() => {
                                onCreated();
                                onClose();
                            }}
                            className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors"
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 mb-1">Add New User</h3>
                                <p className="text-sm text-slate-500">Create a new user and assign roles.</p>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                                <X className="w-5 h-5 text-slate-400" />
                            </button>
                        </div>

                        {/* Form */}
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Full Name</label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="John Doe"
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Email Address</label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="john@example.com"
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Password <span className="text-slate-400 font-medium text-xs">(Optional)</span></label>
                                    <input
                                        type="text"
                                        value={manualPassword}
                                        onChange={(e) => setManualPassword(e.target.value)}
                                        placeholder="Auto-generate"
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700">Role</label>
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value)}
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100 bg-white"
                                >
                                    <option value="tenant">Client</option>
                                    <option value="staff">Staff</option>
                                    <option value="property_admin">Property Admin</option>
                                    <option value="org_super_admin">Org Super Admin</option>
                                    <option value="master_admin">Master Admin (Platform)</option>
                                </select>
                            </div>

                            {role !== 'master_admin' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">Organization</label>
                                    <select
                                        value={selectedOrgId}
                                        onChange={(e) => setSelectedOrgId(e.target.value)}
                                        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100 bg-white"
                                    >
                                        {organizations.map(org => (
                                            <option key={org.id} value={org.id}>{org.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <button
                                onClick={handleCreate}
                                disabled={isCreating || !email || !fullName || (role !== 'master_admin' && !selectedOrgId)}
                                className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                            >
                                {isCreating ? 'Creating...' : 'Create User'}
                            </button>
                        </div>
                    </>
                )}
            </motion.div>
        </motion.div>
    );
};

// Sub-component: Master Visitors Tab with Modal
const MasterVisitorsTab = () => {
    const [visitors, setVisitors] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVisitor, setSelectedVisitor] = useState<any | null>(null);
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
    const supabase = createClient();

    useEffect(() => {
        fetchVisitors();
    }, [dateFilter]);

    const fetchVisitors = async () => {
        setIsLoading(true);
        try {
            let query = supabase
                .from('visitor_logs')
                .select('*, properties(name)')
                .order('checkin_time', { ascending: false })
                .limit(100);

            // Apply date filter
            if (dateFilter !== 'all') {
                const now = new Date();
                let startDate: Date;

                if (dateFilter === 'today') {
                    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                } else if (dateFilter === 'week') {
                    startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                } else if (dateFilter === 'month') {
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                } else {
                    startDate = new Date(0);
                }

                query = query.gte('checkin_time', startDate.toISOString());
            }

            const { data, error } = await query;
            if (error) throw error;
            setVisitors(data || []);
        } catch (err) {
            console.error('Error fetching visitors:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredVisitors = visitors.filter(v =>
        v.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.visitor_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.mobile && v.mobile.includes(searchTerm))
    );

    const getDuration = (checkin: string, checkout: string | null) => {
        const start = new Date(checkin);
        const end = checkout ? new Date(checkout) : new Date();
        const diffMs = end.getTime() - start.getTime();
        const hours = Math.floor(diffMs / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    };

    const handleExport = () => {
        const headers = ['Visitor ID', 'Property', 'Name', 'Mobile', 'Category', 'Host', 'Check In', 'Status'];
        const rows = filteredVisitors.map(v => [
            v.visitor_id,
            v.properties?.name || 'Unknown',
            v.name,
            v.mobile || '-',
            v.category,
            v.whom_to_meet,
            new Date(v.checkin_time).toLocaleString(),
            v.status
        ]);

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csvContent));
        link.setAttribute("download", "master_visitor_logs.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-black text-slate-900 leading-tight">Visitor Management</h2>
                    <p className="text-slate-500 text-sm font-medium">Cross-organization visitor tracking.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search visitors..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-64 pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-slate-100"
                        />
                    </div>
                    <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value as any)}
                        className="p-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-100"
                    >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                    </select>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 p-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-colors font-bold text-sm"
                    >
                        <FileDown className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Visitor Info</th>
                                <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Property</th>
                                <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Host / Purpose</th>
                                <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Timing</th>
                                <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {isLoading ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400">Loading visitors...</td></tr>
                            ) : filteredVisitors.length === 0 ? (
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400">No visitors found.</td></tr>
                            ) : (
                                filteredVisitors.map((visitor) => (
                                    <tr
                                        key={visitor.id}
                                        className="hover:bg-slate-50/50 transition-colors cursor-pointer"
                                        onClick={() => setSelectedVisitor(visitor)}
                                    >
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                {visitor.photo_url ? (
                                                    <img
                                                        src={visitor.photo_url}
                                                        alt={visitor.name}
                                                        className="w-10 h-10 rounded-full object-cover border-2 border-slate-100"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold">
                                                        {visitor.name?.[0]}
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="font-bold text-slate-900 text-sm hover:text-indigo-600 transition-colors">{visitor.name}</div>
                                                    <div className="text-xs text-slate-500 font-medium">{visitor.mobile || 'No mobile'}</div>
                                                    <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{visitor.visitor_id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                                                <span className="text-sm font-bold text-slate-700">{visitor.properties?.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="text-sm font-bold text-slate-900">{visitor.whom_to_meet}</div>
                                            <div className="text-xs text-slate-500 capitalize">{visitor.category}</div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="text-xs font-bold text-slate-900">
                                                In: {new Date(visitor.checkin_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                            {visitor.checkout_time && (
                                                <div className="text-xs text-slate-500 mt-1">
                                                    Out: {new Date(visitor.checkout_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${visitor.status === 'checked_in'
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {visitor.status === 'checked_in' ? 'On Premise' : 'Checked Out'}
                                            </span>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Visitor Info Modal */}
            <AnimatePresence>
                {selectedVisitor && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
                        onClick={() => setSelectedVisitor(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0.9 }}
                            className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Header with Photo */}
                            <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 text-white relative">
                                <button
                                    onClick={() => setSelectedVisitor(null)}
                                    className="absolute top-4 right-4 p-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                                <div className="flex items-center gap-4">
                                    {selectedVisitor.photo_url ? (
                                        <img
                                            src={selectedVisitor.photo_url}
                                            alt={selectedVisitor.name}
                                            className="w-20 h-20 rounded-2xl object-cover border-4 border-white/30"
                                        />
                                    ) : (
                                        <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center">
                                            <UserCircle className="w-10 h-10" />
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="text-2xl font-black">{selectedVisitor.name}</h3>
                                        <p className="text-white/70 font-mono text-sm">{selectedVisitor.visitor_id}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Details */}
                            <div className="p-6 space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</p>
                                        <p className="text-slate-900 font-medium capitalize">{selectedVisitor.category}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Mobile</p>
                                        <p className="text-slate-900 font-medium">{selectedVisitor.mobile || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Coming From</p>
                                        <p className="text-slate-900 font-medium">{selectedVisitor.coming_from || '-'}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Whom to Meet</p>
                                        <p className="text-slate-900 font-medium">{selectedVisitor.whom_to_meet}</p>
                                    </div>
                                </div>

                                <div className="border-t border-slate-100 pt-4">
                                    <div className="flex justify-between items-center mb-2">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Check-in</p>
                                            <p className="text-slate-900 font-medium">
                                                {new Date(selectedVisitor.checkin_time).toLocaleString('en-IN', {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Duration</p>
                                            <p className="text-slate-900 font-bold">
                                                {getDuration(selectedVisitor.checkin_time, selectedVisitor.checkout_time)}
                                            </p>
                                        </div>
                                    </div>
                                    {selectedVisitor.checkout_time && (
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Check-out</p>
                                            <p className="text-slate-900 font-medium">
                                                {new Date(selectedVisitor.checkout_time).toLocaleString('en-IN', {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                    year: 'numeric',
                                                    hour: '2-digit',
                                                    minute: '2-digit'
                                                })}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ── SuperTenantManagerTab ─────────────────────────────────────────────────────

interface SuperTenantManagerTabProps {
    users: SystemUser[];
    organizations: Organization[];
    showToast: (msg: string, type?: 'success' | 'error') => void;
}

const SuperTenantManagerTab = ({ users, organizations, showToast }: SuperTenantManagerTabProps) => {
    const supabase = createClient();
    const [superTenants, setSuperTenants] = useState<any[]>([]);
    const [allProperties, setAllProperties] = useState<{ id: string; name: string; code: string; organization_id: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);

    // Create modal state
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        fetchSuperTenants();
        fetchAllProperties();
    }, []);

    const fetchSuperTenants = async () => {
        setIsLoading(true);
        try {
            // Find users with super_tenant org membership
            const { data, error } = await supabase
                .from('organization_memberships')
                .select('user_id, organization_id, users(id, full_name, email)')
                .eq('role', 'super_tenant')
                .eq('is_active', true);

            if (error) throw error;

            // For each super tenant, fetch their assigned properties
            const enriched = await Promise.all(
                (data || []).map(async (row: any) => {
                    const { data: props } = await supabase
                        .from('super_tenant_properties')
                        .select('property_id, properties(name, code)')
                        .eq('user_id', row.user_id);
                    return { ...row, assignedProperties: props || [] };
                })
            );
            setSuperTenants(enriched);
        } catch (err) {
            console.error('Error fetching super tenants:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAllProperties = async () => {
        const { data } = await supabase
            .from('properties')
            .select('id, name, code, organization_id')
            .order('name');
        setAllProperties(data || []);
    };

    const orgProperties = allProperties.filter(p => p.organization_id === selectedOrgId);

    const handleAssign = async () => {
        if (!selectedUserId || !selectedOrgId || selectedPropertyIds.length === 0) {
            showToast('Please select a user, organization, and at least one property.', 'error');
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch('/api/super-tenant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: selectedUserId,
                    organization_id: selectedOrgId,
                    property_ids: selectedPropertyIds,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to assign');
            showToast(`Super Tenant assigned successfully.`);
            setShowCreateModal(false);
            setSelectedUserId('');
            setSelectedOrgId('');
            setSelectedPropertyIds([]);
            fetchSuperTenants();
        } catch (err: any) {
            showToast(err.message || 'Assignment failed', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemoveProperty = async (userId: string, propertyId: string) => {
        if (!confirm('Remove this property from the super tenant?')) return;
        const res = await fetch('/api/super-tenant', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, property_id: propertyId }),
        });
        if (res.ok) {
            showToast('Property removed.');
            fetchSuperTenants();
        } else {
            showToast('Failed to remove property', 'error');
        }
    };

    const togglePropertyId = (id: string) => {
        setSelectedPropertyIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    // ── KPI Computations ──────────────────────────────────────────────────────
    const totalSuperTenants = superTenants.length;
    const totalPropertiesAssigned = superTenants.reduce((sum, st) => sum + st.assignedProperties.length, 0);
    const activeOrgs = new Set(superTenants.map(st => st.organization_id)).size;
    const unassignedCount = superTenants.filter(st => st.assignedProperties.length === 0).length;
    const fullyAssignedCount = totalSuperTenants - unassignedCount;
    const assignedPct = totalSuperTenants > 0 ? Math.round((fullyAssignedCount / totalSuperTenants) * 100) : 0;
    const avgProperties = totalSuperTenants > 0 ? (totalPropertiesAssigned / totalSuperTenants).toFixed(1) : '0';

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-black text-foreground">Super Tenant Accounts</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Create super tenant accounts and assign them property portfolios for cross-property analytics.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white font-bold text-xs rounded-xl uppercase tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-200"
                >
                    <Plus className="w-4 h-4" /> Assign Super Tenant
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1 — Total Super Tenants */}
                <div className="relative overflow-hidden rounded-2xl bg-white border border-[var(--border)] shadow-[var(--shadow-md)] p-5 flex flex-col gap-3 hover:-translate-y-0.5 transition-transform duration-200">
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold text-[var(--text-tertiary)] tracking-widest uppercase">Total Super Tenants</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(112,143,150,0.12)' }}>
                            <Users className="w-5 h-5" style={{ color: 'var(--primary)' }} />
                        </div>
                    </div>
                    <p className="text-4xl metric-number" style={{ color: 'var(--text-primary)' }}>{totalSuperTenants}</p>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(112,143,150,0.12)', color: 'var(--primary)' }}>
                            {totalSuperTenants > 0 ? 'ACTIVE' : '—'}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">{activeOrgs} org{activeOrgs !== 1 ? 's' : ''} covered</span>
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                            <span>Assigned</span>
                            <span>{assignedPct}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--border)]">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${assignedPct}%`, background: 'var(--primary)' }} />
                        </div>
                    </div>
                </div>

                {/* Card 2 — Properties Assigned */}
                <div className="relative overflow-hidden rounded-2xl bg-white border border-[var(--border)] shadow-[var(--shadow-md)] p-5 flex flex-col gap-3 hover:-translate-y-0.5 transition-transform duration-200">
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold text-[var(--text-tertiary)] tracking-widest uppercase">Properties Assigned</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.1)' }}>
                            <Building2 className="w-5 h-5" style={{ color: 'var(--success)' }} />
                        </div>
                    </div>
                    <p className="text-4xl metric-number" style={{ color: 'var(--text-primary)' }}>{totalPropertiesAssigned}</p>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--success)' }}>
                            {totalPropertiesAssigned > 0 ? 'COVERED' : '—'}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">avg {avgProperties}/tenant</span>
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                            <span>Coverage</span>
                            <span>{totalPropertiesAssigned > 0 ? '100%' : '0%'}</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--border)]">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: totalPropertiesAssigned > 0 ? '100%' : '0%', background: 'var(--success)' }} />
                        </div>
                    </div>
                </div>

                {/* Card 3 — Unassigned (PRIORITY) */}
                <div className="relative overflow-hidden rounded-2xl bg-white border-2 shadow-[var(--shadow-md)] p-5 flex flex-col gap-3 hover:-translate-y-0.5 transition-transform duration-200"
                    style={{ borderColor: unassignedCount > 0 ? 'var(--warning)' : 'var(--border)' }}>
                    {unassignedCount > 0 && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: 'var(--warning)' }} />
                    )}
                    {unassignedCount > 0 && (
                        <span className="absolute top-3 right-3 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--warning)' }}>
                            PRIORITY
                        </span>
                    )}
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold text-[var(--text-tertiary)] tracking-widest uppercase">Unassigned</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)' }}>
                            <AlertTriangle className="w-5 h-5" style={{ color: 'var(--warning)' }} />
                        </div>
                    </div>
                    <p className="text-4xl metric-number" style={{ color: unassignedCount > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{unassignedCount}</p>
                    {unassignedCount > 0 ? (
                        <span className="text-[10px] font-bold tracking-wide" style={{ color: 'var(--warning)' }}>ACTION REQUIRED</span>
                    ) : (
                        <span className="text-[10px] font-bold tracking-wide" style={{ color: 'var(--success)' }}>ALL ASSIGNED</span>
                    )}
                    <div>
                        <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                            <span>No-property tenants</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--border)]">
                            <div className="h-full rounded-full transition-all duration-700"
                                style={{
                                    width: totalSuperTenants > 0 ? `${Math.round((unassignedCount / totalSuperTenants) * 100)}%` : '0%',
                                    background: 'var(--warning)'
                                }} />
                        </div>
                    </div>
                </div>

                {/* Card 4 — Orgs Covered */}
                <div className="relative overflow-hidden rounded-2xl bg-white border border-[var(--border)] shadow-[var(--shadow-md)] p-5 flex flex-col gap-3 hover:-translate-y-0.5 transition-transform duration-200">
                    <div className="flex items-start justify-between">
                        <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-semibold text-[var(--text-tertiary)] tracking-widest uppercase">Orgs Covered</span>
                        </div>
                        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(170,137,95,0.12)' }}>
                            <Globe className="w-5 h-5" style={{ color: 'var(--secondary)' }} />
                        </div>
                    </div>
                    <p className="text-4xl metric-number" style={{ color: 'var(--text-primary)' }}>{activeOrgs}</p>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(170,137,95,0.12)', color: 'var(--secondary)' }}>
                            {activeOrgs > 0 ? 'ACTIVE' : '—'}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">of {organizations.filter(o => !o.is_deleted).length} total</span>
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mb-1">
                            <span>Reach</span>
                            <span>{organizations.filter(o => !o.is_deleted).length > 0 ? Math.round((activeOrgs / organizations.filter(o => !o.is_deleted).length) * 100) : 0}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-[var(--border)]">
                            <div className="h-full rounded-full transition-all duration-700"
                                style={{
                                    width: organizations.filter(o => !o.is_deleted).length > 0 ? `${Math.round((activeOrgs / organizations.filter(o => !o.is_deleted).length) * 100)}%` : '0%',
                                    background: 'var(--secondary)'
                                }} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-violet-50 border border-violet-200 text-violet-700">
                <Key className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs font-semibold leading-relaxed">
                    Super Tenants can view and analyze all tickets across their assigned properties. They cannot create users, modify tickets, or access admin settings. Assign an existing user account or create one first via User Directory.
                </p>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : superTenants.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-border rounded-2xl">
                    <Key className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-sm font-semibold text-muted-foreground">No super tenant accounts yet.</p>
                    <p className="text-xs text-muted-foreground mt-1">Click "Assign Super Tenant" to get started.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {superTenants.map((st, i) => (
                        <div key={i} className="p-5 rounded-2xl border border-border bg-surface-elevated space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-violet-700 font-black text-sm">
                                        {st.users?.full_name?.[0]?.toUpperCase() || 'S'}
                                    </div>
                                    <div>
                                        <p className="font-bold text-foreground text-sm">{st.users?.full_name || '—'}</p>
                                        <p className="text-xs text-muted-foreground">{st.users?.email}</p>
                                    </div>
                                </div>
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-violet-100 text-violet-700 tracking-widest">Super Tenant</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {st.assignedProperties.map((ap: any) => (
                                    <div key={ap.property_id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                                        <Building2 className="w-3 h-3" />
                                        {ap.properties?.name || ap.property_id}
                                        <button
                                            onClick={() => handleRemoveProperty(st.user_id, ap.property_id)}
                                            className="ml-1 text-slate-400 hover:text-red-500 transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                {st.assignedProperties.length === 0 && (
                                    <span className="text-xs text-muted-foreground italic">No properties assigned</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Assign Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setShowCreateModal(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-5"
                        >
                            <div className="flex items-center justify-between">
                                <h3 className="font-black text-slate-900 text-lg">Assign Super Tenant</h3>
                                <button onClick={() => setShowCreateModal(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-500">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* User */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Select User</label>
                                <select
                                    value={selectedUserId}
                                    onChange={e => setSelectedUserId(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
                                >
                                    <option value="">— Choose user —</option>
                                    {users.filter(u => !u.is_master_admin).map(u => (
                                        <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
                                    ))}
                                </select>
                            </div>

                            {/* Organization */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Organization</label>
                                <select
                                    value={selectedOrgId}
                                    onChange={e => { setSelectedOrgId(e.target.value); setSelectedPropertyIds([]); }}
                                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500"
                                >
                                    <option value="">— Choose organization —</option>
                                    {organizations.filter(o => !o.is_deleted).map(o => (
                                        <option key={o.id} value={o.id}>{o.name}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Properties */}
                            {selectedOrgId && (
                                <div className="space-y-2">
                                    <label className="text-xs font-black uppercase tracking-widest text-slate-500">Assign Properties</label>
                                    <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-3">
                                        {orgProperties.length === 0 && (
                                            <p className="text-xs text-slate-400 text-center py-4">No properties in this organization.</p>
                                        )}
                                        {orgProperties.map(prop => (
                                            <label key={prop.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedPropertyIds.includes(prop.id)}
                                                    onChange={() => togglePropertyId(prop.id)}
                                                    className="w-4 h-4 rounded accent-violet-600"
                                                />
                                                <div>
                                                    <p className="text-sm font-bold text-slate-800">{prop.name}</p>
                                                    <p className="text-[10px] font-mono text-slate-400">{prop.code}</p>
                                                </div>
                                            </label>
                                        ))}
                                    </div>
                                    {selectedPropertyIds.length > 0 && (
                                        <p className="text-xs font-semibold text-violet-600">{selectedPropertyIds.length} propert{selectedPropertyIds.length > 1 ? 'ies' : 'y'} selected</p>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={handleAssign}
                                disabled={isSaving || !selectedUserId || !selectedOrgId || selectedPropertyIds.length === 0}
                                className="w-full py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                            >
                                {isSaving ? 'Assigning...' : 'Assign Super Tenant Role & Properties'}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default MasterAdminDashboard;
