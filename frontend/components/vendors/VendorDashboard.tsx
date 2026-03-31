'use client';

import { useState, useEffect } from 'react';
import { Calendar, CheckCircle2, Clock, AlertCircle, Upload, Loader2, ChevronDown, ChevronUp, X, LogOut, MapPin } from 'lucide-react';
import VendorKYCForm from './VendorKYCForm';
import { createClient } from '@/frontend/utils/supabase/client';

interface Task {
    id: string;
    system_name: string;
    detail_name?: string;
    planned_date: string;
    done_date?: string;
    status: string;
    verification_status: string;
    property_id?: string;
    location?: string;
    frequency?: string;
    scope_of_work?: string;
    remark?: string;
    checker?: string;
    attachments?: any;
}

interface Vendor {
    id: string;
    company_name: string;
    contact_person: string;
    phone: string;
    email?: string;
    kyc_status: string;
    kyc_rejection_reason?: string;
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

const statusColors: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-700',
    done: 'bg-green-100 text-green-700',
    postponed: 'bg-gray-100 text-gray-600',
};

const verificationColors: Record<string, string> = {
    pending: 'bg-gray-100 text-gray-500',
    submitted: 'bg-blue-100 text-blue-600',
    verified: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
};

export default function VendorDashboard() {
    const [vendor, setVendor] = useState<Vendor | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [assignedProperties, setAssignedProperties] = useState<{ id: string; name: string }[]>([]);
    const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'tasks' | 'kyc'>('tasks');
    const [expandedTask, setExpandedTask] = useState<string | null>(null);
    const [updatingTask, setUpdatingTask] = useState<string | null>(null);
    const [uploadingProof, setUploadingProof] = useState<string | null>(null);
    const [error, setError] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            const res = await fetch('/api/vendors/maintenance/me');
            if (!res.ok) throw new Error('Failed to load vendor data');
            const data = await res.json();
            setVendor(data.vendor);
            setTasks(data.tasks || []);
            // Fetch property names for assigned property IDs
            if (data.assigned_property_ids?.length > 0) {
                const propRes = await fetch(`/api/admin/organizations/${data.vendor.organization_id}/properties`);
                if (propRes.ok) {
                    const allProps = await propRes.json();
                    const arr = Array.isArray(allProps) ? allProps : (allProps.properties || []);
                    setAssignedProperties(
                        arr.filter((p: any) => data.assigned_property_ids.includes(p.id))
                           .map((p: any) => ({ id: p.id, name: p.name }))
                    );
                }
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function markTaskDone(taskId: string) {
        setUpdatingTask(taskId);
        try {
            const res = await fetch(`/api/ppm/schedules/${taskId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'done',
                    done_date: new Date().toISOString().split('T')[0],
                    verification_status: 'submitted',
                }),
            });
            if (!res.ok) throw new Error('Update failed');
            const data = await res.json();
            setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...data.schedule } : t));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUpdatingTask(null);
        }
    }

    async function uploadProof(taskId: string, file: File, proofType: 'photo' | 'certificate' | 'invoice') {
        setUploadingProof(taskId);
        try {
            const fd = new FormData();
            fd.append('file', file);
            // API uses attach_type: photo | doc | invoice
            fd.append('attach_type', proofType === 'certificate' ? 'doc' : proofType);

            const res = await fetch(`/api/ppm/schedules/${taskId}/attachments`, {
                method: 'POST',
                body: fd,
            });
            if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Upload failed'); }
            const data = await res.json();
            // Mark proof type as uploaded in local state
            setTasks(prev => prev.map(t =>
                t.id === taskId
                    ? { ...t, attachments: { ...(t.attachments || {}), [proofType]: data.url } }
                    : t
            ));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setUploadingProof(null);
        }
    }

    if (loading) return (
        <div className="h-screen flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
    );

    if (!vendor) return (
        <div className="h-screen flex items-center justify-center flex-col gap-3">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <p className="text-gray-500">{error || 'Vendor profile not found. Contact your administrator.'}</p>
        </div>
    );

    const visibleTasks = selectedPropertyId
        ? tasks.filter(t => t.property_id === selectedPropertyId)
        : tasks;

    const pending = visibleTasks.filter(t => t.status === 'pending').length;
    const done = visibleTasks.filter(t => t.status === 'done').length;
    const submitted = visibleTasks.filter(t => t.verification_status === 'submitted').length;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
                <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-lg font-bold text-gray-900">{vendor.company_name}</h1>
                            <p className="text-sm text-gray-500">{vendor.contact_person}</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className={`px-3 py-1 rounded-full text-xs font-semibold ${vendor.kyc_status === 'verified' ? 'bg-green-100 text-green-700' : vendor.kyc_status === 'submitted' ? 'bg-blue-100 text-blue-600' : vendor.kyc_status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700'}`}>
                                KYC: {vendor.kyc_status}
                            </div>
                            <button
                                onClick={async () => {
                                    const supabase = createClient();
                                    await supabase.auth.signOut();
                                    window.location.href = '/login';
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                Sign Out
                            </button>
                        </div>
                    </div>

                    {/* KYC alert */}
                    {vendor.kyc_status === 'pending' && (
                        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
                            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                            Please complete your KYC to unlock all features.
                            <button onClick={() => setActiveTab('kyc')} className="underline font-semibold">Complete KYC</button>
                        </div>
                    )}
                </div>
            </div>

            {/* KPI strip */}
            <div className="max-w-2xl mx-auto px-4 py-4">
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-xl p-3 text-center border border-gray-100">
                        <div className="text-2xl font-black text-yellow-600">{pending}</div>
                        <div className="text-xs text-gray-500 mt-1">Pending</div>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center border border-gray-100">
                        <div className="text-2xl font-black text-green-600">{done}</div>
                        <div className="text-xs text-gray-500 mt-1">Done</div>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center border border-gray-100">
                        <div className="text-2xl font-black text-blue-600">{submitted}</div>
                        <div className="text-xs text-gray-500 mt-1">Under Review</div>
                    </div>
                </div>
            </div>

            {/* Property filter — only shown when vendor serves multiple properties */}
            {assignedProperties.length > 1 && (
                <div className="max-w-2xl mx-auto px-4 pb-2">
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        <button
                            onClick={() => setSelectedPropertyId(null)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${selectedPropertyId === null ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}
                        >
                            All Properties
                        </button>
                        {assignedProperties.map(p => (
                            <button
                                key={p.id}
                                onClick={() => setSelectedPropertyId(p.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${selectedPropertyId === p.id ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-500'}`}
                            >
                                <MapPin className="w-3 h-3" />
                                {p.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="max-w-2xl mx-auto px-4">
                <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
                    {(['tasks', 'kyc'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {tab === 'tasks' ? 'My Tasks' : 'KYC Documents'}
                        </button>
                    ))}
                </div>

                {error && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                        <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
                    </div>
                )}

                {activeTab === 'tasks' && (
                    <div className="space-y-3 pb-8">
                        {visibleTasks.length === 0 && (
                            <div className="text-center py-12 text-gray-400">
                                {selectedPropertyId ? 'No tasks for this property.' : 'No tasks assigned yet.'}
                            </div>
                        )}
                        {visibleTasks.map(task => {
                            const isExpanded = expandedTask === task.id;
                            const attachments = task.attachments || {};
                            return (
                                <div key={task.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                                    <button
                                        className="w-full text-left p-4 flex items-start gap-3"
                                        onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                                <span className="font-semibold text-gray-900 text-sm truncate">{task.system_name}</span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[task.status] || 'bg-gray-100 text-gray-600'}`}>
                                                    {task.status}
                                                </span>
                                                {task.verification_status !== 'pending' && (
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${verificationColors[task.verification_status]}`}>
                                                        {task.verification_status}
                                                    </span>
                                                )}
                                            </div>
                                            {task.detail_name && <p className="text-xs text-gray-500">{task.detail_name}</p>}
                                            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{task.planned_date}</span>
                                                {task.location && <span>{task.location}</span>}
                                            </div>
                                        </div>
                                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />}
                                    </button>

                                    {isExpanded && (
                                        <div className="border-t border-gray-100 p-4 space-y-4">
                                            {task.scope_of_work && (
                                                <div>
                                                    <div className="text-xs font-semibold text-gray-500 mb-1">Scope of Work</div>
                                                    <p className="text-sm text-gray-700">{task.scope_of_work}</p>
                                                </div>
                                            )}
                                            {task.checker && (
                                                <div className="text-xs text-gray-500">Checker: <span className="font-medium text-gray-700">{task.checker}</span></div>
                                            )}
                                            {task.remark && (
                                                <div className="text-xs text-gray-500">Remark: {task.remark}</div>
                                            )}

                                            {/* Proof upload section (only for pending/rejected tasks) */}
                                            {(task.status === 'pending' || task.verification_status === 'rejected') && (
                                                <div>
                                                    <div className="text-xs font-semibold text-gray-500 mb-2">Completion Proof</div>
                                                    <div className="grid grid-cols-3 gap-2">
                                                        {(['photo', 'certificate', 'invoice'] as const).map(proofType => {
                                                            const uploaded = !!attachments[proofType];
                                                            return (
                                                                <label key={proofType} className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all text-xs font-medium ${uploaded ? 'border-green-300 bg-green-50 text-green-700' : 'border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-gray-400'}`}>
                                                                    {uploaded ? <CheckCircle2 className="w-5 h-5 mb-1" /> : <Upload className="w-5 h-5 mb-1" />}
                                                                    {proofType}
                                                                    <input
                                                                        type="file"
                                                                        className="hidden"
                                                                        accept="image/*,.pdf"
                                                                        disabled={uploadingProof === task.id}
                                                                        onChange={e => {
                                                                            const file = e.target.files?.[0];
                                                                            if (file) uploadProof(task.id, file, proofType);
                                                                        }}
                                                                    />
                                                                </label>
                                                            );
                                                        })}
                                                    </div>

                                                    <button
                                                        onClick={() => markTaskDone(task.id)}
                                                        disabled={!!updatingTask}
                                                        className="mt-3 w-full bg-green-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        {updatingTask === task.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                                        Mark as Done & Submit for Verification
                                                    </button>
                                                </div>
                                            )}

                                            {task.status === 'done' && task.verification_status === 'submitted' && (
                                                <div className="flex items-center gap-2 text-blue-600 text-sm">
                                                    <Clock className="w-4 h-4" />
                                                    Awaiting checker verification
                                                </div>
                                            )}

                                            {task.verification_status === 'verified' && (
                                                <div className="flex items-center gap-2 text-green-600 text-sm font-medium">
                                                    <CheckCircle2 className="w-4 h-4" />
                                                    Verified by checker
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {activeTab === 'kyc' && (
                    <div className="pb-8">
                        <VendorKYCForm
                            vendorId={vendor.id}
                            vendor={vendor}
                            onSaved={(updated) => setVendor(updated)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
