/**
 * InviteLinkGenerator
 * UI for generating and managing custom signup invite links.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
    Link as LinkIcon, Copy, CheckCircle2, XCircle, Calendar,
    Building2, Home, UserPlus
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Organization {
    id: string;
    name: string;
    code: string;
}

interface Property {
    id: string;
    name: string;
    code: string;
}

interface InviteLink {
    id: string;
    invitation_code: string;
    invite_url: string;
    organization: { id: string; name: string };
    property: { id: string; name: string };
    role: string;
    expires_at: string;
    max_uses: number;
    current_uses: number;
    is_active: boolean;
    created_at: string;
}

interface Props {
    organizations: Organization[];
}

const InviteLinkGenerator: React.FC<Props> = ({ organizations }) => {
    const [selectedOrgId, setSelectedOrgId] = useState('');
    const [selectedPropertyId, setSelectedPropertyId] = useState('');
    const [role, setRole] = useState('tenant');
    const [expiryDays, setExpiryDays] = useState(7);
    const [maxUses, setMaxUses] = useState(1);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedLink, setGeneratedLink] = useState<InviteLink | null>(null);
    const [properties, setProperties] = useState<Property[]>([]);
    const [recentLinks, setRecentLinks] = useState<InviteLink[]>([]);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        if (selectedOrgId) {
            fetchProperties(selectedOrgId);
        } else {
            setProperties([]);
            setSelectedPropertyId('');
        }
    }, [selectedOrgId]);

    useEffect(() => {
        fetchRecentLinks();
    }, []);

    const fetchProperties = async (orgId: string) => {
        try {
            const response = await fetch(`/api/admin/organizations/${orgId}/properties`);
            if (response.ok) {
                const data = await response.json();
                setProperties(data);
                if (data.length > 0) {
                    setSelectedPropertyId(data[0].id);
                }
            }
        } catch (error) {
            console.error('Error fetching properties:', error);
        }
    };

    const fetchRecentLinks = async () => {
        try {
            const response = await fetch('/api/invite-links/generate');
            if (response.ok) {
                const data = await response.json();
                setRecentLinks(data.slice(0, 10)); // Show last 10 links
            }
        } catch (error) {
            console.error('Error fetching recent links:', error);
        }
    };

    const handleGenerate = async () => {
        if (!selectedOrgId || !selectedPropertyId) return;

        setIsGenerating(true);
        try {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expiryDays);

            const response = await fetch('/api/invite-links/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    organization_id: selectedOrgId,
                    property_id: selectedPropertyId,
                    role,
                    expires_at: expiresAt.toISOString(),
                    max_uses: maxUses
                })
            });

            if (response.ok) {
                const data = await response.json();
                setGeneratedLink(data);
                fetchRecentLinks();
            } else {
                const error = await response.json();
                alert(`Error: ${error.error || 'Failed to generate link'}`);
            }
        } catch (error) {
            console.error('Error generating link:', error);
            alert('Failed to generate invite link');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleCopyLink = (url: string, id: string) => {
        navigator.clipboard.writeText(url);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Generator Form */}
            <div className="lg:col-span-1 bg-white border border-slate-100 rounded-[32px] p-8 h-fit shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
                        <UserPlus className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-slate-900">Generate Invite Link</h3>
                        <p className="text-xs text-slate-500">Create custom signup links</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Organization Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                            Organization *
                        </label>
                        <div className="relative">
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select
                                value={selectedOrgId}
                                onChange={(e) => setSelectedOrgId(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100 bg-white text-sm font-medium"
                            >
                                <option value="">Select Organization</option>
                                {organizations.map((org) => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Property Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                            Property *
                        </label>
                        <div className="relative">
                            <Home className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select
                                value={selectedPropertyId}
                                onChange={(e) => setSelectedPropertyId(e.target.value)}
                                disabled={!selectedOrgId || properties.length === 0}
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100 bg-white text-sm font-medium disabled:opacity-50"
                            >
                                <option value="">Select Property</option>
                                {properties.map((prop) => (
                                    <option key={prop.id} value={prop.id}>{prop.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Role Selector */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                            Role
                        </label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100 bg-white text-sm font-medium"
                        >
                            <option value="tenant">Client</option>
                            <option value="staff">Staff</option>
                            <option value="property_admin">Property Admin</option>
                        </select>
                    </div>

                    {/* Expiry */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                            Expires In (Days)
                        </label>
                        <input
                            type="number"
                            value={expiryDays || ''}
                            onChange={(e) => setExpiryDays(Number(e.target.value) || 1)}
                            min="1"
                            max="365"
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100 text-sm font-medium"
                        />
                    </div>

                    {/* Max Uses */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-widest">
                            Max Uses
                        </label>
                        <input
                            type="number"
                            value={maxUses || ''}
                            onChange={(e) => setMaxUses(Number(e.target.value) || 1)}
                            min="1"
                            max="1000"
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-100 text-sm font-medium"
                        />
                    </div>

                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !selectedOrgId || !selectedPropertyId}
                        className="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isGenerating ? (
                            <>Generating...</>
                        ) : (
                            <>
                                <LinkIcon className="w-4 h-4" />
                                Generate Link
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Recent Links & Generated Link */}
            <div className="lg:col-span-2 space-y-6">
                {/* Generated Link Result */}
                <AnimatePresence>
                    {generatedLink && (
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            className="bg-emerald-50 border border-emerald-200 rounded-[32px] p-8"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center">
                                        <CheckCircle2 className="w-6 h-6 text-white" />
                                    </div>
                                    <div>
                                        <h4 className="text-lg font-black text-emerald-900">Link Generated!</h4>
                                        <p className="text-xs text-emerald-700">Share this link with the user</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => setGeneratedLink(null)}
                                    className="p-2 hover:bg-emerald-100 rounded-lg transition-colors"
                                >
                                    <XCircle className="w-5 h-5 text-emerald-700" />
                                </button>
                            </div>

                            <div className="bg-white p-4 rounded-2xl border border-emerald-200 mb-4">
                                <div className="flex items-center justify-between">
                                    <code className="text-sm font-mono text-slate-700 flex-1 break-all">
                                        {generatedLink.invite_url}
                                    </code>
                                    <button
                                        onClick={() => handleCopyLink(generatedLink.invite_url, generatedLink.id)}
                                        className="ml-4 px-3 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 flex items-center gap-2"
                                    >
                                        {copiedId === generatedLink.id ? (
                                            <>
                                                <CheckCircle2 className="w-4 h-4" />
                                                Copied!
                                            </>
                                        ) : (
                                            <>
                                                <Copy className="w-4 h-4" />
                                                Copy
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                                    <p className="text-xs font-bold text-emerald-700 mb-1">Invitation Code</p>
                                    <p className="font-mono text-sm font-black text-slate-900">{generatedLink.invitation_code}</p>
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                                    <p className="text-xs font-bold text-emerald-700 mb-1">Expires</p>
                                    <p className="text-sm font-bold text-slate-900">{new Date(generatedLink.expires_at).toLocaleDateString()}</p>
                                </div>
                                <div className="bg-white p-3 rounded-xl border border-emerald-100">
                                    <p className="text-xs font-bold text-emerald-700 mb-1">Max Uses</p>
                                    <p className="text-sm font-bold text-slate-900">{generatedLink.max_uses}</p>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* Recent Links */}
                <div className="bg-white border border-slate-100 rounded-[32px] overflow-hidden shadow-sm">
                    <div className="px-8 py-6 border-b border-slate-100 bg-slate-50">
                        <h3 className="text-xl font-black text-slate-900">Recent Invite Links</h3>
                    </div>
                    <div className="divide-y divide-slate-50">
                        {recentLinks.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">No invite links generated yet</div>
                        ) : (
                            recentLinks.map((link) => (
                                <div key={link.id} className="p-6 hover:bg-slate-50/50 transition-colors">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="text-xs font-black text-slate-900">{link.organization.name}</span>
                                                <span className="text-xs text-slate-400">→</span>
                                                <span className="text-xs font-bold text-slate-600">{link.property.name}</span>
                                                <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-blue-50 text-blue-600 rounded border border-blue-200">
                                                    {link.role === 'tenant' ? 'client' : link.role}
                                                </span>
                                            </div>
                                            <code className="text-xs font-mono text-slate-500 block mb-2">{link.invitation_code}</code>
                                            <div className="flex items-center gap-4 text-xs text-slate-400">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    Expires: {new Date(link.expires_at).toLocaleDateString()}
                                                </div>
                                                <div>
                                                    Uses: {link.current_uses}/{link.max_uses}
                                                </div>
                                                <div className={`${link.is_active && new Date(link.expires_at) > new Date() ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {link.is_active && new Date(link.expires_at) > new Date() ? 'Active' : 'Expired'}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleCopyLink(link.invite_url, link.id)}
                                            className="ml-4 p-2 hover:bg-slate-100 rounded-lg transition-colors"
                                            title="Copy link"
                                        >
                                            {copiedId === link.id ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                            ) : (
                                                <Copy className="w-4 h-4 text-slate-400" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default InviteLinkGenerator;
