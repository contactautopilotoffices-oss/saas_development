'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import {
    LayoutDashboard, Building2, Users, UserPlus, Ticket, Settings, UserCircle,
    Search, Plus, Filter, LogOut, ChevronRight, MapPin, Edit, Trash2, X, Check, UsersRound,
    Coffee, IndianRupee, FileDown, ChevronDown, Fuel, Menu, Upload, FileBarChart, Zap, Package, ClipboardCheck, Scan, Key,
    AlertCircle, CheckCircle2, Clock, GitBranch, DoorOpen, MessageCircle, Send, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';
import { useAuth } from '@/frontend/context/AuthContext';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { HapticCard } from '@/frontend/components/ui/HapticCard';
import UserDirectory from './UserDirectory';
import SignOutModal from '@/frontend/components/ui/SignOutModal';
import AdminSPOCDashboard from '../tickets/AdminSPOCDashboard';
import TicketsView from './TicketsView';
import SettingsView from './SettingsView';
import DieselAnalyticsDashboard from '../diesel/DieselAnalyticsDashboard';
import ElectricityAnalyticsDashboard from '../electricity/ElectricityAnalyticsDashboard';
import InviteMemberModal from './InviteMemberModal';
import NotificationBell from './NotificationBell';
import Image from 'next/image';
import { ImportReportsView } from '@/frontend/components/snags';
import TicketCreateModal from '@/frontend/components/tickets/TicketCreateModal';
import StockReportView from '@/frontend/components/stock/StockReportView';
import StockMovementModal from '@/frontend/components/stock/StockMovementModal';
import SOPDashboard from '@/frontend/components/sop/SOPDashboard';
import PropertyFeaturesModal from './PropertyFeaturesModal';
import EscalationHierarchyBuilder from '@/frontend/components/escalation/EscalationHierarchyBuilder';
import AdminRoomManager from '@/frontend/components/meeting-rooms/AdminRoomManager';

// Types
type Tab = 'overview' | 'properties' | 'requests' | 'reports' | 'visitors' | 'settings' | 'profile' | 'revenue' | 'users' | 'diesel' | 'electricity' | 'stock_reports' | 'checklist' | 'super_tenants' | 'escalation' | 'rooms';

interface Property {
    id: string;
    name: string;
    code: string;
    address: string;
    image_url?: string;
    created_at: string;
}

interface OrgUser {
    user_id: string;
    role?: string; // Org role
    is_active: boolean;
    user: {
        id: string;
        email: string;
        full_name: string;
    };
    propertyMemberships: {
        property_id: string;
        property_name?: string;
        role: string;
    }[];
}

interface Organization {
    id: string;
    name: string;
    code: string;
    logo_url?: string;
}

