'use client';

import React, { useState } from 'react';
import {
    X, UserPlus, Mail, Lock, User, Shield, Building2, Eye, EyeOff,
    Wrench, Hammer, Briefcase, Sparkles, Check, Key
} from 'lucide-react';
import { motion } from 'framer-motion';

interface AddMemberModalProps {
    isOpen: boolean;
    onClose: () => void;
    orgId: string;
    orgName: string;
    properties: { id: string; name: string }[];
    fixedPropertyId?: string;
    onSuccess?: () => void;
}

const AddMemberModal = ({ isOpen, onClose, orgId, orgName, properties, fixedPropertyId, onSuccess }: AddMemberModalProps) => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [role, setRole] = useState('staff');
    const [specialization, setSpecialization] = useState('');
    const [selectedPropertyId, setSelectedPropertyId] = useState(fixedPropertyId || '');
    const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
    const [superTenantPropertyIds, setSuperTenantPropertyIds] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const SKILL_OPTIONS: Record<string, { code: string; label: string; icon: any }[]> = {
        mst: [
            { code: 'technical', label: 'Technical', icon: Wrench },
            { code: 'plumbing', label: 'Plumbing', icon: Hammer },
            { code: 'vendor', label: 'Vendor Coordination', icon: Briefcase },
        ],
        staff: [
            { code: 'technical', label: 'Technical', icon: Wrench },
            { code: 'soft_services', label: 'Soft Services', icon: Sparkles },
        ],
        soft_service_staff: [
            { code: 'soft_services', label: 'Soft Services', icon: Sparkles },
            { code: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
        ],
        soft_service_supervisor: [
            { code: 'soft_services', label: 'Soft Services', icon: Sparkles },
            { code: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
        ],
        soft_service_manager: [
            { code: 'soft_services', label: 'Soft Services', icon: Sparkles },
            { code: 'housekeeping', label: 'Housekeeping', icon: Sparkles },
        ],
    };

    const toggleSkill = (code: string) => {
        setSelectedSkills(prev =>
            prev.includes(code)
                ? prev.filter(c => c !== code)
                : [...prev, code]
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const response = await fetch('/api/users/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    password,
                    full_name: fullName,
                    organization_id: orgId,
                    role,
                    property_id: (role === 'org_super_admin' || role === 'super_tenant') ? null : selectedPropertyId,
                    specialization: role === 'staff' ? specialization : undefined,
                    skills: (role === 'staff' || role === 'mst' || role === 'soft_service_staff' || role === 'soft_service_supervisor' || role === 'soft_service_manager') ? selectedSkills : undefined
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || 'Failed to create user');
                return;
            }

            // For super_tenant, also assign selected properties
            if (role === 'super_tenant' && superTenantPropertyIds.length > 0 && data.user?.id) {
                const stRes = await fetch('/api/super-tenant', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: data.user.id,
                        property_ids: superTenantPropertyIds,
                        organization_id: orgId,
                    }),
                });
                if (!stRes.ok) {
                    const stErr = await stRes.json();
                    setError(stErr.error || 'User created but failed to assign properties');
                    return;
                }
            }

            onSuccess?.();
            onClose();
            setFullName('');
            setEmail('');
            setPassword('');
            setRole('staff');
            setSelectedPropertyId('');
            setSelectedSkills([]);
            setSuperTenantPropertyIds([]);
        } catch (err) {
            console.error('Error creating user:', err);
            setError('An unexpected error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-slate-900/60"
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="relative bg-white w-full max-w-lg rounded-[32px] shadow-2xl flex flex-col max-h-[calc(100vh-2rem)] overflow-hidden"
            >
                {/* Header - Fixed */}
                <div className="p-8 border-b border-slate-100 flex-shrink-0">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center">
                                <UserPlus className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-slate-900">Add New Member</h3>
                                <p className="text-sm font-medium text-slate-500">Create an account for {orgName}.</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>
                </div>

                <form
                    onSubmit={handleSubmit}
                    className="p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar"
                >
                    {error && (
                        <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl text-rose-600 text-sm font-bold">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-5">
                        {/* Name */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Full Name</label>
                            <div className="relative">
                                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    required
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="John Doe"
                                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-100 outline-none"
                                />
                            </div>
                        </div>

                        {/* Email */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Email Address</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="john@example.com"
                                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-100 outline-none"
                                />
                            </div>
                        </div>

                        {/* Password */}
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type={showPassword ? "text" : "password"}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-11 pr-12 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-100 outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            {/* Role */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Role</label>
                                <div className="relative">
                                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <select
                                        value={role}
                                        onChange={(e) => setRole(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-100 outline-none appearance-none"
                                    >
                                        <optgroup label="Administrative">
                                            {!fixedPropertyId && <option value="org_super_admin">Org Super Admin</option>}
                                            <option value="property_admin">Property Admin</option>
                                        </optgroup>

                                        <optgroup label="Service Staff">
                                            <option value="staff">General Staff</option>
                                            <option value="soft_service_staff">Soft Service Staff</option>
                                            <option value="soft_service_supervisor">Soft Service Supervisor</option>
                                            <option value="soft_service_manager">Soft Service Manager</option>
                                            <option value="mst">MST (Maintenance)</option>
                                        </optgroup>

                                        <optgroup label="Other">
                                            <option value="security">Security</option>
                                            <option value="tenant">Client</option>
                                            <option value="vendor">Food Vendor</option>
                                            <option value="super_tenant">Super Client</option>
                                        </optgroup>
                                    </select>
                                </div>
                            </div>

                            {role !== 'org_super_admin' && role !== 'super_tenant' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Target Property</label>
                                    <div className="relative">
                                        <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <select
                                            value={selectedPropertyId}
                                            onChange={(e) => setSelectedPropertyId(e.target.value)}
                                            required={role !== 'org_super_admin' && role !== 'super_tenant'}
                                            disabled={!!fixedPropertyId}
                                            className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-100 outline-none appearance-none disabled:opacity-75 disabled:cursor-not-allowed"
                                        >
                                            {fixedPropertyId ? (
                                                <option value={fixedPropertyId}>Current Property</option>
                                            ) : (
                                                <>
                                                    <option value="">Select Property</option>
                                                    {properties.map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </>
                                            )}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>

                        {role === 'super_tenant' && properties.length > 0 && (
                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest px-1 flex items-center gap-2">
                                    <Key className="w-3.5 h-3.5 text-secondary" />
                                    Assign Properties <span className="text-error">*</span>
                                </label>
                                <div className="space-y-2 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                                    {properties.map(p => {
                                        const isSelected = superTenantPropertyIds.includes(p.id);
                                        return (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setSuperTenantPropertyIds(prev =>
                                                    isSelected ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                                )}
                                                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm font-bold transition-smooth ${isSelected
                                                    ? 'bg-primary/10 border-primary text-primary'
                                                    : 'bg-surface-elevated border-border text-text-secondary hover:border-primary'
                                                }`}
                                            >
                                                <span className="flex items-center gap-2">
                                                    <Building2 className="w-4 h-4" />
                                                    {p.name}
                                                </span>
                                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-smooth ${isSelected ? 'bg-primary border-primary' : 'bg-surface border-border'}`}>
                                                    {isSelected && <Check className="w-3 h-3 text-white" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                                {superTenantPropertyIds.length === 0 && (
                                    <p className="text-[11px] text-error font-medium px-1">Select at least one property.</p>
                                )}
                            </div>
                        )}

                        {role === 'staff' && (
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Specialization</label>
                                <div className="relative">
                                    <Shield className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    <select
                                        value={specialization}
                                        onChange={(e) => setSpecialization(e.target.value)}
                                        className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold text-slate-900 focus:ring-2 focus:ring-slate-100 outline-none appearance-none"
                                    >
                                        <option value="">General</option>
                                        <option value="soft_service">Soft Services</option>
                                        <option value="technical">Technical</option>
                                        <option value="plumbing">Plumbing</option>
                                        <option value="electrical">Electrical</option>
                                    </select>
                                </div>
                            </div>
                        )}

                        {/* Skills Selection */}
                        {(role === 'mst' || role === 'staff' || role === 'soft_service_staff' || role === 'soft_service_supervisor' || role === 'soft_service_manager') && (
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                                    Member Skills
                                </label>
                                <div className="grid grid-cols-1 gap-2">
                                    {SKILL_OPTIONS[role].map((skill) => {
                                        const isSelected = selectedSkills.includes(skill.code);
                                        const Icon = skill.icon;
                                        return (
                                            <button
                                                key={skill.code}
                                                type="button"
                                                onClick={() => toggleSkill(skill.code)}
                                                className={`w-full p-3 rounded-xl border transition-all flex items-center justify-between group ${isSelected
                                                    ? 'bg-slate-900 border-slate-900 text-white'
                                                    : 'bg-slate-50 border-slate-100 text-slate-600 hover:border-slate-300'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-slate-800' : 'bg-white'}`}>
                                                        <Icon className={`w-4 h-4 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                                                    </div>
                                                    <span className="text-sm font-bold">{skill.label}</span>
                                                </div>
                                                <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${isSelected
                                                    ? 'bg-emerald-500 border-emerald-500'
                                                    : 'bg-white border-slate-200'
                                                    }`}>
                                                    {isSelected && <Check className="w-3.3 h-3.3 text-white" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting || (role === 'super_tenant' && superTenantPropertyIds.length === 0)}
                        className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-lg hover:bg-slate-800 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Creating...' : 'Create Member Account'}
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

export default AddMemberModal;
