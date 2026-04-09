/**
 * OrgPropertyDashboard
 * Combined view of organization and selected property dashboard data.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
    ArrowLeft, Users, Building2, AlertCircle, TrendingUp,
    Activity, Plus, Database, Zap, UserX, UserMinus, Ticket, Settings,
    Package, Calendar, ChevronDown, ChevronUp, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CreatePropertyModal from './CreatePropertyModal';
import PropertyFeaturesModal from './PropertyFeaturesModal';

interface Property {
    id: string;
    name: string;
    code: string;
    status: string;
    user_count: number;
    active_user_count: number;
    open_tickets_count: number;
    created_at: string;
}

interface Organization {
    id: string;
    name: string;
    code: string;
}

interface OrgMetrics {
    total_users: number;
    user_status: {
        active: number;
        inactive: number;
        dead: number;
    };
    properties: number;
    storage_used_gb: number;
    storage_percentage: number;
    db_load_req_per_sec: number;
}

interface ModuleUsage {
    name: string;
    displayName: string;
    activeUsers: number;
    totalUses: number;
    adoptionRate: string;
    lastUsed: string;
}

interface Props {
    organization: Organization;
    onBack: () => void;
}

const OrgPropertyDashboard: React.FC<Props> = ({ organization, onBack }) => {
    const [properties, setProperties] = useState<Property[]>([]);
    const [metrics, setMetrics] = useState<OrgMetrics | null>(null);
    const [modules, setModules] = useState<ModuleUsage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [expandedUsers, setExpandedUsers] = useState(false);
    const [showFeaturesModal, setShowFeaturesModal] = useState(false);
    const [selectedPropertyForFeatures, setSelectedPropertyForFeatures] = useState<{ id: string, name: string } | null>(null);

    useEffect(() => {
        fetchAllData();
    }, [organization.id]);

    const fetchAllData = async () => {
        await Promise.all([
            fetchProperties(),
            fetchMetrics(),
            fetchModules()
        ]);
    };

    const fetchProperties = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/admin/organizations/${organization.id}/properties`);
            if (response.ok) {
                const data = await response.json();
                setProperties(data);
            }
        } catch (error) {
            console.error('Error fetching properties:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchMetrics = async () => {
        try {
            const response = await fetch(`/api/admin/organizations/${organization.id}/metrics`);
            if (response.ok) {
                const data = await response.json();
                setMetrics(data);
            }
        } catch (error) {
            console.error('Error fetching metrics:', error);
        }
    };

    const fetchModules = async () => {
        try {
            const response = await fetch(`/api/admin/organizations/${organization.id}/modules`);
            if (response.ok) {
                const data = await response.json();
                setModules(data.modules || []);
            }
        } catch (error) {
            console.error('Error fetching modules:', error);
        }
    };

    const handlePropertyCreated = (property: any) => {
        // Reload page to refresh all data
        window.location.reload();
    };

    const getModuleIcon = (moduleName: string) => {
        switch (moduleName) {
            case 'ticketing': return Ticket;
            case 'vendor_management': return Package;
            case 'hot_desking': return Calendar;
            default: return Activity;
        }
    };

    return (
        <div className="space-y-8">
            {/* Header with Back Button */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={onBack}
                        className="p-3 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-slate-600" />
                    </button>
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 tracking-tight">
                            {organization.name}
                        </h2>
                        <p className="text-slate-400 text-sm font-medium mt-1">
                            /{organization.code} • Organization Dashboard
                        </p>
                    </div>
                </div>
            </div>

            {/* KEY METRICS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Total Users - Expandable */}
                <div className="bg-white px-6 py-7 rounded-3xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center">
                            <Users className="w-6 h-6 text-emerald-600" />
                        </div>
                        <button
                            onClick={() => setExpandedUsers(!expandedUsers)}
                            className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            {expandedUsers ? (
                                <ChevronUp className="w-4 h-4 text-slate-400" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                            )}
                        </button>
                    </div>
                    <p className="text-4xl font-black text-slate-900 mb-1">
                        {metrics?.total_users || 0}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Total Users
                    </p>

                    {/* Property Breakdown */}
                    <AnimatePresence>
                        {expandedUsers && properties.length > 0 && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="mt-4 pt-4 border-t border-slate-100 space-y-2"
                            >
                                {properties.map((prop) => {
                                    const percentage = metrics?.total_users
                                        ? ((prop.user_count / metrics.total_users) * 100).toFixed(1)
                                        : 0;
                                    return (
                                        <div key={prop.id} className="flex items-center justify-between text-xs">
                                            <span className="font-bold text-slate-600">{prop.name}</span>
                                            <span className="font-black text-emerald-600">
                                                {prop.user_count} ({percentage}%)
                                            </span>
                                        </div>
                                    );
                                })}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* DB Load */}
                <div className="bg-white px-6 py-7 rounded-3xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                            <Zap className="w-6 h-6 text-indigo-600" />
                        </div>
                    </div>
                    <p className="text-4xl font-black text-slate-900 mb-1">
                        {metrics?.db_load_req_per_sec || 0} <span className="text-lg">req/s</span>
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        DB Load
                    </p>
                </div>

                {/* Storage Used */}
                <div className="bg-white px-6 py-7 rounded-3xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
                            <Database className="w-6 h-6 text-blue-600" />
                        </div>
                    </div>
                    <p className="text-4xl font-black text-slate-900 mb-1">
                        {metrics?.storage_used_gb || 0} <span className="text-lg">GB</span>
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Storage ({metrics?.storage_percentage || 0}%)
                    </p>
                </div>
            </div>

            {/* USER STATUS ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Inactive Users */}
                <div className="bg-white px-6 py-7 rounded-3xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center">
                            <UserMinus className="w-6 h-6 text-orange-600" />
                        </div>
                    </div>
                    <p className="text-4xl font-black text-slate-900 mb-1">
                        {metrics?.user_status.inactive || 0}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Inactive Users (30+ days)
                    </p>
                </div>

                {/* Dead Users */}
                <div className="bg-white px-6 py-7 rounded-3xl border border-slate-100 shadow-sm">
                    <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-rose-50 flex items-center justify-center">
                            <UserX className="w-6 h-6 text-rose-600" />
                        </div>
                    </div>
                    <p className="text-4xl font-black text-slate-900 mb-1">
                        {metrics?.user_status.dead || 0}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Dead Users (60+ days, never logged in)
                    </p>
                </div>
            </div>

            {/* MODULE USAGE ROW */}
            {modules.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {modules.map((module) => {
                        const Icon = getModuleIcon(module.name);
                        return (
                            <div key={module.name} className="bg-white px-6 py-7 rounded-3xl border border-slate-100 shadow-sm">
                                <div className="flex justify-between items-start mb-6">
                                    <div className="w-12 h-12 rounded-2xl bg-purple-50 flex items-center justify-center">
                                        <Icon className="w-6 h-6 text-purple-600" />
                                    </div>
                                </div>
                                <p className="text-4xl font-black text-slate-900 mb-1">
                                    {module.activeUsers}
                                </p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                    {module.displayName}
                                </p>
                                <p className="text-xs font-bold text-purple-600">
                                    {module.adoptionRate}% adoption • {module.totalUses} uses
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Properties Section */}
            <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                <div className="px-8 py-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                    <h3 className="text-xl font-black text-slate-900">Properties ({properties.length})</h3>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        Create Property
                    </button>
                </div>
                <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Property</th>
                            <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Users</th>
                            <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Active</th>
                            <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tickets</th>
                            <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Status</th>
                            <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Operations</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {isLoading ? (
                            <tr>
                                <td colSpan={6} className="px-8 py-12 text-center text-slate-400">
                                    Loading properties...
                                </td>
                            </tr>
                        ) : properties.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="px-8 py-12 text-center">
                                    <p className="text-slate-400 mb-4">No properties found</p>
                                    <button
                                        onClick={() => setShowCreateModal(true)}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Create First Property
                                    </button>
                                </td>
                            </tr>
                        ) : (
                            properties.map((property) => (
                                <tr key={property.id} className="group hover:bg-slate-50/50 transition-colors">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-white text-xs font-bold">
                                                {property.name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 text-sm leading-none mb-1">
                                                    {property.name}
                                                </p>
                                                <p className="text-xs text-slate-400 font-medium">/{property.code}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="text-sm font-black text-slate-700">{property.user_count}</span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="text-sm font-bold text-emerald-600">{property.active_user_count}</span>
                                    </td>
                                    <td className="px-8 py-6">
                                        {property.open_tickets_count > 0 ? (
                                            <span className="text-sm font-bold text-rose-600">{property.open_tickets_count}</span>
                                        ) : (
                                            <span className="text-sm font-medium text-slate-400">0</span>
                                        )}
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${property.status === 'active'
                                            ? 'bg-emerald-50 text-emerald-600 border-emerald-100'
                                            : 'bg-slate-50 text-slate-400 border-slate-100'
                                            }`}>
                                            {property.status === 'active' ? 'Active' : 'Inactive'}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <button
                                            onClick={() => {
                                                setSelectedPropertyForFeatures({ id: property.id, name: property.name });
                                                setShowFeaturesModal(true);
                                            }}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl hover:bg-slate-800 transition-all text-[10px] font-black uppercase tracking-widest shadow-sm hover:shadow-md active:scale-95"
                                            title="Configure Property Features & Analytics"
                                        >
                                            <Settings className="w-3.5 h-3.5" />
                                            Configure
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create Property Modal */}
            {showCreateModal && (
                <CreatePropertyModal
                    organizationId={organization.id}
                    onClose={() => setShowCreateModal(false)}
                    onSuccess={handlePropertyCreated}
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
                    }}
                />
            )}
        </div>
    );
};

export default OrgPropertyDashboard;