const OrgAdminDashboard = () => {
    const { user, signOut, membership } = useAuth();
    const params = useParams();
    const router = useRouter();
    const orgSlugOrId = params?.orgId as string;

    // State
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const [org, setOrg] = useState<Organization | null>(null);
    const [properties, setProperties] = useState<Property[]>([]);
    const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreatePropModal, setShowCreatePropModal] = useState(false);
    const [editingProperty, setEditingProperty] = useState<Property | null>(null);
    const [showUserModal, setShowUserModal] = useState(false);
    const [editingUser, setEditingUser] = useState<OrgUser | null>(null);
    const [showAddMemberModal, setShowAddMemberModal] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [showSignOutModal, setShowSignOutModal] = useState(false);
    const [showTicketCreateModal, setShowTicketCreateModal] = useState(false);
    const [selectedPropertyId, setSelectedPropertyId] = useState('all');
    const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
    const [openDropdown, setOpenDropdown] = useState<'prop' | 'checklist' | 'escalation' | 'rooms' | null>(null);
    const [checklistPropertyId, setChecklistPropertyId] = useState<string>('all');
    const [escalationPropertyId, setEscalationPropertyId] = useState<string>('all');
    const [roomsPropertyId, setRoomsPropertyId] = useState<string>('all');
    const [userRole, setUserRole] = useState<string>('User');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [pendingStatusFilter, setPendingStatusFilter] = useState('all');
    const [showRequestsList, setShowRequestsList] = useState(false);
    const [showFeaturesModal, setShowFeaturesModal] = useState(false);
    const [selectedPropertyForFeatures, setSelectedPropertyForFeatures] = useState<Property | null>(null);
    const searchParams = useSearchParams();

    // Restore showRequestsList, filter, and selectedPropertyId from URL on mount/back navigation
    useEffect(() => {
        const view = searchParams.get('view');
        // Default to list view if no view is provided, or if explicitly set to list
        setShowRequestsList(view !== 'board');
        const filter = searchParams.get('filter');
        if (filter) {
            setPendingStatusFilter(filter);
        } else {
            setPendingStatusFilter('all');
        }
        const property = searchParams.get('property');
        setSelectedPropertyId(property || 'all');
    }, [searchParams]);

    // Derived state
    const activeProperty = selectedPropertyId === 'all'
        ? null
        : properties.find(p => p.id === selectedPropertyId);

    const supabase = useMemo(() => createClient(), []);

    // Refs to prevent duplicate fetches
    const hasFetchedOrg = useRef(false);
    const hasFetchedProperties = useRef(false);

    const fetchUserRole = useCallback(async () => {
        if (!org || !user) return;

        const { data } = await supabase
            .from('organization_memberships')
            .select('role')
            .eq('organization_id', org.id)
            .eq('user_id', user.id)
            .single();

        if (data?.role) {
            // Format role for display (e.g., 'org_admin' -> 'Org Admin')
            const formattedRole = data.role.split('_').map((word: string) =>
                word.charAt(0).toUpperCase() + word.slice(1)
            ).join(' ');
            setUserRole(formattedRole);
        }
    }, [org, user, supabase]);

    const fetchOrgDetails = useCallback(async () => {
        setIsLoading(true);
        setErrorMsg('');

        // 1. Decode URL param
        const decoded = decodeURIComponent(orgSlugOrId);

        // 2. Sanitize ID (Remove spaces/newlines that might have crept in)
        // This fixes the issue if the URL somehow looks like "uuid part 1 - uuid part 2"
        const cleanId = decoded.trim().replace(/\s+/g, '');

        console.log(`🔍 [Dashboard] Lookup Org ID: "${cleanId}" (Original: "${decoded}")`);

        // 3. Fetch strict by ID
        const { data, error } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', cleanId)
            .is('deleted_at', null)
            .maybeSingle();

        if (error) {
            console.error('❌ [Dashboard] Supabase Error:', error);
            setErrorMsg(`Access Denied (403) or System Error. ID: ${cleanId}`);
        } else if (!data) {
            console.warn('⚠️ [Dashboard] Organization not found in DB.');
            setErrorMsg(`Organization not found. ID: ${cleanId}`);
        } else {
            console.log('✅ [Dashboard] Organization found:', data.name);
            setOrg(data);
        }
        setIsLoading(false);
    }, [orgSlugOrId, supabase]);

    const fetchProperties = useCallback(async () => {
        if (!org) return;
        const { data: props, error: propError } = await supabase
            .from('properties')
            .select('*')
            .eq('organization_id', org.id)
            .order('created_at', { ascending: false });

        if (propError || !props) return;

        // Fetch ticket_validation feature status for all these properties
        const { data: features, error: featError } = await supabase
            .from('property_features')
            .select('property_id, is_enabled')
            .eq('feature_key', 'ticket_validation')
            .in('property_id', props.map(p => p.id));

        if (!featError && features) {
            const featureMap = new Map(features.map(f => [f.property_id, f.is_enabled]));
            const updatedProps = props.map(p => ({
                ...p,
                validation_enabled: featureMap.has(p.id) ? featureMap.get(p.id) : true
            }));
            setProperties(updatedProps);
        } else {
            setProperties(props);
        }
    }, [org, supabase]);

    useEffect(() => {
        const init = async () => {
            if (orgSlugOrId && !hasFetchedOrg.current) {
                hasFetchedOrg.current = true;
                await fetchOrgDetails();
            }
        };
        init();
    }, [orgSlugOrId, fetchOrgDetails]);

    // Restore tab from URL
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['overview', 'properties', 'requests', 'reports', 'visitors', 'settings', 'profile', 'revenue', 'users', 'diesel', 'electricity', 'stock_reports', 'checklist', 'super_tenants', 'escalation', 'rooms'].includes(tab)) {
            setActiveTab(tab as Tab);
        }
    }, [searchParams]);


    // Fetch properties ONCE when org is loaded (not on every tab change)
    useEffect(() => {
        const init = async () => {
            if (org && !hasFetchedProperties.current) {
                hasFetchedProperties.current = true;
                await Promise.all([fetchProperties(), fetchUserRole()]);
            }
        };
        init();
    }, [org, fetchProperties, fetchUserRole]);


    const fetchOrgUsers = async () => {
        if (!org) return;

        // 🔹 Step 1: Fetch ORG-level users
        const { data: orgUsers, error: orgError } = await supabase
            .from('organization_memberships')
            .select(`
                user_id,
                role,
                is_active,
                user:users (
                    id,
                    full_name,
                    email
                )
            `)
            .eq('organization_id', org.id)
            .eq('is_active', true);

        if (orgError) console.error('Error fetching org users:', orgError);

        // 🔹 Step 2: Fetch PROPERTY-level users for same org
        // 💡 !inner ensures only properties belonging to this org are included
        const { data: propertyUsers, error: propError } = await supabase
            .from('property_memberships')
            .select(`
                user_id,
                role,
                is_active,
                property:properties!inner (
                    id,
                    organization_id,
                    name
                ),
                user:users (
                    id,
                    full_name,
                    email
                )
            `)
            .eq('properties.organization_id', org.id)
            .eq('is_active', true);

        if (propError) console.error('Error fetching property users:', propError);

        // 🔹 Step 3: Merge + deduplicate users (CRITICAL)
        const userMap = new Map<string, OrgUser>();

        // Org users
        orgUsers?.forEach((row: any) => {
            userMap.set(row.user_id, {
                user_id: row.user_id,
                role: row.role,
                is_active: row.is_active,
                user: row.user,
                propertyMemberships: []
            });
        });

        // Property users
        propertyUsers?.forEach((row: any) => {
            const existing = userMap.get(row.user_id);

            if (existing) {
                existing.propertyMemberships.push({
                    property_id: row.property.id,
                    property_name: row.property.name,
                    role: row.role
                });
            } else {
                userMap.set(row.user_id, {
                    user_id: row.user_id,
                    role: undefined, // No org-level role
                    is_active: row.is_active,
                    user: row.user,
                    propertyMemberships: [{
                        property_id: row.property.id,
                        property_name: row.property.name,
                        role: row.role
                    }]
                });
            }
        });

        setOrgUsers(Array.from(userMap.values()));
    };

    const handleCreateProperty = async (propData: any) => {
        if (!org) return;
        const { validation_enabled, ...rest } = propData;
        const { data: newProp, error } = await supabase.from('properties').insert({
            ...rest,
            organization_id: org.id
        }).select().single();

        if (!error && newProp) {
            // Also set initial validation feature
            await supabase.from('property_features').insert({
                property_id: newProp.id,
                feature_key: 'ticket_validation',
                is_enabled: validation_enabled !== false
            });

            fetchProperties();
            setShowCreatePropModal(false);
        } else {
            alert('Failed to create property: ' + (error?.message || 'Unknown error'));
        }
    };

    const handleUpdateProperty = async (id: string, propData: any) => {
        const { validation_enabled, ...rest } = propData;
        const { error: propError } = await supabase
            .from('properties')
            .update(rest)
            .eq('id', id);

        if (!propError) {
            // Also update property_features
            await supabase.from('property_features').upsert({
                property_id: id,
                feature_key: 'ticket_validation',
                is_enabled: validation_enabled !== false
            }, { onConflict: 'property_id,feature_key' });

            fetchProperties();
            setEditingProperty(null);
        } else {
            alert('Update failed: ' + propError.message);
        }
    };

    const handleDeleteProperty = async (id: string) => {
        if (!confirm('Are you sure you want to delete this property? This cannot be undone.')) return;
        const { error } = await supabase
            .from('properties')
            .delete()
            .eq('id', id);

        if (!error) {
            fetchProperties();
        } else {
            alert('Delete failed: ' + error.message);
        }
    };

    const handleUpdateUser = async (userId: string, data: any) => {
        // Update user profile
        const { error: profileError } = await supabase
            .from('users')
            .update({
                full_name: data.full_name,
                phone: data.phone
            })
            .eq('id', userId);

        if (profileError) {
            alert('Failed to update profile: ' + profileError.message);
            return;
        }

        // Update org role if exists
        if (data.orgRole) {
            await supabase
                .from('organization_memberships')
                .update({ role: data.orgRole })
                .eq('user_id', userId)
                .eq('organization_id', org?.id);
        }

        fetchOrgUsers();
        setEditingUser(null);
        setShowUserModal(false);
    };

    const handleDeleteUser = async (userId: string) => {
        if (!confirm('Remove this user from the organization?')) return;

        // Remove from org memberships
        await supabase
            .from('organization_memberships')
            .delete()
            .eq('user_id', userId)
            .eq('organization_id', org?.id);

        // Remove from property memberships
        await supabase
            .from('property_memberships')
            .delete()
            .eq('user_id', userId)
            .eq('organization_id', org?.id);

        fetchOrgUsers();
    };


    // Helper to change selected property with URL persistence
    const handlePropertyChange = (id: string) => {
        setSelectedPropertyId(id);
        const url = new URL(window.location.href);
        if (id !== 'all') {
            url.searchParams.set('property', id);
        } else {
            url.searchParams.delete('property');
        }
        window.history.pushState({}, '', url.toString());
    };

    // Helper to change tab with URL persistence
    const handleTabChange = (tab: Tab, filter: string = 'all') => {
        setActiveTab(tab);
        setPendingStatusFilter(filter);
        setSidebarOpen(false);
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        if (filter !== 'all') {
            url.searchParams.set('filter', filter);
        } else {
            url.searchParams.delete('filter');
        }
        
        if (tab !== 'requests') {
            url.searchParams.delete('view');
        } else {
            url.searchParams.set('view', 'list');
            setShowRequestsList(true);
        }
        
        window.history.pushState({}, '', url.toString());
    };

    if (!org && !isLoading) return (
        <div className="p-10 text-center">
            <h2 className="text-xl font-bold text-red-600">Error Loading Dashboard</h2>
            <p className="text-slate-600 mt-2">{errorMsg || 'Organization not found.'}</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-background flex font-inter text-foreground">
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
                w-72 bg-white border-r border-border flex flex-col inset-y-0 z-50 transition-all duration-300
                fixed left-0
                ${sidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 lg:translate-x-0 lg:opacity-100'}
                overflow-hidden
            `}>
                {/* Mobile Close Button */}
                <button
                    onClick={() => setSidebarOpen(false)}
                    className="absolute top-4 right-4 lg:hidden p-2 rounded-lg hover:bg-surface-elevated transition-colors"
                >
                    <X className="w-5 h-5 text-text-secondary" />
                </button>

                <div className="p-4 lg:p-5 pb-2 flex-shrink-0">
                    <div className="flex flex-col items-center gap-1 mb-3">
                        <img src="/autopilot-logo-new.png" alt="Logo" className="h-10 w-auto object-contain" />
                        <p className="text-[10px] text-text-tertiary font-black uppercase tracking-[0.2em]">Super Admin Console</p>
                    </div>
                </div>

                <nav className="flex-1 px-4 overflow-y-auto min-h-0 custom-scrollbar">
                    {/* Quick Action Row */}
                    <div className="mb-8">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-6 mb-4 flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></span>
                            Quick Actions
                        </p>
                        <div className="px-4 grid grid-cols-3 gap-2">
                            <button
                                onClick={() => setShowTicketCreateModal(true)}
                                className="w-full flex flex-col items-center justify-center gap-1.5 p-2 bg-white text-text-primary rounded-xl hover:bg-muted transition-all border-2 border-primary/20 group shadow-sm"
                            >
                                <div className="w-7 h-7 bg-primary/20 rounded-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <Plus className="w-4 h-4 font-black" />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-tight text-center mt-1">New</span>
                            </button>
                            <button
                                onClick={() => setShowAddMemberModal(true)}
                                className="w-full flex flex-col items-center justify-center gap-1.5 p-2 bg-white text-text-primary rounded-xl hover:bg-muted transition-all border-2 border-emerald-500/20 group shadow-sm"
                            >
                                <div className="w-7 h-7 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                                    <UserPlus className="w-4 h-4 font-black" />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-tight text-center mt-1">Member</span>
                            </button>
                            <button
                                onClick={() => selectedPropertyId !== 'all' && setIsScannerModalOpen(true)}
                                disabled={selectedPropertyId === 'all'}
                                className={`w-full flex flex-col items-center justify-center gap-1.5 p-2 bg-white text-text-primary rounded-xl transition-all border-2 border-primary/20 group shadow-sm ${selectedPropertyId === 'all' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-muted'
                                    }`}
                                title={selectedPropertyId === 'all' ? 'Select a property first' : 'Stock Scanner'}
                            >
                                <div className="w-7 h-7 bg-primary/10 rounded-lg flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                    <Scan className="w-4 h-4 font-black" />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-tight text-center mt-1">Scanner</span>
                            </button>
                        </div>
                    </div>

                    {/* Core Operations */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                            <span className="w-0.5 h-3 bg-primary rounded-full"></span>
                            Core Operations
                        </p>
                        <div className="space-y-1">
                            <button
                                onClick={() => handleTabChange('overview')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'overview'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <LayoutDashboard className="w-4 h-4" />
                                Dashboard
                            </button>
                            <button
                                onClick={() => handleTabChange('requests')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'requests'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Ticket className="w-4 h-4" />
                                Requests
                            </button>
                            <button
                                onClick={() => handleTabChange('reports')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'reports'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <FileBarChart className="w-4 h-4" />
                                Reports
                            </button>
                        </div>
                    </div>

                    {/* Management Hub */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                            <span className="w-0.5 h-3 bg-primary rounded-full"></span>
                            Management Hub
                        </p>
                        <div className="space-y-1">
                            <button
                                onClick={() => handleTabChange('properties')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'properties'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Building2 className="w-4 h-4" />
                                Property Management
                            </button>
                            <button
                                onClick={() => handleTabChange('users')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'users'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Users className="w-4 h-4" />
                                User Management
                            </button>
                            <button
                                onClick={() => handleTabChange('visitors')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'visitors'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <UsersRound className="w-4 h-4" />
                                Visitor Management
                            </button>
                            <button
                                onClick={() => handleTabChange('revenue')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'revenue'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Coffee className="w-4 h-4" />
                                Cafeteria Revenue
                            </button>
                            <button
                                onClick={() => handleTabChange('diesel')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'diesel'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Fuel className="w-4 h-4" />
                                Diesel Analytics
                            </button>
                            <button
                                onClick={() => handleTabChange('electricity')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'electricity'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Zap className="w-4 h-4" />
                                Electricity Analytics
                            </button>
                            <button
                                onClick={() => handleTabChange('stock_reports')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'stock_reports'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Package className="w-4 h-4" />
                                Stock Reports
                            </button>
                            <button
                                onClick={() => handleTabChange('checklist')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'checklist'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <ClipboardCheck className="w-4 h-4" />
                                Checklists
                            </button>
                            <button
                                onClick={() => handleTabChange('escalation')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'escalation'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <GitBranch className="w-4 h-4" />
                                Escalation
                            </button>
                            <button
                                onClick={() => handleTabChange('rooms')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'rooms'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <DoorOpen className="w-4 h-4" />
                                Meeting Rooms
                            </button>
                        </div>
                    </div>

                    {/* System & Personal */}
                    <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-4 mb-3 flex items-center gap-2">
                            <span className="w-0.5 h-3 bg-primary rounded-full"></span>
                            System & Personal
                        </p>
                        <div className="space-y-1">
                            <button
                                onClick={() => handleTabChange('settings')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'settings'
                                    ? 'bg-primary text-text-inverse shadow-sm'
                                    : 'text-text-secondary hover:bg-muted hover:text-text-primary'
                                    }`}
                            >
                                <Settings className="w-4 h-4" />
                                Settings
                            </button>
                            <button
                                onClick={() => handleTabChange('profile')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-bold text-sm ${activeTab === 'profile'
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

                <div className="pt-3 border-t border-border px-4 pb-12 flex-shrink-0 bg-white">
                    {/* User Profile Section */}
                    <div className="flex items-center gap-2 px-1 mb-2">
                        <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-text-inverse font-bold text-xs">
                            {user?.email?.[0].toUpperCase() || 'O'}
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="font-display font-semibold text-xs text-text-primary truncate">
                                {user?.user_metadata?.full_name || 'Super Admin'}
                            </span>
                            <span className="text-[9px] text-text-tertiary truncate font-body font-medium">
                                {user?.email}
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => setShowSignOutModal(true)}
                        className="flex items-center gap-2 px-3 py-2 text-text-tertiary hover:text-red-400 hover:bg-red-500/10 rounded-lg w-full transition-smooth text-xs font-bold group"
                    >
                        <LogOut className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        Sign Out
                    </button>
                </div>
            </aside>

            <SignOutModal
                isOpen={showSignOutModal}
                onClose={() => setShowSignOutModal(false)}
                onConfirm={signOut}
            />

            {/* Main Content */}
            <main className={`flex-1 lg:ml-72 bg-white transition-all duration-300 ${activeTab === 'overview' || activeTab === 'checklist' || activeTab === 'escalation' || activeTab === 'rooms' ? '' : activeTab === 'requests' ? 'pt-16 lg:pt-0 lg:p-12' : 'pt-16 lg:pt-0 p-4 md:p-8 lg:p-12'}`}>

                {/* Only show header for non-overview, non-sop, non-escalation tabs */}
                {activeTab !== 'overview' && activeTab !== 'checklist' && activeTab !== 'escalation' && activeTab !== 'rooms' && (
                    <header className="fixed top-0 left-0 right-0 lg:static h-16 bg-white border-b border-border/10 flex justify-between items-center px-4 md:px-8 lg:px-0 mb-10 z-30">
                        <div className="flex items-center gap-4">
                            {/* Mobile Menu Toggle */}
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="p-2 -ml-2 lg:hidden text-text-tertiary hover:text-text-primary transition-colors"
                            >
                                <Menu className="w-6 h-6" />
                            </button>
                            <div>
                                <h1 className="text-2xl md:text-3xl font-display font-semibold text-text-primary tracking-tight capitalize">{activeTab}</h1>
                                <p className="hidden md:block text-text-tertiary text-xs font-body font-medium mt-1">Manage your organization's resources.</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">

                            {/* Property Selector for Requests/Other tabs */}
                            {properties.length > 0 && (
                                <div className="hidden lg:block relative">
                                    <button
                                        onClick={() => setOpenDropdown(openDropdown === 'prop' ? null : 'prop')}
                                        className="flex items-center gap-3 bg-surface-elevated border border-border rounded-xl px-4 py-2.5 hover:border-primary transition-all group min-w-[200px]"
                                    >
                                        <div className="w-6 h-6 rounded-lg bg-background flex items-center justify-center overflow-hidden">
                                            {activeProperty && activeProperty.image_url ? (
                                                <img src={activeProperty.image_url} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <Building2 className="w-3.5 h-3.5 text-text-tertiary" />
                                            )}
                                        </div>
                                        <span className="text-sm font-body font-medium text-text-primary flex-1 text-left">
                                            {selectedPropertyId === 'all' ? 'All Properties' : activeProperty?.name}
                                        </span>
                                        <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${openDropdown === 'prop' ? 'rotate-180' : ''}`} />
                                    </button>

                                    <AnimatePresence>
                                        {openDropdown === 'prop' && (
                                            <>
                                                <div
                                                    className="fixed inset-0 z-[60]"
                                                    onClick={() => setOpenDropdown(null)}
                                                />
                                                <motion.div
                                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                    className="absolute right-0 mt-2 w-72 bg-surface-elevated rounded-2xl shadow-2xl border border-border z-[70] overflow-hidden"
                                                >
                                                    <div className="p-2 border-b border-border">
                                                        <button
                                                            onClick={() => { handlePropertyChange('all'); setOpenDropdown(null); }}
                                                            className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${selectedPropertyId === 'all' ? 'bg-primary text-text-inverse' : 'text-text-secondary hover:bg-background'}`}
                                                        >
                                                            <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                                                                <LayoutDashboard className="w-4 h-4" />
                                                            </div>
                                                            <div className="text-left">
                                                                <p className="text-xs font-black uppercase tracking-tight">All Properties</p>
                                                                <p className="text-[10px] text-text-tertiary font-body font-medium">{properties.length} Locations</p>
                                                            </div>
                                                        </button>
                                                    </div>
                                                    <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                                                        {properties.map(prop => (
                                                            <button
                                                                key={prop.id}
                                                                onClick={() => { handlePropertyChange(prop.id); setOpenDropdown(null); }}
                                                                className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${selectedPropertyId === prop.id ? 'bg-primary text-text-inverse' : 'text-text-secondary hover:bg-background'}`}
                                                            >
                                                                <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center overflow-hidden">
                                                                    {prop.image_url ? (
                                                                        <img src={prop.image_url} alt="" className="w-full h-full object-cover" />
                                                                    ) : (
                                                                        <Building2 className="w-4 h-4 text-slate-400" />
                                                                    )}
                                                                </div>
                                                                <div className="text-left overflow-hidden">
                                                                    <p className="text-xs font-black uppercase tracking-tight truncate">{prop.name}</p>
                                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{prop.code}</p>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            </>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}

                            {/* View Requests Button — only show when requests tab is active */}
                            {activeTab === 'requests' && (
                                <button
                                    onClick={() => {
                                        const next = !showRequestsList;
                                        setShowRequestsList(next);
                                        const url = new URL(window.location.href);
                                        if (next) {
                                            url.searchParams.set('view', 'list');
                                        } else {
                                            url.searchParams.delete('view');
                                        }
                                        window.history.pushState({}, '', url.toString());
                                    }}
                                    className={`hidden lg:flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-sm border-2 ${showRequestsList
                                        ? 'bg-primary text-white border-primary'
                                        : 'bg-surface-elevated text-primary border-primary/20 hover:bg-primary/5'
                                        }`}
                                >
                                    <Ticket className="w-4 h-4" />
                                    <span className="hidden sm:inline">{showRequestsList ? 'Board View' : 'View Requests'}</span>
                                </button>
                            )}
                            <div className="flex flex-col items-end">
                                <span className="text-sm font-display font-semibold text-text-primary tracking-tight">System Status</span>
                                <span className="text-[10px] text-primary font-bold uppercase tracking-widest">Online</span>
                            </div>
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
                        {activeTab === 'overview' && (
                            <OverviewTab
                                properties={properties}
                                orgId={org?.id || ''}
                                selectedPropertyId={selectedPropertyId}
                                setSelectedPropertyId={handlePropertyChange}
                                onMenuToggle={() => setSidebarOpen(true)}
                                onTabChange={handleTabChange}
                            />
                        )}
                        {activeTab === 'revenue' && <RevenueTab properties={properties} selectedPropertyId={selectedPropertyId} />}
                        {activeTab === 'properties' && (
                            <PropertiesTab
                                properties={properties}
                                onCreate={() => setShowCreatePropModal(true)}
                                onEdit={(p: any) => setEditingProperty(p)}
                                onConfigure={(p: any) => {
                                    setSelectedPropertyForFeatures(p);
                                    setShowFeaturesModal(true);
                                }}
                                onDelete={handleDeleteProperty}
                            />
                        )}
                        {activeTab === 'requests' && (
                            <div className="h-full">
                                {showRequestsList ? (
                                    <TicketsView
                                        propertyId={selectedPropertyId === 'all' ? undefined : selectedPropertyId}
                                        canDelete={true}
                                        initialStatusFilter={pendingStatusFilter}
                                    />
                                ) : (
                                    <AdminSPOCDashboard
                                        organizationId={org?.id || ''}
                                        propertyId={selectedPropertyId === 'all' ? undefined : selectedPropertyId}
                                        propertyName={selectedPropertyId === 'all' ? 'All Properties' : activeProperty?.name}
                                        adminUser={{
                                            full_name: user?.user_metadata?.full_name || 'Super Admin',
                                            avatar_url: ''
                                        }}
                                        initialStatusFilter={pendingStatusFilter}
                                        properties={properties}
                                        onPropertyChange={handlePropertyChange}
                                    />
                                )}
                            </div>
                        )}

                        {activeTab === 'visitors' && <VisitorsTab properties={properties} selectedPropertyId={selectedPropertyId} />}

                        {activeTab === 'reports' && org && (
                            <div className="space-y-6">
                                <ImportReportsView
                                    organizationId={org.id}
                                    propertyId={selectedPropertyId === 'all' ? undefined : selectedPropertyId}
                                />
                            </div>
                        )}

                        {activeTab === 'users' && (
                            <UserDirectory
                                orgId={org?.id}
                                orgName={org?.name}
                                properties={properties}
                                onUserUpdated={fetchOrgUsers}
                            />
                        )}

                        {activeTab === 'diesel' && (
                            <DieselAnalyticsDashboard
                                propertyId={selectedPropertyId === 'all' ? undefined : selectedPropertyId}
                                orgId={org?.id}
                            />
                        )}

                        {activeTab === 'electricity' && (
                            <ElectricityAnalyticsDashboard
                                propertyId={selectedPropertyId === 'all' ? undefined : selectedPropertyId}
                                orgId={org?.id}
                            />
                        )}

                        {activeTab === 'stock_reports' && org && (
                            selectedPropertyId !== 'all' ? (
                                <StockReportView propertyId={selectedPropertyId} orgId={org.id} propertyName={activeProperty?.name} />
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                                        <Package className="w-8 h-8 text-primary" />
                                    </div>
                                    <h3 className="text-lg font-black text-slate-900 mb-2">Select a Property</h3>
                                    <p className="text-sm text-slate-500 max-w-md">Please select a specific property from the property selector above to view stock reports.</p>
                                </div>
                            )
                        )}

                        {activeTab === 'checklist' && (
                            <div className="w-full min-h-screen bg-slate-50/50">
                                {checklistPropertyId !== 'all' ? (
                                    <SOPDashboard
                                        propertyId={checklistPropertyId}
                                        propertySelector={
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setSidebarOpen(true)}
                                                    className="w-9 h-9 flex items-center justify-center rounded-xl lg:hidden text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                                                >
                                                    <Menu size={18} />
                                                </button>
                                                <PropertySelectorPill
                                                    properties={properties}
                                                    selectedId={checklistPropertyId}
                                                    isOpen={openDropdown === 'checklist'}
                                                    onToggle={() => setOpenDropdown(openDropdown === 'checklist' ? null : 'checklist')}
                                                    onSelect={(id) => { setChecklistPropertyId(id); setOpenDropdown(null); }}
                                                    onClose={() => setOpenDropdown(null)}
                                                />
                                            </div>
                                        }
                                        headerRight={<NotificationBell />}
                                    />
                                ) : (
                                    <SOPDashboard
                                        propertyIds={properties.map(p => p.id)}
                                        propertySelector={
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setSidebarOpen(true)}
                                                    className="w-9 h-9 flex items-center justify-center rounded-xl lg:hidden text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                                                >
                                                    <Menu size={18} />
                                                </button>
                                                <PropertySelectorPill
                                                    properties={properties}
                                                    selectedId={checklistPropertyId}
                                                    isOpen={openDropdown === 'checklist'}
                                                    onToggle={() => setOpenDropdown(openDropdown === 'checklist' ? null : 'checklist')}
                                                    onSelect={(id) => { setChecklistPropertyId(id); setOpenDropdown(null); }}
                                                    onClose={() => setOpenDropdown(null)}
                                                />
                                            </div>
                                        }
                                        headerRight={<NotificationBell />}
                                    />
                                )}
                            </div>
                        )}



                        {/* Escalation tab content */}
                        {activeTab === 'escalation' && org && (
                            <div className="p-4 md:p-8 lg:p-12">
                                <EscalationHierarchyBuilder
                                    organizationId={org.id}
                                    propertyId={escalationPropertyId !== 'all' ? escalationPropertyId : undefined}
                                    propertySelector={
                                        <div className="relative">
                                            <button
                                                onClick={() => setOpenDropdown(openDropdown === 'escalation' ? null : 'escalation')}
                                                className="flex items-center gap-3 bg-surface-elevated border border-border rounded-xl px-4 py-2.5 hover:border-primary transition-all group min-w-[200px]"
                                            >
                                                <div className="w-6 h-6 rounded-lg bg-background flex items-center justify-center overflow-hidden">
                                                    {(() => { const ep = properties.find(p => p.id === escalationPropertyId); return ep?.image_url ? <img src={ep.image_url} alt="" className="w-full h-full object-cover" /> : <Building2 className="w-3.5 h-3.5 text-text-tertiary" />; })()}
                                                </div>
                                                <span className="text-sm font-body font-medium text-text-primary flex-1 text-left">
                                                    {escalationPropertyId === 'all' ? 'All Properties' : properties.find(p => p.id === escalationPropertyId)?.name}
                                                </span>
                                                <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${openDropdown === 'escalation' ? 'rotate-180' : ''}`} />
                                            </button>
                                            <AnimatePresence>
                                                {openDropdown === 'escalation' && (
                                                    <>
                                                        <div className="fixed inset-0 z-[60]" onClick={() => setOpenDropdown(null)} />
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            className="absolute right-0 mt-2 w-72 bg-surface-elevated rounded-2xl shadow-2xl border border-border z-[70] overflow-hidden"
                                                        >
                                                            <div className="p-2 border-b border-border">
                                                                <button
                                                                    onClick={() => { setEscalationPropertyId('all'); setOpenDropdown(null); }}
                                                                    className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${escalationPropertyId === 'all' ? 'bg-primary text-text-inverse' : 'text-text-secondary hover:bg-background'}`}
                                                                >
                                                                    <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center">
                                                                        <LayoutDashboard className="w-4 h-4" />
                                                                    </div>
                                                                    <div className="text-left">
                                                                        <p className="text-xs font-black uppercase tracking-tight">All Properties</p>
                                                                        <p className="text-[10px] text-text-tertiary font-body font-medium">{properties.length} Locations</p>
                                                                    </div>
                                                                </button>
                                                            </div>
                                                            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                                                                {properties.map(prop => (
                                                                    <button
                                                                        key={prop.id}
                                                                        onClick={() => { setEscalationPropertyId(prop.id); setOpenDropdown(null); }}
                                                                        className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${escalationPropertyId === prop.id ? 'bg-primary text-text-inverse' : 'text-text-secondary hover:bg-background'}`}
                                                                    >
                                                                        <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center overflow-hidden">
                                                                            {prop.image_url ? <img src={prop.image_url} alt="" className="w-full h-full object-cover" /> : <Building2 className="w-4 h-4 text-slate-400" />}
                                                                        </div>
                                                                        <div className="text-left overflow-hidden">
                                                                            <p className="text-xs font-black uppercase tracking-tight truncate">{prop.name}</p>
                                                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{prop.code}</p>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    </>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    }
                                />
                            </div>
                        )}

                        {activeTab === 'rooms' && (
                            <div className="p-4 md:p-8 lg:p-12 space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-xl font-black text-slate-900 tracking-tight">Meeting Rooms</h2>
                                        <p className="text-sm text-slate-500 font-medium mt-0.5">Manage meeting rooms and bookings across your properties</p>
                                    </div>
                                    {properties.length > 0 && (
                                        <div className="relative">
                                            <button
                                                onClick={() => setOpenDropdown(openDropdown === 'rooms' ? null : 'rooms')}
                                                className="flex items-center gap-3 bg-surface-elevated border border-border rounded-xl px-4 py-2.5 hover:border-primary transition-all group min-w-[200px]"
                                            >
                                                <div className="w-6 h-6 rounded-lg bg-background flex items-center justify-center overflow-hidden">
                                                    {roomsPropertyId === 'all'
                                                        ? <LayoutDashboard className="w-3.5 h-3.5 text-text-tertiary" />
                                                        : (() => { const rp = properties.find(p => p.id === roomsPropertyId); return rp?.image_url ? <img src={rp.image_url} alt="" className="w-full h-full object-cover" /> : <Building2 className="w-3.5 h-3.5 text-text-tertiary" />; })()
                                                    }
                                                </div>
                                                <span className="text-sm font-body font-medium text-text-primary flex-1 text-left">
                                                    {roomsPropertyId === 'all' ? 'Select Property' : properties.find(p => p.id === roomsPropertyId)?.name}
                                                </span>
                                                <ChevronDown className={`w-4 h-4 text-text-tertiary transition-transform ${openDropdown === 'rooms' ? 'rotate-180' : ''}`} />
                                            </button>
                                            <AnimatePresence>
                                                {openDropdown === 'rooms' && (
                                                    <>
                                                        <div className="fixed inset-0 z-[60]" onClick={() => setOpenDropdown(null)} />
                                                        <motion.div
                                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            className="absolute right-0 mt-2 w-72 bg-surface-elevated rounded-2xl shadow-2xl border border-border z-[70] overflow-hidden"
                                                        >
                                                            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                                                                {properties.map(prop => (
                                                                    <button
                                                                        key={prop.id}
                                                                        onClick={() => { setRoomsPropertyId(prop.id); setOpenDropdown(null); }}
                                                                        className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${roomsPropertyId === prop.id ? 'bg-primary text-text-inverse' : 'text-text-secondary hover:bg-background'}`}
                                                                    >
                                                                        <div className="w-8 h-8 rounded-lg bg-background flex items-center justify-center overflow-hidden">
                                                                            {prop.image_url ? <img src={prop.image_url} alt="" className="w-full h-full object-cover" /> : <Building2 className="w-4 h-4 text-slate-400" />}
                                                                        </div>
                                                                        <div className="text-left overflow-hidden">
                                                                            <p className="text-xs font-black uppercase tracking-tight truncate">{prop.name}</p>
                                                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{prop.code}</p>
                                                                        </div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    </>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </div>
                                {roomsPropertyId !== 'all' ? (
                                    <AdminRoomManager propertyId={roomsPropertyId} user={user!} />
                                ) : (
                                    <div className="flex flex-col items-center justify-center py-20 text-center">
                                        <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
                                            <DoorOpen className="w-8 h-8 text-primary" />
                                        </div>
                                        <h3 className="text-lg font-black text-slate-900 mb-2">Select a Property</h3>
                                        <p className="text-sm text-slate-500 max-w-md">Select a property from the dropdown above to manage its meeting rooms and bookings.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'super_tenants' && org && (
                            <SuperTenantOrgTab orgId={org.id} properties={properties} />
                        )}

                        {activeTab === 'settings' && <SettingsView />}
                        {activeTab === 'profile' && (
                            <div className="flex justify-center items-start py-8">
                                <div className="bg-white border border-slate-100 rounded-3xl shadow-lg w-full max-w-md overflow-hidden">
                                    {/* Card Header with Autopilot Logo */}
                                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-8 flex flex-col items-center">
                                        {/* Autopilot Logo */}
                                        <div className="flex items-center justify-center mb-6">
                                            <img
                                                src="/autopilot-logo-new.png"
                                                alt="Autopilot Logo"
                                                className="h-10 w-auto object-contain invert mix-blend-screen"
                                            />
                                        </div>

                                        {/* User Avatar */}
                                        <div className="w-24 h-24 bg-white/10 rounded-full flex items-center justify-center border-4 border-white/20 mb-4 overflow-hidden">
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
                                                    {user?.user_metadata?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                                                </span>
                                            )}
                                        </div>

                                        {/* Role Badge */}
                                        <span className="px-4 py-1.5 bg-amber-500 text-slate-900 rounded-full text-xs font-black uppercase tracking-wider">
                                            {userRole}
                                        </span>
                                    </div>

                                    {/* Card Body with User Info */}
                                    <div className="p-8 space-y-6">
                                        <div className="space-y-4">
                                            <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Full Name</span>
                                                <span className="text-sm font-bold text-slate-900">
                                                    {user?.user_metadata?.full_name || 'Not Set'}
                                                </span>
                                            </div>

                                            <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Phone</span>
                                                <span className="text-sm font-bold text-slate-900">
                                                    {user?.user_metadata?.phone || 'Not Set'}
                                                </span>
                                            </div>

                                            <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Email</span>
                                                <span className="text-sm font-medium text-slate-700">
                                                    {user?.email || 'Not Set'}
                                                </span>
                                            </div>

                                            <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Organization</span>
                                                <span className="text-sm font-bold text-slate-900">
                                                    {org?.name || 'Not Assigned'}
                                                </span>
                                            </div>

                                            <div className="flex justify-between items-center py-3">
                                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</span>
                                                <span className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold capitalize">
                                                    {userRole}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </main>

            {/* Modals */}
            {
                (showCreatePropModal || editingProperty) && (
                    <PropertyModal
                        property={editingProperty}
                        onClose={() => { setShowCreatePropModal(false); setEditingProperty(null); }}
                        onSave={(data: any) => editingProperty ? handleUpdateProperty(editingProperty.id, data) : handleCreateProperty(data)}
                    />
                )
            }

            {
                showUserModal && (
                    <UserModal
                        user={editingUser}
                        onClose={() => { setShowUserModal(false); setEditingUser(null); }}
                        onSave={(data: any) => editingUser && handleUpdateUser(editingUser.user_id, data)}
                        allProperties={properties}
                        orgId={org?.id || ''}
                    />
                )
            }

            <InviteMemberModal
                isOpen={showAddMemberModal}
                onClose={() => setShowAddMemberModal(false)}
                orgId={org?.id || ''}
                orgName={org?.name || 'Organization'}
                properties={properties}
                onSuccess={() => {
                    fetchOrgUsers();
                    setActiveTab('users');
                }}
            />

            {/* Ticket Create Modal */}
            {org && (
                <TicketCreateModal
                    isOpen={showTicketCreateModal}
                    onClose={() => setShowTicketCreateModal(false)}
                    organizationId={org.id}
                    propertyId={selectedPropertyId === 'all' ? undefined : selectedPropertyId}
                    isAdminMode={true}
                    showInternalToggle={true}
                    organizations={(() => {
                        const orgs = org ? [org] : [];
                        // If user is from Autopilot Offices but viewing another org, add Autopilot to the list
                        if (membership?.org_name === 'Autopilot Offices' && membership.org_id && membership.org_id !== org?.id) {
                            orgs.push({ id: membership.org_id, name: membership.org_name, code: 'autopilot' });
                        }
                        return orgs;
                    })()}
                    properties={properties}
                />
            )}

            {/* Stock Scanner Modal */}
            {selectedPropertyId !== 'all' && (
                <StockMovementModal
                    isOpen={isScannerModalOpen}
                    onClose={() => setIsScannerModalOpen(false)}
                    propertyId={selectedPropertyId}
                    autoOpenScanner={true}
                    onSuccess={() => {/* Stats will refresh on tab change or memoized components */ }}
                />
            )}

            {/* Property Features Modal */}
            {showFeaturesModal && selectedPropertyForFeatures && (
                <PropertyFeaturesModal
                    propertyId={selectedPropertyForFeatures.id}
                    propertyName={selectedPropertyForFeatures.name}
                    onClose={() => {
                        setShowFeaturesModal(false);
                        setSelectedPropertyForFeatures(null);
                        fetchProperties(); // Refresh to show updated validation status
                    }}
                />
            )}

        </div>
    );
};

const DieselSphere = ({ percentage }: { percentage: number }) => {
    return (
        <div className="relative w-full aspect-square max-w-[200px] mx-auto group">
            {/* Outer Glass Sphere */}
            <div className="absolute inset-0 rounded-full border-4 border-white/20 bg-slate-900/10 backdrop-blur-[2px] shadow-2xl overflow-hidden group-hover:scale-105 transition-transform duration-700">
                {/* 3D Inner Shadow for Depth */}
                <div className="absolute inset-0 rounded-full shadow-[inset_0_10px_40px_rgba(0,0,0,0.5)] z-20" />

                {/* Liquid Fill */}
                <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${percentage}%` }}
                    transition={{ duration: 2, ease: "circOut" }}
                    className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-amber-600 via-amber-500 to-amber-400"
                >
                    {/* Primary Wave */}
                    <motion.div
                        animate={{
                            x: [0, -100],
                        }}
                        transition={{
                            duration: 4,
                            repeat: Infinity,
                            ease: "linear",
                        }}
                        className="absolute top-0 left-0 w-[400%] h-8 bg-amber-400/50 -translate-y-1/2 opacity-60"
                        style={{
                            borderRadius: '38% 42% 35% 45%',
                        }}
                    />

                    {/* Secondary Wave */}
                    <motion.div
                        animate={{
                            x: [-100, 0],
                        }}
                        transition={{
                            duration: 6,
                            repeat: Infinity,
                            ease: "linear",
                        }}
                        className="absolute top-1 left-0 w-[400%] h-8 bg-amber-400/30 -translate-y-1/2 opacity-40"
                        style={{
                            borderRadius: '45% 35% 42% 38%',
                        }}
                    />

                    {/* Bubbles animation */}
                    {[...Array(5)].map((_, i) => (
                        <motion.div
                            key={i}
                            animate={{
                                y: [0, -40],
                                opacity: [0, 0.6, 0],
                                x: [0, (i % 2 === 0 ? 10 : -10)],
                            }}
                            transition={{
                                duration: 2 + i,
                                repeat: Infinity,
                                delay: i * 0.5,
                            }}
                            className="absolute bottom-0 rounded-full bg-white/30 backdrop-blur-sm"
                            style={{
                                width: 4 + (i * 2),
                                height: 4 + (i * 2),
                                left: `${20 + (i * 15)}%`,
                            }}
                        />
                    ))}
                </motion.div>

                {/* Reflection/Lighting Highlights */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/5 to-white/20 z-30 pointer-events-none" />
                <div className="absolute top-[10%] left-[15%] w-[25%] h-[15%] bg-white/20 rounded-full blur-[4px] rotate-[-25deg] z-30 pointer-events-none" />
                <div className="absolute bottom-[15%] right-[15%] w-[10%] h-[10%] bg-amber-500/20 rounded-full blur-[2px] z-30 pointer-events-none" />
            </div>

            {/* Percentage Display */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-40 pointer-events-none">
                <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-4xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]"
                >
                    {Math.round(percentage)}
                    <span className="text-sm ml-0.5 opacity-80">%</span>
                </motion.span>
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest drop-shadow-md">Consumption</span>
            </div>

            {/* Bottom Glow */}
            <div className={`absolute -bottom-4 left-1/2 -translate-x-1/2 w-[60%] h-4 bg-amber-500/20 blur-xl rounded-full transition-opacity duration-300 ${percentage > 0 ? 'opacity-100' : 'opacity-0'}`} />
        </div>
    );
};

// Sub-components
const OverviewTab = memo(function OverviewTab({
    properties,
    orgId,
    selectedPropertyId,
    setSelectedPropertyId,
    onMenuToggle,
    onTabChange
}: {
    properties: Property[],
    orgId: string,
    selectedPropertyId: string,
    setSelectedPropertyId: (id: string) => void,
    onMenuToggle: () => void,
    onTabChange: (tab: Tab, filter?: string) => void
}) {
    const [isLoading, setIsLoading] = useState(true);
    const [isOverviewSelectorOpen, setIsOverviewSelectorOpen] = useState(false);
    const hasFetched = useRef(false);

    // Real data from org APIs
    const [ticketSummary, setTicketSummary] = useState({
        total_tickets: 0,
        open_tickets: 0,
        waitlist: 0,
        in_progress: 0,
        resolved: 0,
        pending_validation: 0,
        validated_closed: 0,
        urgent_open: 0,
        sla_breached: 0,
        avg_resolution_hours: 0,
        properties_with_validation: 0,
        properties: [] as any[],
    });

    const [electricitySummary, setElectricitySummary] = useState({
        total_units: 0,
        total_units_today: 0,
        total_cost: 0,
        properties: [] as any[],
        properties_today: [] as any[],
    });
    const [electricityPeriod, setElectricityPeriod] = useState<'today' | 'month'>('month');
    const [ticketPeriod, setTicketPeriod] = useState<'today' | 'month' | 'all'>('month');

    const [vmsSummary, setVmsSummary] = useState({
        total_visitors_today: 0,
        checked_in: 0,
        checked_out: 0,
        properties: [] as any[],
    });

    const [vendorSummary, setVendorSummary] = useState({
        total_revenue: 0,
        total_commission: 0,
        total_vendors: 0,
        properties: [] as any[],
    });

    // Fetch all org summaries ONCE
    useEffect(() => {
        if (!orgId) return;
        // Fetch all org summaries ONCE (or on period change)

        const fetchSummaries = async () => {
            setIsLoading(true);

            try {
                // Run ALL API calls in parallel for faster load
                const monthStart = new Date(new Date().setDate(1)).toISOString().split('T')[0];
                const todayDate = new Date().toISOString().split('T')[0];

                const [ticketsRes, electricityRes, vmsRes, vendorRes] = await Promise.all([
                    fetch(`/api/organizations/${orgId}/tickets-summary?period=${ticketPeriod}`),
                    fetch(`/api/organizations/${orgId}/electricity-readings?startDate=${monthStart}&endDate=${todayDate}`),
                    fetch(`/api/organizations/${orgId}/vms-summary?period=${ticketPeriod}`),
                    fetch(`/api/organizations/${orgId}/vendor-summary?period=month`),
                ]);

                // Process responses in parallel
                const [ticketsData, electricityData, vmsData, vendorData] = await Promise.all([
                    ticketsRes.ok ? ticketsRes.json() : null,
                    electricityRes.ok ? electricityRes.json() : null,
                    vmsRes.ok ? vmsRes.json() : null,
                    vendorRes.ok ? vendorRes.json() : null,
                ]);

                if (ticketsData) setTicketSummary(ticketsData);

                if (electricityData && Array.isArray(electricityData)) {
                    const totalUnits = electricityData.reduce((acc: number, r: any) => acc + (r.computed_units || 0), 0);
                    const totalCost = electricityData.reduce((acc: number, r: any) => acc + (r.computed_cost || 0), 0);
                    // Group by property for per-property breakdown (month)
                    const propMap: Record<string, { property_id: string; units: number }> = {};
                    electricityData.forEach((r: any) => {
                        if (!propMap[r.property_id]) propMap[r.property_id] = { property_id: r.property_id, units: 0 };
                        propMap[r.property_id].units += r.computed_units || 0;
                    });
                    // Filter today's readings and group by property
                    const todayReadings = electricityData.filter((r: any) => r.reading_date === todayDate);
                    const todayUnits = todayReadings.reduce((acc: number, r: any) => acc + (r.computed_units || 0), 0);
                    const propMapToday: Record<string, { property_id: string; units: number }> = {};
                    todayReadings.forEach((r: any) => {
                        if (!propMapToday[r.property_id]) propMapToday[r.property_id] = { property_id: r.property_id, units: 0 };
                        propMapToday[r.property_id].units += r.computed_units || 0;
                    });
                    setElectricitySummary({
                        total_units: Math.round(totalUnits),
                        total_units_today: Math.round(todayUnits),
                        total_cost: Math.round(totalCost),
                        properties: Object.values(propMap),
                        properties_today: Object.values(propMapToday),
                    });
                }

                if (vmsData) {
                    setVmsSummary({
                        total_visitors_today: vmsData.total_visitors || 0,
                        checked_in: vmsData.total_checked_in || 0,
                        checked_out: vmsData.total_checked_out || 0,
                        properties: vmsData.properties || [],
                    });
                }

                if (vendorData) {
                    setVendorSummary({
                        total_revenue: vendorData.total_revenue || 0,
                        total_commission: vendorData.total_commission || 0,
                        total_vendors: vendorData.total_vendors || 0,
                        properties: vendorData.properties || [],
                    });
                }
            } catch (error) {
                console.error('Error fetching org summaries:', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchSummaries();
    }, [orgId, ticketPeriod]);

    const activeProperty = selectedPropertyId === 'all'
        ? null
        : properties.find(p => p.id === selectedPropertyId);

    // Derive display stats based on selection
    const displayTicketStats = useMemo(() => {
        if (selectedPropertyId === 'all') return ticketSummary;

        const propStats = ticketSummary.properties?.find(p => p.property_id === selectedPropertyId);
        if (!propStats) return {
            total_tickets: 0,
            open_tickets: 0,
            waitlist: 0,
            in_progress: 0,
            resolved: 0,
            pending_validation: 0,
            validated_closed: 0,
            urgent_open: 0,
            sla_breached: 0,
            avg_resolution_hours: 0,
            properties_with_validation: ticketSummary.properties_with_validation,
            properties: ticketSummary.properties,
        };

        return {
            total_tickets: propStats.total,
            open_tickets: propStats.open,
            waitlist: propStats.waitlist || 0,
            in_progress: propStats.in_progress,
            resolved: propStats.resolved,
            pending_validation: propStats.pending_validation || 0,
            validated_closed: propStats.validated_closed || 0,
            urgent_open: propStats.urgent_open || 0,
            sla_breached: propStats.sla_breached,
            avg_resolution_hours: ticketSummary.avg_resolution_hours,
            properties_with_validation: propStats.validation_enabled ? 1 : 0,
            properties: ticketSummary.properties,
        };
    }, [selectedPropertyId, ticketSummary]);

    const displayElectricityStats = useMemo(() => {
        const isToday = electricityPeriod === 'today';
        if (selectedPropertyId === 'all') {
            return {
                total_units: isToday ? electricitySummary.total_units_today : electricitySummary.total_units,
                total_cost: electricitySummary.total_cost,
                properties: electricitySummary.properties,
            };
        }
        const propsSource = isToday ? electricitySummary.properties_today : electricitySummary.properties;
        const propStats = propsSource?.find((p: any) => p.property_id === selectedPropertyId);
        return {
            total_units: propStats?.units || 0,
            total_cost: 0,
            properties: electricitySummary.properties,
        };
    }, [selectedPropertyId, electricitySummary, electricityPeriod]);

    const displayVmsStats = useMemo(() => {
        if (selectedPropertyId === 'all') return vmsSummary;
        const propStats = (vmsSummary as any).properties?.find((p: any) => p.property_id === selectedPropertyId);
        return {
            total_visitors_today: propStats?.today || 0,
            checked_in: propStats?.checked_in || 0,
            checked_out: propStats?.checked_out || 0,
        };
    }, [selectedPropertyId, vmsSummary]);

    const displayVendorStats = useMemo(() => {
        if (selectedPropertyId === 'all') return vendorSummary;
        const propStats = (vendorSummary as any).properties?.find((p: any) => p.property_id === selectedPropertyId);
        return {
            total_revenue: propStats?.total_revenue || 0,
            total_commission: propStats?.total_commission || 0,
            total_vendors: propStats?.vendor_count || 0,
        };
    }, [selectedPropertyId, vendorSummary]);

    // Calculated metrics
    const completionRate = displayTicketStats.total_tickets > 0
        ? Math.round((displayTicketStats.resolved / displayTicketStats.total_tickets) * 100 * 10) / 10
        : 0;
    const activeCount = displayTicketStats.open_tickets + displayTicketStats.in_progress;
    const validationRate = displayTicketStats.resolved > 0
        ? Math.round((displayTicketStats.validated_closed / displayTicketStats.resolved) * 100)
        : 0;
    const directResolved = displayTicketStats.resolved - displayTicketStats.validated_closed;
    const totalPropertiesCount = selectedPropertyId === 'all' ? properties.length : 1;
    const validationEnabledCount = selectedPropertyId === 'all'
        ? displayTicketStats.properties_with_validation
        : (displayTicketStats.properties_with_validation > 0 ? 1 : 0);

    return (
        <div className="min-h-screen bg-background">
            {/* Header Section */}
            <div className="bg-[#708F96] px-8 lg:px-12 py-10 border-b border-white/10 shadow-lg relative z-30">
                <div className="flex items-center justify-between mb-5 relative z-10">
                    <div className="flex items-center gap-4">
                        {/* Mobile Menu Toggle */}
                        <button
                            onClick={onMenuToggle}
                            className="p-2 -ml-2 lg:hidden text-white/70 hover:text-white transition-colors"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-display font-semibold text-white tracking-tight capitalize">Unified Dashboard</h1>
                            <p className="hidden md:block text-white/70 text-xs font-body font-medium mt-1">Manage your organization's resources.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Ticket Period Filter */}
                        <div className="hidden md:flex items-center bg-white/10 rounded-xl p-1 border border-white/10 shadow-sm">
                            <button
                                onClick={() => setTicketPeriod('today')}
                                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${ticketPeriod === 'today'
                                    ? 'bg-yellow-400 text-slate-900 shadow-lg scale-105'
                                    : 'text-white/70 hover:text-white'}`}
                            >
                                Today
                            </button>
                            <button
                                onClick={() => setTicketPeriod('month')}
                                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${ticketPeriod === 'month'
                                    ? 'bg-yellow-400 text-slate-900 shadow-lg scale-105'
                                    : 'text-white/70 hover:text-white'}`}
                            >
                                This Month
                            </button>
                            <button
                                onClick={() => setTicketPeriod('all')}
                                className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${ticketPeriod === 'all'
                                    ? 'bg-yellow-400 text-slate-900 shadow-lg scale-105'
                                    : 'text-white/70 hover:text-white'}`}
                            >
                                All Time
                            </button>
                        </div>

                        {/* Property Selector for Requests/Other tabs */}
                        {properties.length > 0 && (
                            <div className="relative">
                                <button
                                    onClick={() => setIsOverviewSelectorOpen(!isOverviewSelectorOpen)}
                                    className="flex items-center gap-3 bg-[#5A737A] text-white border border-white/10 rounded-xl px-4 py-2.5 shadow-sm hover:border-white/50 transition-all group min-w-[220px]"
                                >
                                    <div className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center overflow-hidden border border-white/10">
                                        {activeProperty && activeProperty.image_url ? (
                                            <img src={activeProperty.image_url} alt="" className="w-full h-full object-cover" />
                                        ) : (
                                            <Building2 className="w-3.5 h-3.5 text-white/70" />
                                        )}
                                    </div>
                                    <span className="text-sm font-bold flex-1 text-left">
                                        {selectedPropertyId === 'all' ? 'All Properties' : activeProperty?.name}
                                    </span>
                                    <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${isOverviewSelectorOpen ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {isOverviewSelectorOpen && (
                                        <>
                                            <div
                                                className="fixed inset-0 z-[110]"
                                                onClick={() => setIsOverviewSelectorOpen(false)}
                                            />
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute right-0 mt-2 w-80 bg-[#5A737A] rounded-2xl shadow-2xl border border-white/10 z-[120] overflow-hidden"
                                            >
                                                <div className="p-2 border-b border-white/10">
                                                    <button
                                                        onClick={() => { setSelectedPropertyId('all'); setIsOverviewSelectorOpen(false); }}
                                                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${selectedPropertyId === 'all' ? 'bg-yellow-400 text-slate-900' : 'text-white hover:bg-white/10'}`}
                                                    >
                                                        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden border border-white/10">
                                                            <LayoutDashboard className="w-5 h-5" />
                                                        </div>
                                                        <div className="text-left">
                                                            <p className="text-xs font-black uppercase tracking-tight">Show All Properties</p>
                                                            <p className={`text-[10px] font-bold ${selectedPropertyId === 'all' ? 'text-slate-900/60' : 'text-white/60'}`}>{properties.length} Active Locations</p>
                                                        </div>
                                                    </button>
                                                </div>
                                                <div className="max-h-80 overflow-y-auto p-2 space-y-1">
                                                    {properties.map(prop => (
                                                        <button
                                                            key={prop.id}
                                                            onClick={() => { setSelectedPropertyId(prop.id); setIsOverviewSelectorOpen(false); }}
                                                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${selectedPropertyId === prop.id ? 'bg-yellow-400 text-slate-900' : 'text-white hover:bg-white/10'}`}
                                                        >
                                                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center overflow-hidden border border-white/10">
                                                                {prop.image_url ? (
                                                                    <img src={prop.image_url} alt="" className="w-full h-full object-cover" />
                                                                ) : (
                                                                    <Building2 className="w-5 h-5 text-white/50" />
                                                                )}
                                                            </div>
                                                            <div className="text-left overflow-hidden">
                                                                <p className="text-xs font-black uppercase tracking-tight truncate">{prop.name}</p>
                                                                <p className={`text-[10px] font-bold uppercase tracking-widest ${selectedPropertyId === prop.id ? 'text-slate-900/60' : 'text-white/40'}`}>{prop.code}</p>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}
                    </div>
                </div>

                {/* KPI Cards Row — 4 insightful cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">

                    {/* Card 1 — Total Tickets */}
                    <div
                        onClick={() => onTabChange('requests', 'all')}
                        className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md cursor-pointer hover:border-slate-300 transition-all group"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-slate-600 transition-colors">Total Tickets</span>
                            <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center">
                                <Ticket className="w-3.5 h-3.5 text-slate-500" />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-4xl font-black text-slate-900">{displayTicketStats.total_tickets}</span>
                            <span className="text-xs text-slate-400 font-bold">{completionRate}% resolved</span>
                        </div>
                        {/* Resolution progress bar */}
                        <div className="w-full h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(completionRate, 100)}%` }}
                            />
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                            <span>{activeCount} active</span>
                            <span>{displayTicketStats.avg_resolution_hours > 0 ? `Avg ${displayTicketStats.avg_resolution_hours}h` : 'No data'}</span>
                        </div>
                    </div>

                    {/* Card 2 — Open & Active */}
                    <div
                        onClick={() => onTabChange('requests', 'open,assigned,in_progress,blocked')}
                        className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md cursor-pointer hover:border-blue-200 transition-all group"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-blue-500 transition-colors">Open & Active</span>
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${displayTicketStats.sla_breached > 0 ? 'bg-rose-50' : 'bg-blue-50'}`}>
                                <AlertCircle className={`w-3.5 h-3.5 ${displayTicketStats.sla_breached > 0 ? 'text-rose-500' : 'text-blue-500'}`} />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-4xl font-black text-slate-900">{activeCount}</span>
                            {displayTicketStats.sla_breached > 0 && (
                                <span className="text-[10px] text-rose-500 font-black uppercase bg-rose-50 px-1.5 py-0.5 rounded-md">{displayTicketStats.sla_breached} SLA breach</span>
                            )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                                {displayTicketStats.open_tickets - displayTicketStats.waitlist} Open
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
                                {displayTicketStats.waitlist} Waitlist
                            </span>
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-500">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 inline-block" />
                                {displayTicketStats.in_progress} In Progress
                            </span>
                            {displayTicketStats.urgent_open > 0 && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-rose-500">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 inline-block" />
                                    {displayTicketStats.urgent_open} High/Urgent
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Card 3 — Resolved & Validated */}
                    <div
                        onClick={() => onTabChange('requests', 'resolved,closed')}
                        className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm hover:shadow-md cursor-pointer hover:border-emerald-200 transition-all group"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-emerald-500 transition-colors">Resolved & Closed</span>
                            <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className="text-4xl font-black text-slate-900">{displayTicketStats.resolved}</span>
                            <span className="text-xs text-emerald-500 font-bold">{completionRate}%</span>
                        </div>
                        {/* Validation breakdown bar */}
                        {displayTicketStats.resolved > 0 && (
                            <div className="w-full h-1.5 bg-slate-100 rounded-full mb-2 overflow-hidden flex">
                                <div className="h-full bg-emerald-500 rounded-l-full transition-all duration-500" style={{ width: `${validationRate}%` }} />
                                <div className="h-full bg-slate-300 rounded-r-full transition-all duration-500" style={{ width: `${100 - validationRate}%` }} />
                            </div>
                        )}
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400">
                            {validationEnabledCount > 0 ? (
                                <span>
                                    <span className="text-emerald-600">{displayTicketStats.validated_closed} validated</span>
                                    {directResolved > 0 && <span> · {directResolved} direct</span>}
                                </span>
                            ) : (
                                <span>{displayTicketStats.resolved} direct closed</span>
                            )}
                            <span>Avg {displayTicketStats.avg_resolution_hours}h</span>
                        </div>
                    </div>

                    {/* Card 4 — Pending Client Validation */}
                    <div
                        onClick={() => onTabChange('requests', 'pending_validation')}
                        className={`bg-white rounded-2xl p-3 border shadow-sm hover:shadow-md cursor-pointer transition-all group ${displayTicketStats.pending_validation > 0
                            ? 'border-amber-200 hover:border-amber-300'
                            : 'border-slate-100 hover:border-slate-200'
                            }`}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-amber-500 transition-colors">Pending Validation</span>
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center ${displayTicketStats.pending_validation > 0 ? 'bg-amber-50' : 'bg-emerald-50'
                                }`}>
                                <Clock className={`w-3.5 h-3.5 ${displayTicketStats.pending_validation > 0 ? 'text-amber-500' : 'text-emerald-500'}`} />
                            </div>
                        </div>
                        <div className="flex items-baseline gap-2 mb-2">
                            <span className={`text-4xl font-black ${displayTicketStats.pending_validation > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                                {validationEnabledCount > 0 ? displayTicketStats.pending_validation : 0}
                            </span>
                            {displayTicketStats.pending_validation === 0 && validationEnabledCount > 0 && (
                                <span className="text-[10px] text-emerald-500 font-black">All clear ✓</span>
                            )}
                            {displayTicketStats.pending_validation > 0 && (
                                <span className="text-[10px] text-amber-500 font-black bg-amber-50 px-1.5 py-0.5 rounded-md">Needs action</span>
                            )}
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 leading-relaxed">
                            {validationEnabledCount === 0 ? (
                                <span className="text-slate-400">
                                    {selectedPropertyId === 'all'
                                        ? 'Validation not enabled on any property'
                                        : 'Validation is not enabled for this property'}
                                </span>
                            ) : displayTicketStats.pending_validation > 0 ? (
                                <span className="text-amber-600">Awaiting tenant sign-off</span>
                            ) : (
                                <span className="text-emerald-600">All resolved tickets confirmed</span>
                            )}
                            <div className="mt-1 text-slate-300">
                                Enabled on {validationEnabledCount}/{totalPropertiesCount} {totalPropertiesCount === 1 ? 'property' : 'properties'}
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* Main Content Grid - with padding */}
            <div className="px-8 lg:px-12 py-5 space-y-5">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* Left Column */}
                    <div className="lg:col-span-3 space-y-5">
                        {/* Electricity Consumption */}
                        <div
                            onClick={() => onTabChange('electricity')}
                            className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm relative overflow-hidden group cursor-pointer hover:shadow-md hover:border-yellow-300/50 transition-all"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-black text-slate-900">Electricity</h3>
                                <div className="flex items-center gap-2">
                                    <div className="flex items-center bg-slate-100 rounded-lg p-0.5" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setElectricityPeriod('today');
                                            }}
                                            className={`px-2 py-1 text-[8px] font-black uppercase tracking-tight rounded-md transition-all ${electricityPeriod === 'today'
                                                ? 'bg-white text-yellow-600 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-600'
                                                }`}
                                        >
                                            Today
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setElectricityPeriod('month');
                                            }}
                                            className={`px-2 py-1 text-[8px] font-black uppercase tracking-tight rounded-md transition-all ${electricityPeriod === 'month'
                                                ? 'bg-white text-yellow-600 shadow-sm'
                                                : 'text-slate-400 hover:text-slate-600'
                                                }`}
                                        >
                                            Month
                                        </button>
                                    </div>
                                    <div className="w-8 h-8 bg-yellow-50 rounded-xl flex items-center justify-center">
                                        <Zap className="w-4 h-4 text-yellow-500" />
                                    </div>
                                </div>
                            </div>
                            <div className="text-yellow-600 text-xs font-bold mb-4 flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full animate-pulse ${electricityPeriod === 'today' ? 'bg-blue-400' : 'bg-yellow-500'}`} />
                                {electricityPeriod === 'today' ? 'Today' : 'This Month'}
                            </div>

                            {/* Electricity Visualization */}
                            <div className="flex justify-center my-6">
                                <div className="relative w-[160px] h-[160px]">
                                    {/* Background ring */}
                                    <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                                        <circle cx="60" cy="60" r="52" fill="none" stroke="#f1f5f9" strokeWidth="10" />
                                        <motion.circle
                                            cx="60" cy="60" r="52" fill="none"
                                            stroke="url(#elecGradient)" strokeWidth="10" strokeLinecap="round"
                                            strokeDasharray={`${Math.min(326, (displayElectricityStats.total_units / Math.max(displayElectricityStats.total_units, 1000)) * 326)} 326`}
                                            initial={{ strokeDasharray: '0 326' }}
                                            animate={{ strokeDasharray: `${Math.min(326, (displayElectricityStats.total_units / Math.max(displayElectricityStats.total_units, 1000)) * 326)} 326` }}
                                            transition={{ duration: 1.5, ease: 'circOut' }}
                                        />
                                        <defs>
                                            <linearGradient id="elecGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor="#facc15" />
                                                <stop offset="100%" stopColor="#f59e0b" />
                                            </linearGradient>
                                        </defs>
                                    </svg>
                                    {/* Center content */}
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <Zap className="w-6 h-6 text-yellow-500 mb-1" />
                                        <motion.span
                                            initial={{ opacity: 0, scale: 0.5 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            className="text-2xl font-black text-slate-900"
                                        >
                                            {displayElectricityStats.total_units.toLocaleString()}
                                        </motion.span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">kVAh</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest">Units Consumed</div>
                                <div className="text-3xl font-black text-slate-900 flex items-baseline gap-1">
                                    {displayElectricityStats.total_units.toLocaleString()}
                                    <span className="text-sm text-slate-400 font-bold">kVAh</span>
                                </div>
                                <div className="flex items-center gap-2 pt-2 border-t border-slate-50 mt-2">
                                    <span className="text-[10px] font-bold text-yellow-600 uppercase flex items-center gap-1 group-hover:underline">
                                        View Analytics →
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Vendor Revenue */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 mb-2">Vendor Revenue</h3>
                            <div className="text-slate-400 text-xs font-bold mb-2">This Month</div>
                            <div className="text-3xl font-black text-slate-900">₹ {displayVendorStats.total_revenue.toLocaleString()}</div>
                            <div className="text-xs text-slate-500 mt-2">
                                Commission: ₹ {displayVendorStats.total_commission.toLocaleString()} from {displayVendorStats.total_vendors} vendors
                            </div>
                        </div>
                    </div>

                    {/* Center Column - Property Card */}
                    <div className="lg:col-span-4">
                        <div className="bg-yellow-400 rounded-3xl p-5 h-full relative overflow-hidden">
                            <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-sm rounded-full w-8 h-8 flex items-center justify-center text-white font-bold text-sm">
                                {properties.length}
                            </div>

                            <h3 className="text-2xl font-black text-slate-900 mb-2 truncate">
                                {activeProperty ? activeProperty.name : 'All Properties'}
                            </h3>
                            <div className="text-red-600 text-sm font-bold mb-5 truncate">
                                {activeProperty ? `Property: ${activeProperty.code}` : 'Multi-Property View'}
                            </div>

                            {/* Building Image */}
                            <div className="bg-yellow-500/50 rounded-[2rem] h-56 mb-5 flex items-center justify-center overflow-hidden border-4 border-white/30 shadow-2xl group relative">
                                {activeProperty?.image_url ? (
                                    <>
                                        <img
                                            src={activeProperty.image_url}
                                            alt={activeProperty.name}
                                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-yellow-400/20 to-transparent" />
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <Building2 className="w-20 h-20 text-yellow-600/30" />
                                        <span className="text-[10px] font-black text-yellow-700/40 uppercase tracking-widest">Awaiting Visuals</span>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <div className="text-slate-700 text-xs font-bold">Visitors Today</div>
                                    <div className="text-2xl font-black text-slate-900">{displayVmsStats.total_visitors_today}</div>
                                </div>
                                <div>
                                    <div className="text-slate-700 text-xs font-bold">Checked In / Out</div>
                                    <div className="text-2xl font-black text-slate-900">{displayVmsStats.checked_in} / {displayVmsStats.checked_out}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column */}
                    <div className="lg:col-span-5 space-y-5">
                        {/* Property Breakdown */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 mb-4">Tickets by Property</h3>
                            <div className="space-y-3 max-h-48 overflow-y-auto">
                                {(ticketSummary as any).properties?.slice(0, 5).map((prop: any, idx: number) => (
                                    <div key={prop.property_id || idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                                        <div>
                                            <div className="font-bold text-slate-900 text-sm">{prop.property_name}</div>
                                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">{prop.open + prop.in_progress} active · {prop.resolved} resolved</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-lg font-black text-slate-900">{prop.total}</div>
                                            <div className="text-xs text-slate-400">total</div>
                                        </div>
                                    </div>
                                ))}
                                {!(ticketSummary as any).properties?.length && (
                                    <div className="text-center text-slate-400 py-4">No ticket data available</div>
                                )}
                            </div>
                        </div>

                        {/* Module Summary */}
                        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm">
                            <h3 className="text-sm font-black text-slate-900 mb-4">Module Summary</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-blue-50 rounded-xl">
                                    <div className="text-xs font-bold text-blue-600 mb-1">Tickets</div>
                                    <div className="text-2xl font-black text-blue-900">{displayTicketStats.total_tickets}</div>
                                </div>
                                <div className="p-4 bg-emerald-50 rounded-xl">
                                    <div className="text-xs font-bold text-emerald-600 mb-1">
                                        Visitors {ticketPeriod === 'today' ? '(Today)' : ticketPeriod === 'month' ? '(Month)' : '(All Time)'}
                                    </div>
                                    <div className="text-2xl font-black text-emerald-900">{displayVmsStats.total_visitors_today}</div>
                                </div>
                                <div className="p-4 bg-yellow-50 rounded-xl">
                                    <div className="text-xs font-bold text-yellow-600 mb-1">Electricity ({electricityPeriod === 'today' ? 'Today' : 'Month'})</div>
                                    <div className="text-2xl font-black text-slate-900">{displayElectricityStats.total_units.toLocaleString()} <span className="text-sm text-slate-400 font-bold">kVAh</span></div>
                                </div>
                                <div className="p-4 bg-purple-50 rounded-xl">
                                    <div className="text-xs font-bold text-purple-600 mb-1">Vendor Revenue</div>
                                    <div className="text-2xl font-black text-purple-900">₹{displayVendorStats.total_revenue.toLocaleString('en-IN')}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

const PropertiesTab = ({ properties, onCreate, onEdit, onConfigure, onDelete }: any) => (
    <div className="space-y-5">
        <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                    type="text"
                    placeholder="Search properties..."
                    className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-100 w-64"
                />
            </div>
            <button
                onClick={onCreate}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl uppercase tracking-widest hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200"
            >
                <Plus className="w-4 h-4" /> Add Property
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {properties.map((prop: any) => (
                <div key={prop.id} className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 group overflow-hidden flex flex-col">
                    {/* Image Header with aspect-ratio handling */}
                    <div className="relative h-56 bg-slate-50 overflow-hidden">
                        {prop.image_url ? (
                            <img
                                src={prop.image_url}
                                alt={prop.name}
                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-200 gap-2">
                                <Building2 className="w-16 h-16" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">Standard Asset View</span>
                            </div>
                        )}

                        {/* Overlay Controls */}
                        <div className="absolute top-4 right-4 flex gap-2 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500">
                            <button
                                onClick={() => onEdit(prop)}
                                className="p-3 bg-white/90 backdrop-blur-xl text-slate-600 rounded-2xl hover:bg-blue-500 hover:text-white shadow-xl shadow-black/5 transition-all"
                            >
                                <Edit className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => onConfigure(prop)}
                                title="Configure Features"
                                className="p-3 bg-white/90 backdrop-blur-xl text-slate-600 rounded-2xl hover:bg-slate-900 hover:text-white shadow-xl shadow-black/5 transition-all"
                            >
                                <Settings className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => onDelete(prop.id)}
                                className="p-3 bg-white/90 backdrop-blur-xl text-slate-600 rounded-2xl hover:bg-rose-500 hover:text-white shadow-xl shadow-black/5 transition-all"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Property Tag */}
                        <div className="absolute bottom-4 left-4">
                            <span className="px-3 py-1.5 bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-black rounded-xl uppercase tracking-widest border border-white/10 shadow-lg">
                                {prop.code}
                            </span>
                        </div>
                    </div>

                    <div className="p-8 flex-1 flex flex-col">
                        <h3 className="text-xl font-black text-slate-900 leading-tight mb-2 truncate decoration-blue-500 decoration-4">{prop.name}</h3>
                        <div className="flex items-start gap-2.5 text-slate-500 text-xs font-medium mb-4">
                            <MapPin className="w-4 h-4 mt-0.5 text-slate-400 shrink-0" />
                            <span className="line-clamp-2 leading-relaxed">{prop.address || 'No physical address registered'}</span>
                        </div>

                        {/* Validation badge */}
                        <div className="mb-6">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${prop.validation_enabled !== false ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                                <span className={`w-1.5 h-1.5 rounded-full ${prop.validation_enabled !== false ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                {prop.validation_enabled !== false ? 'Validation On' : 'Validation Off'}
                            </span>
                        </div>

                        <button
                            onClick={() => onConfigure(prop)}
                            className="w-full py-4 bg-slate-50 border border-slate-100 text-slate-900 font-bold rounded-2xl text-[10px] hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all mt-auto uppercase tracking-[0.2em] shadow-sm flex items-center justify-center gap-2"
                        >
                            <Settings className="w-3.5 h-3.5" /> Configure Property
                        </button>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

const UsersTab = ({ users, orgId, allProperties, onEdit, onDelete }: any) => (
    <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-50 flex justify-between items-center">
            <h3 className="font-black text-slate-900">User Directory</h3>
            <div className="flex gap-2">
                <button className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:text-slate-900 transition-colors">
                    <Filter className="w-4 h-4" />
                </button>
            </div>
        </div>
        <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
                <tr>
                    <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Name</th>
                    <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Role</th>
                    <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Properties</th>
                    <th className="px-5 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
                {users.map((u: any) => (
                    <tr key={`${u.user_id}-${orgId}`} className="hover:bg-slate-50/30 transition-colors group">
                        <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-xs">
                                    {u.user?.full_name?.substring(0, 1) || 'U'}
                                </div>
                                <div>
                                    <p className="font-bold text-slate-900 text-sm">{u.user?.full_name || 'Unknown'}</p>
                                    <p className="text-[10px] text-slate-400 font-medium">{u.user?.email}</p>
                                </div>
                            </div>
                        </td>
                        <td className="px-5 py-4">
                            {u.role ? (
                                <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide ${u.role === 'org_super_admin' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-900 text-white'
                                    }`}>
                                    {u.role?.replace(/_/g, ' ')}
                                </span>
                            ) : u.propertyMemberships?.[0] ? (
                                <span className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide bg-indigo-50 text-indigo-600 border border-indigo-100">
                                    {u.propertyMemberships[0].role?.replace(/_/g, ' ')}
                                </span>
                            ) : (
                                <span className="text-[10px] font-bold text-slate-400 italic uppercase tracking-wider">
                                    No Assignment
                                </span>
                            )}
                        </td>
                        <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-1.5 max-w-[280px]">
                                {u.role === 'org_super_admin' ? (
                                    // Super Admins see all properties
                                    allProperties.map((p: any) => (
                                        <div key={p.id} className="bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md text-[9px] font-black border border-emerald-100 flex items-center gap-1">
                                            <Building2 className="w-3 h-3" />
                                            {p.name}
                                            <span className="opacity-50 text-[8px] tracking-tighter ml-1 font-bold">ALL ACCESS</span>
                                        </div>
                                    ))
                                ) : (
                                    // Others see assigned properties with their specific roles
                                    u.propertyMemberships?.map((pm: any) => (
                                        <div key={pm.property_id} className="bg-slate-50 text-slate-600 px-2 py-1 rounded-md text-[9px] font-black border border-slate-100 flex items-center gap-1 group/chip hover:bg-white transition-colors">
                                            <Building2 className="w-3 h-3 text-slate-400" />
                                            {pm.property_name}
                                            <span className="bg-slate-200 text-slate-500 px-1 py-0.5 rounded text-[8px] ml-1 uppercase letter-spacing-tight">
                                                {pm.role?.replace(/_/g, ' ')}
                                            </span>
                                        </div>
                                    ))
                                )}
                                {u.role !== 'org_super_admin' && (!u.propertyMemberships || u.propertyMemberships.length === 0) && (
                                    <span className="text-slate-300 text-[10px] italic">No directly assigned properties</span>
                                )}
                            </div>
                        </td>
                        <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                                <button onClick={() => onEdit(u)} className="p-2 text-slate-400 hover:text-emerald-600 transition-colors">
                                    <Edit className="w-4 h-4" />
                                </button>
                                <button onClick={() => onDelete(u.user_id)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

const PropertyModal = ({ property, onClose, onSave }: any) => {
    const [name, setName] = useState(property?.name || '');
    const [code, setCode] = useState(property?.code || '');
    const [address, setAddress] = useState(property?.address || '');
    const [imageUrl, setImageUrl] = useState(property?.image_url || '');
    const [validationEnabled, setValidationEnabled] = useState<boolean>(property?.validation_enabled !== false);
    const [isDragging, setIsDragging] = useState(false);

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImageUrl(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[9998] p-4">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white/90 backdrop-blur-xl rounded-[2.5rem] p-10 max-w-md w-full shadow-2xl relative overflow-hidden max-h-[85vh] overflow-y-auto custom-scrollbar border border-white/20"
            >
                <button onClick={onClose} className="absolute right-6 top-5 text-slate-300 hover:text-slate-900 transition-colors">
                    <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600">
                        <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 leading-tight">
                            {property ? 'Edit Property' : 'Add Property'}
                        </h3>
                        <p className="text-slate-400 text-sm font-medium">Define your physical asset details.</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Property Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all" placeholder="e.g. Skyline Towers" />
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Property Code</label>
                        <input type="text" value={code} onChange={e => setCode(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all" placeholder="e.g. SKY-01" />
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Address</label>
                        <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100 transition-all" placeholder="123 Main St, City" />
                    </div>

                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Property Image</label>
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={handleDrop}
                            className={`relative h-40 rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center overflow-hidden bg-slate-50 ${isDragging ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-200'
                                }`}
                        >
                            {imageUrl ? (
                                <>
                                    <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
                                    <button
                                        onClick={() => setImageUrl('')}
                                        className="absolute top-2 right-2 p-1.5 bg-rose-500 text-white rounded-full shadow-lg hover:bg-rose-600 transition-colors"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </>
                            ) : (
                                <div className="flex flex-col items-center gap-2 pointer-events-none">
                                    <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-slate-400">
                                        <Plus className="w-5 h-5" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-tight">Drop Image Here</p>
                                        <p className="text-[9px] text-slate-400 font-bold">or click to browse</p>
                                    </div>
                                </div>
                            )}
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleImageChange}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </div>
                    </div>

                    {/* Validation Flow Toggle */}
                    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <div>
                            <p className="text-sm font-black text-slate-800">Client Validation Flow</p>
                            <p className="text-xs text-slate-400 mt-0.5">When enabled, tenants must approve completed tickets before they close</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setValidationEnabled(v => !v)}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${validationEnabled ? 'bg-emerald-500' : 'bg-slate-300'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${validationEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="flex gap-3 mt-8">
                        <button onClick={onClose} className="flex-1 py-4 font-black text-slate-400 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors uppercase text-xs tracking-widest">Cancel</button>
                        <button onClick={() => onSave({ name, code, address, image_url: imageUrl, validation_enabled: validationEnabled })} className="flex-1 py-4 font-black text-white bg-slate-900 rounded-2xl hover:bg-slate-800 transition-colors shadow-lg shadow-slate-200 uppercase text-xs tracking-widest flex items-center justify-center gap-2">
                            <Check className="w-4 h-4" /> {property ? 'Update' : 'Create'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

const UserModal = ({ user, onClose, onSave, allProperties = [], orgId = '' }: any) => {
    const [fullName, setFullName] = useState(user?.user?.full_name || '');
    const [phone, setPhone] = useState(user?.user?.phone || '');
    const [orgRole, setOrgRole] = useState(user?.role || 'org_admin');

    // Property assignment state (only for property-level users)
    const isPropertyUser = !user?.role || user?.role === '';
    const currentPropIds: string[] = (user?.propertyMemberships || []).map((pm: any) => pm.property_id);
    const [assigningPropId, setAssigningPropId] = useState('');
    const [propAssignRole, setPropAssignRole] = useState('property_admin');
    const [assignedProps, setAssignedProps] = useState<{ property_id: string; property_name: string; role: string }[]>(
        (user?.propertyMemberships || []).map((pm: any) => ({
            property_id: pm.property_id,
            property_name: pm.property_name,
            role: pm.role,
        }))
    );
    const [propSaving, setPropSaving] = useState(false);
    const [propError, setPropError] = useState('');

    const unassignedProps = allProperties.filter((p: any) => !assignedProps.find(a => a.property_id === p.id));

    const handleAddProperty = async () => {
        if (!assigningPropId) return;
        setPropSaving(true);
        setPropError('');
        try {
            const res = await fetch('/api/users/assign-property', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.user_id,
                    propertyId: assigningPropId,
                    role: propAssignRole,
                    organizationId: orgId,
                    action: 'add',
                }),
            });
            const data = await res.json();
            if (!res.ok) { setPropError(data.error || 'Failed'); return; }
            const prop = allProperties.find((p: any) => p.id === assigningPropId);
            setAssignedProps(prev => [...prev, { property_id: assigningPropId, property_name: prop?.name || '', role: propAssignRole }]);
            setAssigningPropId('');
        } catch {
            setPropError('Network error');
        } finally {
            setPropSaving(false);
        }
    };

    const handleRemoveProperty = async (propId: string) => {
        setPropSaving(true);
        setPropError('');
        try {
            const res = await fetch('/api/users/assign-property', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.user_id,
                    propertyId: propId,
                    organizationId: orgId,
                    action: 'remove',
                }),
            });
            if (res.ok) {
                setAssignedProps(prev => prev.filter(p => p.property_id !== propId));
            }
        } catch {
            setPropError('Network error');
        } finally {
            setPropSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md flex items-center justify-center z-[9998] p-4">
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white/90 backdrop-blur-xl rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl relative border border-white/20 max-h-[90vh] overflow-y-auto"
            >
                <button onClick={onClose} className="absolute right-6 top-5 text-slate-300 hover:text-slate-900 transition-colors">
                    <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-4 mb-8">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-slate-900 leading-tight">Edit User</h3>
                        <p className="text-slate-400 text-sm font-medium">{user?.user?.email}</p>
                    </div>
                </div>

                <div className="space-y-5">
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Full Name</label>
                        <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
                    </div>
                    <div>
                        <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Phone Number</label>
                        <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100" />
                    </div>
                    {user?.role && (
                        <div>
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5 block">Organization Role</label>
                            <select value={orgRole} onChange={e => setOrgRole(e.target.value)} className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100 appearance-none">
                                <option value="org_super_admin">Super Admin</option>
                                <option value="org_admin">Admin</option>
                            </select>
                        </div>
                    )}

                    {/* Property Access Manager — shown for property-level users */}
                    {isPropertyUser && (
                        <div className="pt-2 border-t border-slate-100">
                            <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-3 block flex items-center gap-2">
                                <Building2 className="w-3.5 h-3.5" /> Property Access
                            </label>

                            {/* Current assignments */}
                            <div className="space-y-2 mb-3">
                                {assignedProps.length === 0 && (
                                    <p className="text-xs text-slate-400 italic">No properties assigned yet.</p>
                                )}
                                {assignedProps.map(pm => (
                                    <div key={pm.property_id} className="flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                                        <div>
                                            <span className="text-sm font-bold text-slate-800">{pm.property_name}</span>
                                            <span className="ml-2 text-[10px] font-black uppercase text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded">{pm.role?.replace(/_/g, ' ')}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveProperty(pm.property_id)}
                                            disabled={propSaving}
                                            className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-50"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            {/* Add new property */}
                            {unassignedProps.length > 0 && (
                                <div className="flex gap-2">
                                    <select
                                        value={assigningPropId}
                                        onChange={e => setAssigningPropId(e.target.value)}
                                        className="flex-1 px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-900 focus:outline-none appearance-none"
                                    >
                                        <option value="">+ Add property…</option>
                                        {unassignedProps.map((p: any) => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                    <select
                                        value={propAssignRole}
                                        onChange={e => setPropAssignRole(e.target.value)}
                                        className="px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-900 focus:outline-none appearance-none"
                                    >
                                        <option value="property_admin">Admin</option>
                                        <option value="staff">Staff</option>
                                        <option value="mst">MST</option>
                                        <option value="security">Security</option>
                                        <option value="tenant">Tenant</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={handleAddProperty}
                                        disabled={!assigningPropId || propSaving}
                                        className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-black disabled:opacity-40 hover:bg-slate-800 transition-colors"
                                    >
                                        {propSaving ? '…' : 'Add'}
                                    </button>
                                </div>
                            )}
                            {propError && <p className="text-xs text-rose-500 font-bold mt-2">{propError}</p>}
                        </div>
                    )}

                    <div className="flex gap-3 mt-8">
                        <button onClick={onClose} className="flex-1 py-4 font-black text-slate-400 bg-slate-50 rounded-2xl hover:bg-slate-100 transition-colors uppercase text-xs tracking-widest">Cancel</button>
                        <button onClick={() => onSave({ full_name: fullName, phone, orgRole })} className="flex-1 py-4 font-black text-white bg-slate-900 rounded-2xl hover:bg-slate-800 transition-colors uppercase text-xs tracking-widest">
                            Save Changes
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

const RevenueTab = ({ properties, selectedPropertyId }: { properties: any[], selectedPropertyId: string }) => {
    const [vendors, setVendors] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedProperty, setSelectedProperty] = useState(selectedPropertyId);
    const supabase = createClient();

    useEffect(() => {
        setSelectedProperty(selectedPropertyId);
    }, [selectedPropertyId]);

    useEffect(() => {
        fetchRevenueData();
    }, [selectedProperty]);

    const fetchRevenueData = async () => {
        setIsLoading(true);
        try {
            let query = supabase.from('vendors').select('*, properties(name), vendor_daily_revenue(*)');
            if (selectedProperty !== 'all') {
                query = query.eq('property_id', selectedProperty);
            }
            const { data, error } = await query;
            if (error) throw error;
            setVendors(data || []);
        } catch (err) {
            console.error('Error fetching revenue:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleExportAll = () => {
        const headers = ['Property', 'Shop Name', 'Owner', 'Commission %', 'Revenue', 'Commission Due'];
        const rows = vendors.map(v => {
            const rev = v.vendor_daily_revenue?.reduce((sum: number, r: any) => sum + r.revenue_amount, 0) || 0;
            const comm = (rev * (v.commission_rate / 100)).toFixed(2);
            return [v.properties?.name, v.shop_name, v.owner_name, v.commission_rate + '%', rev, comm];
        });

        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `organization_revenue_report.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (isLoading) return <div className="p-12 text-center text-slate-400 font-bold italic">Gathering intelligence...</div>;

    const totalRevenue = vendors.reduce((acc, v) => acc + (v.vendor_daily_revenue?.reduce((sum: number, r: any) => sum + r.revenue_amount, 0) || 0), 0);
    const totalCommission = vendors.reduce((acc, v) => {
        const rev = v.vendor_daily_revenue?.reduce((sum: number, r: any) => sum + r.revenue_amount, 0) || 0;
        return acc + (rev * (v.commission_rate / 100));
    }, 0);

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-black text-slate-900 leading-tight">Revenue Analytics</h2>
                    <p className="text-slate-500 text-sm font-medium">Cross-property financial oversight.</p>
                </div>
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <select
                        value={selectedProperty}
                        onChange={(e) => setSelectedProperty(e.target.value)}
                        className="flex-1 md:flex-none p-3.5 bg-slate-50 border border-slate-100 rounded-2xl font-black text-slate-900 text-xs focus:ring-2 focus:ring-blue-100 outline-none"
                    >
                        <option value="all">All Properties</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <button
                        onClick={handleExportAll}
                        className="p-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs hover:bg-slate-800 transition-all flex items-center gap-2"
                    >
                        <FileDown className="w-4 h-4" /> Export All
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Revenue</p>
                    <p className="text-3xl font-black text-slate-900 relative z-10">₹{totalRevenue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50/50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Commission</p>
                    <p className="text-3xl font-black text-emerald-600 relative z-10">₹{totalCommission.toLocaleString()}</p>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-100 shadow-sm relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50/50 rounded-full -mr-16 -mt-16 group-hover:scale-110 transition-transform duration-500" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 relative z-10">Total Vendors</p>
                    <p className="text-3xl font-black text-slate-900 relative z-10">{vendors.length}</p>
                </div>
            </div>

            <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Property / Shop</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Vendor</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Comm %</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Revenue</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Last Entry</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Commission</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {vendors.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-8 py-16 text-center text-slate-400 font-bold italic">No vendor data available.</td>
                                </tr>
                            ) : (
                                vendors.map((v) => {
                                    const rev = v.vendor_daily_revenue?.reduce((sum: number, r: any) => sum + r.revenue_amount, 0) || 0;
                                    const comm = rev * (v.commission_rate / 100);
                                    const lastEntry = v.vendor_daily_revenue?.reduce((latest: string | null, r: any) =>
                                        !latest || r.revenue_date > latest ? r.revenue_date : latest, null as string | null);
                                    const lastEntryDisplay = lastEntry
                                        ? new Date(lastEntry).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                                        : '—';
                                    return (
                                        <tr key={v.id} className="hover:bg-slate-50/50 transition-colors group">
                                            <td className="px-8 py-5">
                                                <div>
                                                    <p className="font-black text-slate-900 text-sm group-hover:text-blue-600 transition-colors uppercase tracking-tight">{v.shop_name}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{v.properties?.name}</p>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-sm font-bold text-slate-600">{v.owner_name}</td>
                                            <td className="px-8 py-5 text-center">
                                                <span className="px-3 py-1 bg-slate-100 rounded-lg text-[10px] font-black text-slate-500 uppercase tracking-wider">{v.commission_rate}%</span>
                                            </td>
                                            <td className="px-8 py-5 text-right font-black text-sm text-slate-900">₹{rev.toLocaleString()}</td>
                                            <td className="px-8 py-5 text-center text-xs font-bold text-slate-500">{lastEntryDisplay}</td>
                                            <td className="px-8 py-5 text-right font-black text-sm text-emerald-600">₹{comm.toLocaleString()}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const VisitorsTab = ({ properties, selectedPropertyId }: { properties: any[], selectedPropertyId: string }) => {
    const [visitors, setVisitors] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedProperty, setSelectedProperty] = useState(selectedPropertyId);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedVisitor, setSelectedVisitor] = useState<any | null>(null);
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
    const supabase = createClient();

    useEffect(() => {
        setSelectedProperty(selectedPropertyId);
    }, [selectedPropertyId]);

    useEffect(() => {
        const init = async () => {
            await fetchVisitors();
        };
        init();
    }, [selectedProperty, dateFilter]);

    const fetchVisitors = async () => {
        setIsLoading(true);
        try {
            // Use API routes (admin client) instead of direct Supabase query to avoid RLS restrictions
            const targetProperties = selectedProperty === 'all'
                ? properties.map((p: any) => p.id)
                : [selectedProperty];

            const allVisitors: any[] = [];

            for (const propId of targetProperties) {
                const params = new URLSearchParams();
                if (dateFilter !== 'all') params.set('date', dateFilter); // API uses 'date' param
                const res = await fetch(`/api/vms/${propId}?${params.toString()}`);
                if (res.ok) {
                    const data = await res.json();
                    const visitors = Array.isArray(data) ? data : (data.visitors || data.data || []);
                    // Attach property name from the properties prop
                    const prop = properties.find((p: any) => p.id === propId);
                    allVisitors.push(...visitors.map((v: any) => ({
                        ...v,
                        properties: { name: prop?.name || '' },
                    })));
                }
            }

            // Sort by checkin_time descending
            allVisitors.sort((a, b) => new Date(b.checkin_time).getTime() - new Date(a.checkin_time).getTime());
            setVisitors(allVisitors);
        } catch (err) {
            console.error('Error fetching visitors:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const filteredVisitors = visitors.filter(v =>
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.visitor_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
        link.setAttribute("download", "visitor_logs.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-5">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                <div>
                    <h2 className="text-xl font-black text-slate-900 leading-tight">Visitor Management</h2>
                    <p className="text-slate-500 text-sm font-medium">Track and manage visitors across all properties.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:flex-none">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search visitors..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full md:w-64 pl-10 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-100"
                        />
                    </div>
                    <select
                        value={selectedProperty}
                        onChange={(e) => setSelectedProperty(e.target.value)}
                        className="p-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100"
                    >
                        <option value="all">All Properties</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <select
                        value={dateFilter}
                        onChange={(e) => setDateFilter(e.target.value as any)}
                        className="p-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-emerald-100"
                    >
                        <option value="all">All Time</option>
                        <option value="today">Today</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                    </select>
                    <button
                        onClick={handleExport}
                        className="p-3 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-colors"
                    >
                        <FileDown className="w-5 h-5" />
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
                                <tr><td colSpan={5} className="p-8 text-center text-slate-400">No visitors found matching your criteria.</td></tr>
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

// ── SuperTenantOrgTab ─────────────────────────────────────────────────────────

interface STProperty { id: string; name: string; code: string; }

const SuperTenantOrgTab = ({ orgId, properties }: { orgId: string; properties: STProperty[] }) => {
    const supabase = createClient();
    const [superTenants, setSuperTenants] = useState<any[]>([]);
    const [orgUsers, setOrgUsers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');
    const [selectedPropertyIds, setSelectedPropertyIds] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const [toastMsg, setToastMsg] = useState<{ msg: string; ok: boolean } | null>(null);

    const showToast = (msg: string, ok = true) => {
        setToastMsg({ msg, ok });
        setTimeout(() => setToastMsg(null), 3000);
    };

    useEffect(() => { fetchData(); }, [orgId]);

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data: stMems } = await supabase
                .from('organization_memberships')
                .select('user_id, users(id, full_name, email)')
                .eq('organization_id', orgId)
                .eq('role', 'super_tenant')
                .eq('is_active', true);

            const enriched = await Promise.all(
                (stMems || []).map(async (row: any) => {
                    const { data: props } = await supabase
                        .from('super_tenant_properties')
                        .select('property_id, properties(name, code)')
                        .eq('user_id', row.user_id);
                    return { ...row, assignedProperties: props || [] };
                })
            );
            setSuperTenants(enriched);

            const { data: members } = await supabase
                .from('organization_memberships')
                .select('user_id, role, users(id, full_name, email)')
                .eq('organization_id', orgId)
                .eq('is_active', true)
                .neq('role', 'super_tenant');
            setOrgUsers((members || []).map((m: any) => m.users).filter(Boolean));
        } catch (err) {
            console.error('[SuperTenantOrgTab] fetch error', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAssign = async () => {
        if (!selectedUserId || selectedPropertyIds.length === 0) {
            showToast('Select a user and at least one property.', false);
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch('/api/super-tenant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: selectedUserId, organization_id: orgId, property_ids: selectedPropertyIds }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            showToast('Super Tenant assigned successfully.');
            setShowModal(false);
            setSelectedUserId('');
            setSelectedPropertyIds([]);
            fetchData();
        } catch (err: any) {
            showToast(err.message || 'Failed to assign', false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleRemove = async (userId: string, propertyId: string) => {
        if (!confirm('Remove this property from the super tenant?')) return;
        const res = await fetch('/api/super-tenant', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, property_id: propertyId }),
        });
        if (res.ok) { showToast('Property removed.'); fetchData(); }
        else showToast('Failed to remove.', false);
    };

    const toggleProp = (id: string) =>
        setSelectedPropertyIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-slate-900">Super Tenants</h2>
                    <p className="text-sm text-slate-500 mt-0.5">Assign cross-property analytics access to tenant accounts</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 text-white font-bold text-xs rounded-xl uppercase tracking-widest hover:bg-violet-700 transition-all shadow-lg shadow-violet-200"
                >
                    <Plus className="w-4 h-4" /> Assign Super Tenant
                </button>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-2xl bg-violet-50 border border-violet-200 text-violet-700">
                <Key className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs font-semibold leading-relaxed">
                    Super Tenants have read-only access to view and analyze all tickets across their assigned properties. They cannot create tickets, manage users, or access admin settings.
                </p>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : superTenants.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl">
                    <Key className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                    <p className="text-sm font-semibold text-slate-500">No super tenant accounts yet.</p>
                    <p className="text-xs text-slate-400 mt-1">Click "Assign Super Tenant" to get started.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {superTenants.map((st, i) => (
                        <div key={i} className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center text-violet-700 font-black text-sm">
                                        {st.users?.full_name?.[0]?.toUpperCase() || 'S'}
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-900 text-sm">{st.users?.full_name || '—'}</p>
                                        <p className="text-xs text-slate-500">{st.users?.email}</p>
                                    </div>
                                </div>
                                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-violet-100 text-violet-700 tracking-widest">
                                    Super Tenant
                                </span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {st.assignedProperties.map((ap: any) => (
                                    <div key={ap.property_id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">
                                        <Building2 className="w-3 h-3 text-slate-400" />
                                        {ap.properties?.name || ap.property_id}
                                        <button onClick={() => handleRemove(st.user_id, ap.property_id)} className="ml-1 text-slate-400 hover:text-red-500 transition-colors">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                {st.assignedProperties.length === 0 && <span className="text-xs text-slate-400 italic">No properties assigned</span>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <AnimatePresence>
                {showModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                        onClick={() => setShowModal(false)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-5">
                            <div className="flex items-center justify-between">
                                <h3 className="font-black text-slate-900 text-lg">Assign Super Tenant</h3>
                                <button onClick={() => setShowModal(false)} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Select User</label>
                                <select value={selectedUserId} onChange={e => setSelectedUserId(e.target.value)}
                                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-violet-500">
                                    <option value="">— Choose user —</option>
                                    {orgUsers.map((u: any) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Assign Properties</label>
                                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-3">
                                    {properties.length === 0 && <p className="text-xs text-slate-400 text-center py-4">No properties found.</p>}
                                    {properties.map(prop => (
                                        <label key={prop.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                                            <input type="checkbox" checked={selectedPropertyIds.includes(prop.id)} onChange={() => toggleProp(prop.id)} className="w-4 h-4 rounded accent-violet-600" />
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{prop.name}</p>
                                                <p className="text-[10px] font-mono text-slate-400">{prop.code}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                                {selectedPropertyIds.length > 0 && <p className="text-xs font-semibold text-violet-600">{selectedPropertyIds.length} propert{selectedPropertyIds.length > 1 ? 'ies' : 'y'} selected</p>}
                            </div>
                            <button onClick={handleAssign} disabled={isSaving || !selectedUserId || selectedPropertyIds.length === 0}
                                className="w-full py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                                {isSaving ? 'Assigning...' : 'Assign Super Tenant Role & Properties'}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {toastMsg && (
                    <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]">
                        <div className={`px-6 py-3 rounded-2xl shadow-2xl font-bold text-sm border ${toastMsg.ok ? 'bg-emerald-900 border-emerald-500/50 text-emerald-50' : 'bg-rose-900 border-rose-500/50 text-rose-50'}`}>
                            {toastMsg.msg}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

// ── Property Selector Pill (used inside SOPDashboard header slot) ──
function PropertySelectorPill({ properties, selectedId, isOpen, onToggle, onSelect, onClose }: {
    properties: { id: string; name: string; code: string; image_url?: string }[];
    selectedId: string;
    isOpen: boolean;
    onToggle: () => void;
    onSelect: (id: string) => void;
    onClose: () => void;
}) {
    const selected = properties.find(p => p.id === selectedId);
    return (
        <div className="relative">
            <button
                onClick={onToggle}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-xl hover:bg-slate-200 transition-all"
            >
                <div className="w-4 h-4 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                    {selectedId === 'all'
                        ? <LayoutDashboard className="w-3.5 h-3.5 text-slate-500" />
                        : selected?.image_url
                            ? <img src={selected.image_url} alt="" className="w-full h-full object-cover rounded" />
                            : <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    }
                </div>
                <span className="text-[11px] font-black text-slate-700 max-w-[90px] truncate">
                    {selectedId === 'all' ? 'All Properties' : selected?.name}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <AnimatePresence>
                {isOpen && (
                    <>
                        <div className="fixed inset-0 z-[60]" onClick={onClose} />
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 8, scale: 0.95 }}
                            transition={{ duration: 0.15 }}
                            className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-2xl border border-slate-200 z-[70] overflow-hidden"
                        >
                            <div className="p-2 border-b border-slate-100">
                                <button
                                    onClick={() => onSelect('all')}
                                    className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${selectedId === 'all' ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                                >
                                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                                        <LayoutDashboard className="w-4 h-4 text-slate-500" />
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-black uppercase tracking-tight">All Properties</p>
                                        <p className="text-[10px] opacity-70 font-medium">{properties.length} Locations</p>
                                    </div>
                                </button>
                            </div>
                            <div className="max-h-60 overflow-y-auto p-2 space-y-1">
                                {properties.map(prop => (
                                    <button
                                        key={prop.id}
                                        onClick={() => onSelect(prop.id)}
                                        className={`w-full flex items-center gap-3 p-2 rounded-xl transition-colors ${selectedId === prop.id ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                                            {prop.image_url
                                                ? <img src={prop.image_url} alt="" className="w-full h-full object-cover" />
                                                : <Building2 className="w-4 h-4 text-slate-400" />
                                            }
                                        </div>
                                        <div className="text-left overflow-hidden">
                                            <p className="text-xs font-black uppercase tracking-tight truncate">{prop.name}</p>
                                            <p className="text-[10px] opacity-70 font-bold uppercase tracking-widest">{prop.code}</p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp Summary Card — shown at the top of the Reports tab
// ─────────────────────────────────────────────────────────────────────────────
function WhatsAppSummaryCard({
    organizationId,
    propertyId,
}: {
    organizationId: string;
    propertyId?: string;
}) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [info, setInfo] = useState<{ recipients: number; open_tickets: number } | null>(null);
    const [errorMsg, setErrorMsg] = useState('');

    const handleSend = async () => {
        setStatus('loading');
        setInfo(null);
        setErrorMsg('');
        try {
            const res = await fetch('/api/reports/send-whatsapp-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ organizationId, propertyId }),
            });
            const data = await res.json();
            if (!res.ok) {
                setErrorMsg(data.error || 'Failed to send report');
                setStatus('error');
            } else {
                setInfo({ recipients: data.recipients, open_tickets: data.open_tickets });
                setStatus('success');
                // Auto-reset after 8 seconds
                setTimeout(() => setStatus('idle'), 8000);
            }
        } catch {
            setErrorMsg('Network error. Please try again.');
            setStatus('error');
        }
    };

    return (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Icon + text */}
            <div className="flex items-center gap-4 flex-1">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <MessageCircle className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                    <p className="text-sm font-black text-slate-900">Send Ticket Report on WhatsApp</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Sends a live open-tickets summary to all Org Super Admins via WhatsApp instantly.
                    </p>
                    {status === 'success' && info && (
                        <p className="text-xs text-emerald-600 font-bold mt-1">
                            ✅ Sent to {info.recipients} admin{info.recipients !== 1 ? 's' : ''} — {info.open_tickets} open ticket{info.open_tickets !== 1 ? 's' : ''} reported.
                        </p>
                    )}
                    {status === 'error' && (
                        <p className="text-xs text-rose-500 font-bold mt-1">❌ {errorMsg}</p>
                    )}
                </div>
            </div>

            {/* Button */}
            <button
                onClick={handleSend}
                disabled={status === 'loading'}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all duration-200 flex-shrink-0"
            >
                {status === 'loading' ? (
                    <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                    </>
                ) : (
                    <>
                        <Send className="w-4 h-4" />
                        Send Report
                    </>
                )}
            </button>
        </div>
    );
}

export default OrgAdminDashboard;
