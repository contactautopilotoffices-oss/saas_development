/**
 * UserManagementTable
 * Sortable, filterable table of users with role editing.
 * @remarks Client component.
 */

'use client';

/**
 * User management table component with role display and status controls.
 *
 * Fetches all users for the current user's property on mount and renders them
 * in a sortable table showing full name, email, role badge, property ID, and
 * account status. Authenticated admins can toggle any user's status between
 * `active` and `suspended` via the "Suspend / Activate" action, gated behind
 * the `users.suspend` capability.
 *
 * Shows an animated skeleton loading state while data is being fetched.
 *
 * @module UserManagementTable
 * @see userService
 * @see authService
 * @see CapabilityWrapper
 */

import React, { useEffect, useState } from 'react';
import { User, RoleKey, RoleLevel } from '@/frontend/types/rbac';
import { userService } from '@/backend/services/userService';
import { authService } from '@/backend/services/authService';
import CapabilityWrapper from '@/frontend/components/auth/CapabilityWrapper';

export default function UserManagementTable() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [propertyId, setPropertyId] = useState<string | null>(null);

    useEffect(() => {
        const init = async () => {
            const currentUser = await authService.getCurrentUser();
            if (currentUser?.property_id) {
                setPropertyId(currentUser.property_id);
                const data = await userService.getUsers(currentUser.property_id);
                setUsers(data.sort((a, b) => a.full_name.localeCompare(b.full_name)));
            }
            setLoading(false);
        };
        init();
    }, []);

    const handleStatusToggle = async (user: User) => {
        const newStatus = user.status === 'active' ? 'suspended' : 'active';
        await userService.updateStatus(user.id, newStatus);
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
    };

    if (loading) return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            {['User', 'Role', 'Property', 'Status', 'Actions'].map(col => (
                                <th key={col} className="px-6 py-4">
                                    <div className="h-3 w-16 bg-gray-200 rounded-full" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {[1, 2, 3, 4, 5, 6].map(i => (
                            <tr key={i}>
                                {/* User: avatar + name + email */}
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                                        <div className="space-y-1.5">
                                            <div className="h-3.5 w-32 bg-gray-200 rounded-full" />
                                            <div className="h-2.5 w-40 bg-gray-100 rounded-full" />
                                        </div>
                                    </div>
                                </td>
                                {/* Role badge */}
                                <td className="px-6 py-4">
                                    <div className="h-5 w-20 bg-blue-100 rounded-full" />
                                </td>
                                {/* Property */}
                                <td className="px-6 py-4">
                                    <div className="h-3 w-28 bg-gray-100 rounded-full" />
                                </td>
                                {/* Status badge */}
                                <td className="px-6 py-4">
                                    <div className="h-5 w-14 bg-green-100 rounded-full" />
                                </td>
                                {/* Action */}
                                <td className="px-6 py-4 text-right">
                                    <div className="h-3 w-14 bg-gray-200 rounded-full ml-auto" />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">User</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Role</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Property</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600">Status</th>
                            <th className="px-6 py-4 text-sm font-semibold text-gray-600 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {users.map(user => (
                            <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-900">{user.full_name}</span>
                                        <span className="text-sm text-gray-500">{user.email}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 uppercase">
                                        {(user.role_key as string) === 'tenant' || user.role_key === 'tenant_user' ? 'CLIENT' : user.role_key.replace('_', ' ')}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-sm text-gray-600">
                                    {user.property_id}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                        }`}>
                                        {user.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <CapabilityWrapper domain="users" action="suspend">
                                        <button
                                            onClick={() => handleStatusToggle(user)}
                                            className="text-sm font-medium text-brand-orange hover:text-orange-700 underline underline-offset-4"
                                        >
                                            {user.status === 'active' ? 'Suspend' : 'Activate'}
                                        </button>
                                    </CapabilityWrapper>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
