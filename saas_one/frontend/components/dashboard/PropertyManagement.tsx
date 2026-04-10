/**
 * PropertyManagement
 * Property list and management interface within the dashboard.
 * @remarks Client component.
 */

'use client';

import React, { useState } from 'react';
import {
    Building2, Plus, Search, Filter,
    MapPin, Users, LayoutDashboard, Edit2, X,
    CheckCircle2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';

interface Property {
    id: string;
    name: string;
    code: string;
    location?: string;
    units?: number;
    floors?: number;
    status: string;
    type?: string;
    approver?: string | null;
}

interface PropertyManagementProps {
    orgId: string;
    properties: Property[];
    onRefresh: () => void;
}

const PropertyManagement = ({ orgId, properties, onRefresh }: PropertyManagementProps) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingProperty, setEditingProperty] = useState<Property | null>(null);

    const filteredProperties = properties.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.code.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* ... header ... */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">Property Management</h1>
                    <p className="text-zinc-500 font-medium mt-1">Manage and monitor all entities within your organization.</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-2 px-6 py-3 bg-[#3b82f6] hover:bg-blue-600 text-white font-black rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-95"
                >
                    <Plus className="w-5 h-5" />
                    <span>Add Property</span>
                </button>
            </div>

            {/* ... search ... */}
            <div className="flex flex-wrap gap-4 items-center bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800/50 backdrop-blur-md">
                <div className="relative flex-1 min-w-[280px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search by name, code or location..."
                        className="w-full pl-12 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-medium text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <button className="flex items-center gap-2 px-5 py-3 bg-zinc-950 border border-zinc-800 text-zinc-400 font-bold text-sm rounded-xl hover:text-white transition-colors">
                    <Filter className="w-4 h-4" />
                    Filters
                </button>
            </div>

            {/* Property Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredProperties.map((prop, idx) => (
                    <motion.div
                        key={prop.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-[#18181b] border border-zinc-800/50 rounded-3xl p-6 hover:border-blue-500/50 transition-all group overflow-hidden relative"
                    >
                        <div className="flex justify-between items-start mb-6">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                                    <Building2 className="w-6 h-6" />
                                </div>
                                <div className="space-y-0.5">
                                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                        {prop.name}
                                        <Edit2
                                            className="w-3 h-3 text-zinc-600 hover:text-white cursor-pointer"
                                            onClick={() => setEditingProperty(prop)}
                                        />
                                    </h3>
                                    <p className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Code: {prop.code}</p>
                                </div>
                            </div>
                            <span className="px-3 py-1 bg-blue-500/10 text-blue-500 text-[10px] font-black rounded-full uppercase tracking-wider border border-blue-500/20">
                                {prop.status}
                            </span>
                        </div>

                        {/* ... stats ... */}
                        <div className="space-y-4 mb-8 text-zinc-400">
                            <div className="flex items-center gap-2">
                                <MapPin size={14} className="text-zinc-600" />
                                <span className="text-xs italic">{prop.location || 'Location Pending'}</span>
                            </div>
                            <div className="flex gap-6">
                                <div className="flex items-center gap-2">
                                    <Users size={14} className="text-zinc-600" />
                                    <span className="text-xs font-bold text-zinc-300">{prop.units || 0} U</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <LayoutDashboard size={14} className="text-zinc-600" />
                                    <span className="text-xs font-bold text-zinc-300">{prop.floors || 0} F</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-6 border-t border-zinc-800/50">
                            <button className="w-full py-3 bg-zinc-950 border border-zinc-800 hover:border-blue-500/50 text-white font-black text-[10px] rounded-2xl uppercase tracking-[0.2em] transition-all">
                                Launch Dashboard
                            </button>
                        </div>
                    </motion.div>
                ))}
            </div>

            <AnimatePresence>
                {showCreateModal && (
                    <CreatePropertyModal
                        orgId={orgId}
                        onClose={() => setShowCreateModal(false)}
                        onCreated={onRefresh}
                    />
                )}
                {editingProperty && (
                    <EditPropertyModal
                        property={editingProperty}
                        onClose={() => setEditingProperty(null)}
                        onUpdated={onRefresh}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

// Create Property Modal
const CreatePropertyModal = ({ orgId, onClose, onCreated }: {
    orgId: string;
    onClose: () => void;
    onCreated: () => void;
}) => {
    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [location, setLocation] = useState('');
    const [type, setType] = useState('Commercial');
    const [isCreating, setIsCreating] = useState(false);
    const [created, setCreated] = useState(false);
    const supabase = createClient();

    const handleCreate = async () => {
        if (!name || !code) return;

        setIsCreating(true);

        const { error } = await supabase.from('properties').insert({
            organization_id: orgId,
            name,
            code: code.toLowerCase().replace(/\s+/g, '-'),
            status: 'active'
        });

        setIsCreating(false);

        if (!error) {
            setCreated(true);
            setTimeout(() => {
                onCreated();
                onClose();
            }, 1500);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar"
            >
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="text-2xl font-black text-white mb-1">Add Property</h3>
                        <p className="text-sm text-zinc-500">Create a new property entity.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors">
                        <X className="w-5 h-5 text-zinc-400" />
                    </button>
                </div>

                {created ? (
                    <div className="text-center py-8">
                        <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                        <h4 className="text-xl font-black text-white">Property Created!</h4>
                        <p className="text-zinc-500 mt-2">Invite link: /join/{code}</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-bold text-zinc-300">Property Name*</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => {
                                    setName(e.target.value);
                                    setCode(e.target.value.toUpperCase().replace(/\s+/g, '-').substring(0, 10));
                                }}
                                placeholder="e.g. SS Plaza Tower A"
                                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-zinc-300">Property Code*</label>
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                placeholder="e.g. SS-PLAZA-A"
                                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 font-mono"
                            />
                            <p className="text-xs text-zinc-600">Used in invite links: /join/{code || 'CODE'}</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-zinc-300">Location</label>
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => setLocation(e.target.value)}
                                placeholder="e.g. Bangalore, Karnataka"
                                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-zinc-300">Type</label>
                            <select
                                value={type}
                                onChange={(e) => setType(e.target.value)}
                                className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white focus:outline-none"
                            >
                                <option value="Commercial">Commercial</option>
                                <option value="Residential">Residential</option>
                                <option value="Mixed Use">Mixed Use</option>
                                <option value="Industrial">Industrial</option>
                            </select>
                        </div>

                        <button
                            onClick={handleCreate}
                            disabled={isCreating || !name || !code}
                            className="w-full py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isCreating ? 'Creating...' : 'Create Property'}
                        </button>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};

// Edit Property Modal
const EditPropertyModal = ({ property, onClose, onUpdated }: {
    property: Property;
    onClose: () => void;
    onUpdated: () => void;
}) => {
    const [name, setName] = useState(property.name);
    const [status, setStatus] = useState(property.status);
    const [isUpdating, setIsUpdating] = useState(false);
    const supabase = createClient();

    const handleUpdate = async () => {
        setIsUpdating(true);
        const { error } = await supabase
            .from('properties')
            .update({ name, status })
            .eq('id', property.id);

        setIsUpdating(false);
        if (!error) {
            onUpdated();
            onClose();
        }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-md w-full">
                <h3 className="text-2xl font-black text-white mb-6">Edit Property</h3>
                <div className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Name</label>
                        <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-zinc-500 uppercase tracking-widest">Status</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white outline-none"
                        >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="maintenance">Maintenance</option>
                        </select>
                    </div>
                    <div className="flex gap-4 pt-4">
                        <button onClick={onClose} className="flex-1 py-3 border border-zinc-800 rounded-xl text-zinc-500 font-bold hover:bg-zinc-800 transition-all">Cancel</button>
                        <button onClick={handleUpdate} disabled={isUpdating} className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/20">
                            {isUpdating ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default PropertyManagement;
