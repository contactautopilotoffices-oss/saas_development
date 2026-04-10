'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import UserManagementTable from '@/frontend/components/users/UserManagementTable'
import AddUserModal from '@/frontend/components/users/AddUserModal'
import { UserPlus } from 'lucide-react'

export default function UserManagementPage() {
    const params = useParams()
    const orgId = params.orgId as string
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [refreshKey, setRefreshKey] = useState(0)

    const handleUserCreated = () => {
        // Trigger table refresh by changing the key
        setRefreshKey(prev => prev + 1)
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">User Management</h1>
                    <p className="text-gray-500 dark:text-zinc-500 mt-1">Manage staff roles and property access</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 px-5 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                >
                    <UserPlus className="w-5 h-5" />
                    Add New User
                </button>
            </header>

            <UserManagementTable key={refreshKey} />

            <AddUserModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                organizationId={orgId}
                onSuccess={handleUserCreated}
            />
        </div>
    )
}
