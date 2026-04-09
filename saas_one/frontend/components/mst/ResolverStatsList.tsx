/**
 * ResolverStatsList
 * Admin panel listing all active MST resolvers and their assignments.
 * Fetches resolver entries with user, property, and skill group details.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/frontend/utils/supabase/client';
import { Trash2, User, Building, Wrench, Loader2, Search, AlertCircle, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ResolverEntry {
    id: string;
    user_id: string;
    property_id: string;
    skill_group_id: string;
    user: {
        full_name: string;
        email: string;
    };
    property: {
        name: string;
    };
    skill_group: {
        name: string;
        code: string;
    };
}

const ResolverStatsList = () => {
    const [entries, setEntries] = useState<ResolverEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const supabase = createClient();

    const fetchEntries = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/admin/resolver-stats');
            if (!response.ok) {
                throw new Error('Failed to fetch resolver stats');
            }
            const data = await response.json();
            setEntries(data || []);
        } catch (error) {
            console.error('Failed to fetch resolver stats:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchEntries();
    }, []);

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to remove ${name} from the resolver list?`)) return;

        setIsDeleting(id);
        try {
            const res = await fetch(`/api/admin/resolver-stats/${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                setEntries(prev => prev.filter(e => e.id !== id));
            } else {
                const data = await res.json();
                alert(data.error || 'Failed to delete entry');
            }
        } catch (error) {
            console.error('Delete error:', error);
            alert('Network error occurred');
        } finally {
            setIsDeleting(null);
        }
    };

    const filteredEntries = entries.filter(e => {
        const query = searchQuery.toLowerCase();
        return (
            (e.user?.full_name?.toLowerCase().includes(query) || false) ||
            (e.user?.email?.toLowerCase().includes(query) || false) ||
            (e.property?.name?.toLowerCase().includes(query) || false) ||
            (e.skill_group?.name?.toLowerCase().includes(query) || false) ||
            (e.skill_group?.code?.toLowerCase().includes(query) || false)
        );
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <Wrench className="w-5 h-5 text-primary" />
                        Resolver Management
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-1 uppercase tracking-wider">
                        View and manage active resolvers across all properties
                    </p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Filter resolvers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                        />
                    </div>
                    <button
                        onClick={fetchEntries}
                        className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                        title="Refresh List"
                    >
                        <RefreshCcw className={`w-4 h-4 text-slate-600 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            <div className="flex items-center gap-2 px-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Showing {filteredEntries.length} of {entries.length} Resolvers
                </span>
                {searchQuery && (
                    <button
                        onClick={() => setSearchQuery('')}
                        className="text-[10px] font-bold text-primary hover:underline"
                    >
                        Clear Filter
                    </button>
                )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Resolver</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Property</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Skill Group</th>
                                <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            <AnimatePresence mode="popLayout">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center">
                                            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
                                            <p className="text-sm text-slate-500 font-medium">Loading resolver profiles...</p>
                                        </td>
                                    </tr>
                                ) : filteredEntries.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center">
                                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <AlertCircle className="w-6 h-6 text-slate-400" />
                                            </div>
                                            <p className="text-sm text-slate-500 font-medium">No resolvers found matching your criteria</p>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredEntries.map((entry) => (
                                        <motion.tr
                                            key={entry.id}
                                            layout
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            className="hover:bg-slate-50/50 transition-colors"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center border border-slate-200 overflow-hidden">
                                                        <User className="w-5 h-5 text-slate-400" />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-900">{entry.user?.full_name || 'Unknown User'}</p>
                                                        <p className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]">{entry.user?.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <Building className="w-4 h-4 text-slate-400" />
                                                    <span className="text-sm font-semibold text-slate-700">{entry.property?.name || 'Unknown Property'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-primary/10 text-primary rounded-lg">
                                                    <Wrench className="w-3.5 h-3.5" />
                                                    <span className="text-[11px] font-black uppercase tracking-wider">{entry.skill_group?.name || entry.skill_group?.code}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <button
                                                    onClick={() => handleDelete(entry.id, entry.user?.full_name)}
                                                    disabled={isDeleting === entry.id}
                                                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Remove Resolver"
                                                >
                                                    {isDeleting === entry.id ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Trash2 className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </td>
                                        </motion.tr>
                                    ))
                                )}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ResolverStatsList;
