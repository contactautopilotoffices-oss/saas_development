'use client';

import React, { useState, useEffect } from 'react';
import {
    Plus, Search, Building2, Phone, Mail, CheckCircle2, AlertCircle,
    Loader2, ChevronDown, ChevronUp, X, Ban, RefreshCw, FileText, MapPin
} from 'lucide-react';

interface Vendor {
    id: string;
    company_name: string;
    contact_person: string;
    phone: string;
    email?: string;
    whatsapp_number?: string;
    specialization?: string[];
    kyc_status: string;
    kyc_rejection_reason?: string;
    is_active: boolean;
    user_id?: string;
    created_at: string;
    task_counts: { total: number; pending: number; done: number };
    property_ids?: string[];
    // KYC docs
    gst_number?: string;
    pan_number?: string;
    msme_number?: string;
    gst_doc_url?: string;
    pan_doc_url?: string;
    msme_doc_url?: string;
    cancelled_cheque_url?: string;
    bank_name?: string;
    bank_account_number?: string;
    bank_ifsc?: string;
}

const SPECIALIZATIONS = ['electrical', 'hvac', 'fire', 'ups', 'civil', 'it', 'plumbing', 'all'];
const KYC_STATUS_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    submitted: 'bg-primary/10 text-primary',
    verified: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
};

interface Props {
    organizationId: string;
    propertyId?: string;
    properties?: { id: string; name: string }[];
}

