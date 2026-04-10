/**
 * AddUserModal
 * Modal for inviting/adding a new user to a property or organization.
 * @remarks Client component.
 */

'use client'

/**
 * Modal component for adding or inviting new users to an organisation.
 *
 * Supports two operation modes toggled by the user:
 * - **Invite via Email** — sends an invitation email to the provided address
 *   via `POST /api/users/invite`.
 * - **Create Directly** — creates the user account immediately with an
 *   optional password (auto-generated server-side if omitted) via
 *   `POST /api/users/create`.
 *
 * Displays role selection (member / admin), form validation, inline error
 * messages, and a success banner that shows any generated temporary password.
 * The modal auto-closes three seconds after a successful operation.
 *
 * @module AddUserModal
 * @see AddUserModalProps
 */

import React, { useState } from 'react'
import { X, UserPlus, Mail, Lock, User, Briefcase, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface AddUserModalProps {
    isOpen: boolean
    onClose: () => void
    organizationId: string
    onSuccess?: (user: any) => void
}

type CreateMode = 'invite' | 'create'

export default function AddUserModal({ isOpen, onClose, organizationId, onSuccess }: AddUserModalProps) {
    const [mode, setMode] = useState<CreateMode>('invite')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)

    // Form fields
    const [email, setEmail] = useState('')
    const [fullName, setFullName] = useState('')
    const [password, setPassword] = useState('')
    const [role, setRole] = useState<'member' | 'admin'>('member')

    const resetForm = () => {
        setEmail('')
        setFullName('')
        setPassword('')
        setRole('member')
        setError(null)
        setSuccess(null)
    }

    const handleClose = () => {
        resetForm()
        onClose()
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)
        setSuccess(null)

        try {
            const endpoint = mode === 'invite' ? '/api/users/invite' : '/api/users/create'
            const payload = mode === 'invite'
                ? { email, organization_id: organizationId, role }
                : { email, full_name: fullName, password: password || undefined, organization_id: organizationId, role }

            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create user')
            }

            setSuccess(data.message)

            // Show temp password if generated
            if (data.temp_password) {
                setSuccess(`${data.message}\n\nTemporary Password: ${data.temp_password}`)
            }

            onSuccess?.(data.user || { email })

            // Auto-close after success (with delay to show message)
            setTimeout(() => {
                handleClose()
            }, 3000)

        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred')
        } finally {
            setIsLoading(false)
        }
    }

    if (!isOpen) return null

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center">
                {/* Backdrop */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                    onClick={handleClose}
                />

                {/* Modal */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    className="relative z-10 w-full max-w-md bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-xl">
                                <UserPlus className="w-5 h-5 text-blue-400" />
                            </div>
                            <h2 className="text-lg font-bold text-white">Add User</h2>
                        </div>
                        <button
                            onClick={handleClose}
                            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Mode Toggle */}
                    <div className="px-6 pt-4">
                        <div className="flex gap-2 p-1 bg-zinc-950 rounded-lg">
                            <button
                                type="button"
                                onClick={() => setMode('invite')}
                                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${mode === 'invite'
                                    ? 'bg-blue-500 text-white shadow-lg'
                                    : 'text-zinc-400 hover:text-white'
                                    }`}
                            >
                                Invite via Email
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode('create')}
                                className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all ${mode === 'create'
                                    ? 'bg-blue-500 text-white shadow-lg'
                                    : 'text-zinc-400 hover:text-white'
                                    }`}
                            >
                                Create Directly
                            </button>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        {/* Email */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="user@example.com"
                                    required
                                    className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                />
                            </div>
                        </div>

                        {/* Full Name - only for create mode */}
                        {mode === 'create' && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    Full Name
                                </label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input
                                        type="text"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                        placeholder="John Doe"
                                        required
                                        className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Password - only for create mode */}
                        {mode === 'create' && (
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    Password <span className="text-zinc-600">(optional - auto-generated if empty)</span>
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
                                    />
                                </div>
                            </div>
                        )}

                        {/* Role */}
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                Role
                            </label>
                            <div className="relative">
                                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                                <select
                                    value={role}
                                    onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
                                    className="w-full pl-10 pr-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all cursor-pointer"
                                >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        </div>

                        {/* Error Message */}
                        {error && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                                <p className="text-sm text-red-400">{error}</p>
                            </div>
                        )}

                        {/* Success Message */}
                        {success && (
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                                <p className="text-sm text-emerald-400 whitespace-pre-wrap">{success}</p>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {mode === 'invite' ? 'Sending Invite...' : 'Creating User...'}
                                </>
                            ) : (
                                <>
                                    <UserPlus className="w-4 h-4" />
                                    {mode === 'invite' ? 'Send Invitation' : 'Create User'}
                                </>
                            )}
                        </button>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    )
}
