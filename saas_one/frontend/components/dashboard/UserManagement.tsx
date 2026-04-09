/**
 * UserManagement
 * User list and management within a property or organization.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
    Users, Search, Filter, Plus, MoreVertical,
    ShieldCheck, ShieldAlert, UserPlus, XCircle,
    Mail, Phone, ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/frontend/utils/supabase/client';

interface OrgUser {
    id: string;
    full_name: string;
    email: string;
    role: string;
    is_active: boolean;
    joined_at: string;
}

const UserManagement = ({ orgId }: { orgId: string }) => {
    const [users, setUsers] = useState<OrgUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const supabase = createClient();

    useEffect(() => {
        fetchOrgUsers();
    }, [orgId]);

    const fetchOrgUsers = async () => {
        setIsLoading(true);
        // Fetch users joined with organization_memberships
        const { data, error } = await supabase
            .from('organization_memberships')
            .select(`
        role,
        is_active,
        created_at,
        users (
          id,
          full_name,
          email
        )
      `)
            .eq('organization_id', orgId);

        if (!error && data) {
            const formattedUsers: OrgUser[] = data.map((item: any) => ({
                id: item.users.id,
                full_name: item.users.full_name,
                email: item.users.email,
                role: item.role,
                is_active: item.is_active,
                joined_at: item.created_at
            })).sort((a, b) => a.full_name.localeCompare(b.full_name));
            setUsers(formattedUsers);
        }
        setIsLoading(false);
    };

    const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
        const { error } = await supabase
            .from('organization_memberships')
            .update({ is_active: !currentStatus })
            .eq('user_id', userId)
            .eq('organization_id', orgId);

        if (!error) fetchOrgUsers();
    };

    const handleUpdateRole = async (userId: string, newRole: string) => {
        const { error } = await supabase
            .from('organization_memberships')
            .update({ role: newRole })
            .eq('user_id', userId)
            .eq('organization_id', orgId);

        if (!error) fetchOrgUsers();
    };

    const filteredUsers = users.filter(u =>
        u.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight">User Management</h1>
                    <p className="text-zinc-500 font-medium mt-1">Manage permissions and access for your organization members.</p>
                </div>
                <button className="flex items-center gap-2 px-6 py-3 bg-[#3b82f6] hover:bg-blue-600 text-white font-black rounded-xl transition-all shadow-lg shadow-blue-900/20 active:scale-95">
                    <UserPlus className="w-5 h-5" />
                    <span>Invite Member</span>
                </button>
            </div>

            <div className="flex flex-wrap gap-4 items-center bg-zinc-900/50 p-6 rounded-3xl border border-zinc-800/50 backdrop-blur-md">
                <div className="relative flex-1 min-w-[280px]">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search by name or email..."
                        className="w-full pl-12 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-sm font-medium text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
                <button className="px-5 py-3 bg-zinc-950 border border-zinc-800 text-zinc-400 font-bold text-sm rounded-xl hover:text-white transition-colors flex items-center gap-2">
                    <Filter className="w-4 h-4" />
                    Role Filter
                </button>
            </div>

            <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-[32px] overflow-hidden backdrop-blur-sm">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-zinc-800/50">
                            <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Member</th>
                            <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Role</th>
                            <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Status</th>
                            <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Joined At</th>
                            <th className="px-8 py-5 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/30">
                        {isLoading ? (
                            <tr>
                                <td colSpan={5} className="px-8 py-12 text-center text-zinc-500 italic">
                                    Loading directory...
                                </td>
                            </tr>
                        ) : filteredUsers.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-8 py-12 text-center text-zinc-500 italic">
                                    No members found.
                                </td>
                            </tr>
                        ) : (
                            filteredUsers.map((user) => (
                                <tr key={user.id} className="group hover:bg-white/[0.02] transition-colors">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:scale-110 transition-transform">
                                                <Users className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-white text-sm">{user.full_name}</p>
                                                <p className="text-xs text-zinc-500">{user.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <select
                                            value={user.role}
                                            onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                                            className="bg-transparent text-xs font-black text-white uppercase tracking-widest border-none focus:ring-0 cursor-pointer hover:text-blue-400 transition-colors"
                                        >
                                            <option value="org_super_admin">Super Admin</option>
                                            <option value="property_admin">Property Admin</option>
                                            <option value="staff">Staff</option>
                                            <option value="tenant">Client</option>
                                            <option value="vendor">Food Vendor</option>
                                        </select>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border ${user.is_active
                                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                            : 'bg-rose-500/10 text-rose-500 border-rose-500/20 animate-pulse'
                                            }`}>
                                            {user.is_active ? 'Active' : 'Suspended'}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <span className="text-xs font-medium text-zinc-500">
                                            {new Date(user.joined_at).toLocaleDateString()}
                                        </span>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleToggleStatus(user.id, user.is_active)}
                                                className={`p-2 rounded-lg border transition-all ${user.is_active
                                                    ? 'text-rose-400 border-rose-400/20 hover:bg-rose-400/10'
                                                    : 'text-emerald-400 border-emerald-400/20 hover:bg-emerald-400/10'
                                                    }`}
                                                title={user.is_active ? 'Suspend' : 'Activate'}
                                            >
                                                {user.is_active ? <XCircle size={16} /> : <ShieldCheck size={16} />}
                                            </button>
                                            <button className="p-2 text-zinc-500 hover:text-white transition-colors">
                                                <MoreVertical size={16} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default UserManagement;