export default function VendorManagement({ organizationId, propertyId, properties: propsProp = [] }: Props) {
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [expandedVendor, setExpandedVendor] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [properties, setProperties] = useState<{ id: string; name: string }[]>(propsProp);

    // Add vendor form state
    const [form, setForm] = useState({
        company_name: '',
        contact_person: '',
        phone: '',
        email: '',
        whatsapp_number: '',
        specialization: [] as string[],
        property_ids: propertyId ? [propertyId] : [] as string[],
    });
    const [adding, setAdding] = useState(false);
    const [addResult, setAddResult] = useState<{ temp_password?: string } | null>(null);

    // KYC review state
    const [reviewingVendor, setReviewingVendor] = useState<Vendor | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');
    const [savingKyc, setSavingKyc] = useState(false);

    useEffect(() => {
        loadVendors();
    }, [organizationId, propertyId]);

    useEffect(() => {
        if (propsProp.length > 0) { setProperties(propsProp); return; }
        // Auto-fetch properties for this org when not passed in as props
        fetch(`/api/admin/organizations/${organizationId}/properties`)
            .then(r => r.json())
            .then(d => {
                const arr = Array.isArray(d) ? d : (d.properties || []);
                setProperties(arr.map((p: any) => ({ id: p.id, name: p.name })));
            })
            .catch(() => {});
    }, [organizationId, propsProp]);

    async function loadVendors() {
        setLoading(true);
        try {
            let url = `/api/vendors/maintenance?organization_id=${organizationId}`;
            if (propertyId) url += `&property_id=${propertyId}`;
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setVendors(data.vendors || []);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleAddVendor(e: React.FormEvent) {
        e.preventDefault();
        setAdding(true);
        setError('');
        try {
            const res = await fetch('/api/vendors/maintenance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, organization_id: organizationId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setAddResult(data);
            setVendors(prev => [{ ...data.vendor, task_counts: { total: 0, pending: 0, done: 0 } }, ...prev]);
            setForm({ company_name: '', contact_person: '', phone: '', email: '', whatsapp_number: '', specialization: [], property_ids: propertyId ? [propertyId] : [] });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setAdding(false);
        }
    }

    async function handleKycAction(vendorId: string, action: 'verified' | 'rejected', reason?: string) {
        setSavingKyc(true);
        try {
            const body: any = { kyc_status: action };
            if (action === 'rejected' && reason) body.kyc_rejection_reason = reason;

            const res = await fetch(`/api/vendors/maintenance/${vendorId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            setVendors(prev => prev.map(v => v.id === vendorId ? { ...v, ...data.vendor } : v));
            setReviewingVendor(null);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSavingKyc(false);
        }
    }

    async function toggleActive(vendor: Vendor) {
        try {
            if (vendor.is_active) {
                await fetch(`/api/vendors/maintenance/${vendor.id}`, { method: 'DELETE' });
                setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, is_active: false } : v));
            } else {
                const res = await fetch(`/api/vendors/maintenance/${vendor.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ is_active: true }),
                });
                const data = await res.json();
                setVendors(prev => prev.map(v => v.id === vendor.id ? { ...v, ...data.vendor } : v));
            }
        } catch (e: any) {
            setError(e.message);
        }
    }

    async function togglePropertyAssignment(vendorId: string, pid: string, assigned: boolean) {
        try {
            await fetch(`/api/vendors/maintenance/${vendorId}/properties`, {
                method: assigned ? 'DELETE' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ property_id: pid }),
            });
            setVendors(prev => prev.map(v => v.id === vendorId ? {
                ...v,
                property_ids: assigned
                    ? (v.property_ids || []).filter(p => p !== pid)
                    : [...(v.property_ids || []), pid],
            } : v));
        } catch (e: any) {
            setError(e.message);
        }
    }

    const filtered = vendors.filter(v =>
        v.company_name.toLowerCase().includes(search.toLowerCase()) ||
        v.contact_person.toLowerCase().includes(search.toLowerCase())
    );

    const pendingKyc = vendors.filter(v => v.kyc_status === 'submitted').length;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
                    <Building2 className="w-5 h-5 text-primary" />
                    <div className="flex-1">
                        <h1 className="text-lg font-bold text-gray-900">Vendor Management</h1>
                        {propertyId && properties.find(p => p.id === propertyId) && (
                            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" />
                                {properties.find(p => p.id === propertyId)!.name}
                            </p>
                        )}
                    </div>
                    {pendingKyc > 0 && (
                        <span className="bg-primary text-text-inverse text-xs font-bold px-2.5 py-1 rounded-full">
                            {pendingKyc} KYC pending
                        </span>
                    )}
                    <button
                        onClick={() => setShowAddForm(f => !f)}
                        className="flex items-center gap-2 bg-primary text-text-inverse px-4 py-2 rounded-xl text-sm font-semibold hover:opacity-90"
                    >
                        <Plus className="w-4 h-4" />
                        Add Vendor
                    </button>
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                        <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
                    </div>
                )}

                {/* Add Vendor Form */}
                {showAddForm && (
                    <div className="bg-white border border-gray-200 rounded-2xl p-6">
                        <h2 className="text-base font-bold text-gray-900 mb-4">Register New Vendor</h2>
                        {addResult?.temp_password && (
                            <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4">
                                <div className="text-sm font-semibold text-green-700 mb-1">Vendor registered successfully!</div>
                                <div className="text-xs text-green-600">
                                    A Supabase account has been created.<br />
                                    Temp password: <span className="font-mono font-bold">{addResult.temp_password}</span><br />
                                    WhatsApp notification sent with credentials.
                                </div>
                                <button onClick={() => { setAddResult(null); setShowAddForm(false); }}
                                    className="mt-2 text-xs text-green-700 underline">Close</button>
                            </div>
                        )}
                        <form onSubmit={handleAddVendor} className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 sm:col-span-1">
                                <label className="text-xs font-semibold text-gray-600 block mb-1">Company Name *</label>
                                <input required className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                                    value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
                                <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
                                    <span>⚠️</span>
                                    Enter exactly as written in the PPM Excel (Column F — Vendor). Tasks are mapped by this name.
                                </p>
                            </div>
                            <div className="col-span-2 sm:col-span-1">
                                <label className="text-xs font-semibold text-gray-600 block mb-1">Contact Person *</label>
                                <input required className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                                    value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-1">Phone *</label>
                                <input required type="tel" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                                    value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
                            </div>
                            <div>
                                <label className="text-xs font-semibold text-gray-600 block mb-1">WhatsApp Number</label>
                                <input type="tel" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                                    placeholder="If different from phone"
                                    value={form.whatsapp_number} onChange={e => setForm(p => ({ ...p, whatsapp_number: e.target.value }))} />
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs font-semibold text-gray-600 block mb-1">Email (for app login)</label>
                                <input type="email" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
                                    value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
                                <p className="text-xs text-gray-400 mt-1">If provided, a login account will be created for the vendor.</p>
                            </div>
                            <div className="col-span-2">
                                <label className="text-xs font-semibold text-gray-600 block mb-2">Specialization</label>
                                <div className="flex flex-wrap gap-2">
                                    {SPECIALIZATIONS.map(s => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setForm(p => ({
                                                ...p,
                                                specialization: p.specialization.includes(s)
                                                    ? p.specialization.filter(x => x !== s)
                                                    : [...p.specialization, s]
                                            }))}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${form.specialization.includes(s) ? 'bg-primary text-text-inverse border-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {properties.length > 0 && (
                                <div className="col-span-2">
                                    <label className="text-xs font-semibold text-gray-600 block mb-2">Assign to Properties</label>
                                    <div className="flex flex-wrap gap-2">
                                        {properties.map(p => (
                                            <button
                                                key={p.id}
                                                type="button"
                                                onClick={() => setForm(prev => ({
                                                    ...prev,
                                                    property_ids: prev.property_ids.includes(p.id)
                                                        ? prev.property_ids.filter(x => x !== p.id)
                                                        : [...prev.property_ids, p.id],
                                                }))}
                                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${form.property_ids.includes(p.id) ? 'bg-primary text-text-inverse border-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                                            >
                                                <MapPin className="w-3 h-3" />
                                                {p.name}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-xs text-gray-400 mt-1">Select one or more properties this vendor serves.</p>
                                </div>
                            )}
                            <div className="col-span-2 flex gap-3">
                                <button type="submit" disabled={adding}
                                    className="flex-1 bg-primary text-text-inverse rounded-xl py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                                    {adding && <Loader2 className="w-4 h-4 animate-spin" />}
                                    Register Vendor
                                </button>
                                <button type="button" onClick={() => setShowAddForm(false)}
                                    className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm bg-white"
                        placeholder="Search vendors..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                {/* Vendor list */}
                {loading ? (
                    <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-12 text-gray-400">No vendors found.</div>
                ) : (
                    <div className="space-y-3">
                        {filtered.map(vendor => {
                            const isExpanded = expandedVendor === vendor.id;
                            return (
                                <div key={vendor.id} className={`bg-white rounded-2xl border overflow-hidden transition-all ${!vendor.is_active ? 'opacity-60' : ''} ${vendor.kyc_status === 'submitted' ? 'border-primary/30' : 'border-gray-100'}`}>
                                    <button
                                        className="w-full text-left p-4 flex items-start gap-4"
                                        onClick={() => setExpandedVendor(isExpanded ? null : vendor.id)}
                                    >
                                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                                            <Building2 className="w-5 h-5 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-gray-900 text-sm">{vendor.company_name}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${KYC_STATUS_COLORS[vendor.kyc_status]}`}>
                                                    KYC: {vendor.kyc_status}
                                                </span>
                                                {!vendor.is_active && (
                                                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Inactive</span>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-0.5">{vendor.contact_person} · {vendor.phone}</div>
                                            {vendor.specialization && vendor.specialization.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {vendor.specialization.map(s => (
                                                        <span key={s} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{s}</span>
                                                    ))}
                                                </div>
                                            )}
                                            {!propertyId && vendor.property_ids && vendor.property_ids.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {vendor.property_ids.map(pid => {
                                                        const prop = properties.find(p => p.id === pid);
                                                        return prop ? (
                                                            <span key={pid} className="flex items-center gap-0.5 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                                                <MapPin className="w-2.5 h-2.5" />{prop.name}
                                                            </span>
                                                        ) : null;
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-right text-xs text-gray-400 flex-shrink-0">
                                            <div className="font-bold text-gray-700">{vendor.task_counts.total} tasks</div>
                                            <div>{vendor.task_counts.done} done</div>
                                        </div>
                                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-1" />}
                                    </button>

                                    {isExpanded && (
                                        <div className="border-t border-gray-100 p-4 space-y-4">
                                            {/* Contact info */}
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                                {vendor.email && (
                                                    <div className="flex items-center gap-2 text-gray-600">
                                                        <Mail className="w-4 h-4 text-gray-400" /> {vendor.email}
                                                    </div>
                                                )}
                                                <div className="flex items-center gap-2 text-gray-600">
                                                    <Phone className="w-4 h-4 text-gray-400" /> {vendor.phone}
                                                </div>
                                            </div>

                                            {/* KYC Documents */}
                                            {vendor.kyc_status === 'submitted' && (
                                                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                                                    <div className="text-sm font-semibold text-primary mb-3">KYC Review</div>
                                                    <div className="grid grid-cols-2 gap-2 mb-3">
                                                        {[
                                                            { label: 'GST', num: vendor.gst_number, url: vendor.gst_doc_url },
                                                            { label: 'PAN', num: vendor.pan_number, url: vendor.pan_doc_url },
                                                            { label: 'MSME', num: vendor.msme_number, url: vendor.msme_doc_url },
                                                            { label: 'Cheque', url: vendor.cancelled_cheque_url },
                                                        ].map(({ label, num, url }) => url ? (
                                                            <a key={label} href={url} target="_blank" rel="noopener noreferrer"
                                                                className="flex items-center gap-1.5 text-xs text-primary hover:underline p-2 bg-white rounded-lg border border-primary/20">
                                                                <FileText className="w-3.5 h-3.5" />
                                                                <span>{label}{num ? ` (${num})` : ''}</span>
                                                            </a>
                                                        ) : null)}
                                                    </div>
                                                    {vendor.bank_name && (
                                                        <div className="text-xs text-primary mb-3">
                                                            Bank: {vendor.bank_name} · {vendor.bank_account_number} · {vendor.bank_ifsc}
                                                        </div>
                                                    )}
                                                    <div className="flex gap-2">
                                                        <button
                                                            onClick={() => handleKycAction(vendor.id, 'verified')}
                                                            disabled={savingKyc}
                                                            className="flex-1 bg-green-600 text-white rounded-lg py-2 text-xs font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1">
                                                            {savingKyc ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => setReviewingVendor(vendor)}
                                                            className="flex-1 bg-red-50 text-red-600 border border-red-200 rounded-lg py-2 text-xs font-semibold hover:bg-red-100 flex items-center justify-center gap-1">
                                                            <X className="w-3 h-3" />
                                                            Reject
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {vendor.kyc_status === 'rejected' && vendor.kyc_rejection_reason && (
                                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700">
                                                    Rejection reason: {vendor.kyc_rejection_reason}
                                                </div>
                                            )}

                                            {/* Property assignments (org-wide view only) */}
                                            {!propertyId && properties.length > 0 && (
                                                <div>
                                                    <div className="text-xs font-semibold text-gray-500 mb-2">Assigned Properties</div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {properties.map(p => {
                                                            const assigned = (vendor.property_ids || []).includes(p.id);
                                                            return (
                                                                <button
                                                                    key={p.id}
                                                                    type="button"
                                                                    onClick={() => togglePropertyAssignment(vendor.id, p.id, assigned)}
                                                                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${assigned ? 'bg-primary text-text-inverse border-primary' : 'border-gray-200 text-gray-500 hover:border-gray-400'}`}
                                                                >
                                                                    <MapPin className="w-3 h-3" />
                                                                    {p.name}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Actions */}
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => toggleActive(vendor)}
                                                    className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-all ${vendor.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-green-200 text-green-600 hover:bg-green-50'}`}
                                                >
                                                    {vendor.is_active ? <Ban className="w-3.5 h-3.5" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                                    {vendor.is_active ? 'Deactivate' : 'Reactivate'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Reject modal */}
            {reviewingVendor && (
                <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-sm p-6">
                        <h3 className="font-bold text-gray-900 mb-2">Reject KYC</h3>
                        <p className="text-sm text-gray-500 mb-4">Provide a reason for rejection. The vendor will be notified.</p>
                        <textarea
                            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
                            rows={3}
                            placeholder="e.g. GST document unclear, please re-upload"
                            value={rejectionReason}
                            onChange={e => setRejectionReason(e.target.value)}
                        />
                        <div className="flex gap-3 mt-4">
                            <button
                                onClick={() => handleKycAction(reviewingVendor.id, 'rejected', rejectionReason)}
                                disabled={!rejectionReason || savingKyc}
                                className="flex-1 bg-red-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                                {savingKyc ? 'Saving...' : 'Reject KYC'}
                            </button>
                            <button onClick={() => { setReviewingVendor(null); setRejectionReason(''); }}
                                className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
