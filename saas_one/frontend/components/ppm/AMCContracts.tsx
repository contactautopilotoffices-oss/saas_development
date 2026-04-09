/**
 * AMCContracts
 * AMC (Annual Maintenance Contract) management with document uploads.
 * @remarks Client component.
 */

'use client';
import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Loader2, ChevronDown, ChevronUp, FileText, Trash2, Edit, Upload, ExternalLink, AlertCircle } from 'lucide-react';

interface Props {
    organizationId: string;
    propertyId?: string;
    properties?: { id: string; name: string }[];
}

interface AMCDocument {
    id: string;
    doc_type: string;
    file_url: string;
    file_name: string;
    uploaded_at: string;
}

interface AMCContract {
    id: string;
    organization_id: string;
    property_id: string | null;
    system_name: string;
    vendor_name: string;
    vendor_contact: string | null;
    contract_start_date: string;
    contract_end_date: string;
    contract_value: number | null;
    payment_terms: string | null;
    scope_of_work: string | null;
    notes: string | null;
    status: 'active' | 'expired' | 'expiring_soon' | 'renewed';
    created_at: string;
    amc_documents: AMCDocument[];
}

interface ContractForm {
    system_name: string;
    vendor_name: string;
    vendor_contact: string;
    contract_start_date: string;
    contract_end_date: string;
    contract_value: string;
    payment_terms: string;
    scope_of_work: string;
    notes: string;
    property_id: string;
}

const emptyForm: ContractForm = {
    system_name: '',
    vendor_name: '',
    vendor_contact: '',
    contract_start_date: '',
    contract_end_date: '',
    contract_value: '',
    payment_terms: '',
    scope_of_work: '',
    notes: '',
    property_id: '',
};

const STATUS_CONFIG = {
    active: { label: 'Active', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
    expiring_soon: { label: 'Expiring Soon', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
    expired: { label: 'Expired', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
    renewed: { label: 'Renewed', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
};

const DOC_TYPE_LABELS: Record<string, string> = {
    contract: 'Contract',
    invoice: 'Invoice',
    renewal: 'Renewal',
    certificate: 'Certificate',
};

function getDaysUntilExpiry(endDate: string): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    return Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function computeStatus(endDate: string): AMCContract['status'] {
    const days = getDaysUntilExpiry(endDate);
    if (days < 0) return 'expired';
    if (days <= 30) return 'expiring_soon';
    return 'active';
}

export default function AMCContracts({ organizationId, propertyId, properties = [] }: Props) {
    const [contracts, setContracts] = useState<AMCContract[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingContract, setEditingContract] = useState<AMCContract | null>(null);
    const [selectedContract, setSelectedContract] = useState<string | null>(null);
    const [form, setForm] = useState<ContractForm>(emptyForm);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploadingDoc, setIsUploadingDoc] = useState(false);
    const [error, setError] = useState('');

    const fetchContracts = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams({ organization_id: organizationId });
            if (propertyId) params.set('property_id', propertyId);
            const res = await fetch(`/api/amc/contracts?${params}`);
            if (res.ok) {
                const data = await res.json();
                setContracts(data.contracts || []);
            }
        } finally {
            setIsLoading(false);
        }
    }, [organizationId, propertyId]);

    useEffect(() => { fetchContracts(); }, [fetchContracts]);

    const openAdd = () => {
        setEditingContract(null);
        setForm({ ...emptyForm, property_id: propertyId || '' });
        setError('');
        setShowAddModal(true);
    };

    const openEdit = (contract: AMCContract) => {
        setEditingContract(contract);
        setForm({
            system_name: contract.system_name,
            vendor_name: contract.vendor_name,
            vendor_contact: contract.vendor_contact || '',
            contract_start_date: contract.contract_start_date,
            contract_end_date: contract.contract_end_date,
            contract_value: contract.contract_value ? String(contract.contract_value) : '',
            payment_terms: contract.payment_terms || '',
            scope_of_work: contract.scope_of_work || '',
            notes: contract.notes || '',
            property_id: contract.property_id || '',
        });
        setError('');
        setShowAddModal(true);
    };

    const handleSave = async () => {
        if (!form.system_name || !form.vendor_name || !form.contract_start_date || !form.contract_end_date) {
            setError('System name, vendor name, start date, and end date are required.');
            return;
        }
        setIsSaving(true);
        setError('');
        try {
            const payload = {
                organization_id: organizationId,
                property_id: form.property_id || null,
                system_name: form.system_name,
                vendor_name: form.vendor_name,
                vendor_contact: form.vendor_contact || null,
                contract_start_date: form.contract_start_date,
                contract_end_date: form.contract_end_date,
                contract_value: form.contract_value ? parseFloat(form.contract_value) : null,
                payment_terms: form.payment_terms || null,
                scope_of_work: form.scope_of_work || null,
                notes: form.notes || null,
            };

            let res: Response;
            if (editingContract) {
                res = await fetch(`/api/amc/contracts/${editingContract.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            } else {
                res = await fetch('/api/amc/contracts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });
            }

            if (res.ok) {
                setShowAddModal(false);
                await fetchContracts();
            } else {
                const data = await res.json();
                setError(data.error || 'Save failed');
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this AMC contract? This cannot be undone.')) return;
        await fetch(`/api/amc/contracts/${id}`, { method: 'DELETE' });
        if (selectedContract === id) setSelectedContract(null);
        await fetchContracts();
    };

    const handleDocUpload = async (contractId: string, file: File, docType: string) => {
        setIsUploadingDoc(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('doc_type', docType);
            const res = await fetch(`/api/amc/contracts/${contractId}/documents`, { method: 'POST', body: fd });
            if (res.ok) await fetchContracts();
        } finally {
            setIsUploadingDoc(false);
        }
    };

    const handleDocDelete = async (contractId: string, docId: string) => {
        await fetch(`/api/amc/contracts/${contractId}/documents?doc_id=${docId}`, { method: 'DELETE' });
        await fetchContracts();
    };

    return (
        <div className="flex flex-col h-full overflow-auto bg-white p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-slate-900">AMC Contracts</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Annual Maintenance Contract management</p>
                </div>
                <button
                    onClick={openAdd}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-bold rounded-xl hover:bg-primary/90 transition-all"
                >
                    <Plus className="w-4 h-4" />
                    Add Contract
                </button>
            </div>

            {isLoading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            )}

            {!isLoading && contracts.length === 0 && (
                <div className="text-center py-20 text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-semibold">No AMC contracts found</p>
                    <p className="text-xs mt-1">Add your first contract to get started</p>
                </div>
            )}

            {!isLoading && contracts.map(contract => {
                const statusCfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.active;
                const days = getDaysUntilExpiry(contract.contract_end_date);
                const isExpanded = selectedContract === contract.id;
                const propName = properties.find(p => p.id === contract.property_id)?.name;

                return (
                    <div key={contract.id} className={`border rounded-2xl overflow-hidden transition-all ${statusCfg.border}`}>
                        {/* Card Header */}
                        <div
                            className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${statusCfg.bg}`}
                            onClick={() => setSelectedContract(isExpanded ? null : contract.id)}
                        >
                            <div className="flex items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="text-sm font-black text-slate-900">{contract.system_name}</h3>
                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                                            {statusCfg.label}
                                        </span>
                                        {propName && (
                                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{propName}</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-600 mt-0.5">{contract.vendor_name}</p>
                                    <div className="flex flex-wrap gap-3 mt-1.5 text-[11px] text-slate-500">
                                        <span>Start: <span className="font-bold">{new Date(contract.contract_start_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></span>
                                        <span>Expiry: <span className="font-bold">{new Date(contract.contract_end_date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span></span>
                                        {contract.contract_value && (
                                            <span>Value: <span className="font-bold">₹{contract.contract_value.toLocaleString('en-IN')}</span></span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {/* Days pill */}
                                    <span className={`text-[11px] font-black px-2.5 py-1 rounded-xl ${
                                        days < 0 ? 'bg-rose-100 text-rose-700' :
                                        days <= 7 ? 'bg-rose-100 text-rose-700' :
                                        days <= 30 ? 'bg-amber-100 text-amber-700' :
                                        'bg-emerald-100 text-emerald-700'
                                    }`}>
                                        {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d left`}
                                    </span>
                                    <button
                                        onClick={e => { e.stopPropagation(); openEdit(contract); }}
                                        className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-colors"
                                    >
                                        <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={e => { e.stopPropagation(); handleDelete(contract.id); }}
                                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                                </div>
                            </div>
                        </div>

                        {/* Expanded Detail */}
                        {isExpanded && (
                            <div className="p-4 border-t border-slate-100 bg-white space-y-4">
                                {/* Details */}
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    {contract.vendor_contact && (
                                        <div>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Contact</p>
                                            <p className="text-slate-700 font-semibold mt-0.5">{contract.vendor_contact}</p>
                                        </div>
                                    )}
                                    {contract.payment_terms && (
                                        <div>
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Payment Terms</p>
                                            <p className="text-slate-700 font-semibold mt-0.5 capitalize">{contract.payment_terms.replace('_', ' ')}</p>
                                        </div>
                                    )}
                                    {contract.scope_of_work && (
                                        <div className="col-span-2">
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Scope of Work</p>
                                            <p className="text-slate-700 mt-0.5">{contract.scope_of_work}</p>
                                        </div>
                                    )}
                                    {contract.notes && (
                                        <div className="col-span-2">
                                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Notes</p>
                                            <p className="text-slate-700 mt-0.5">{contract.notes}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Documents */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-black text-slate-600 uppercase tracking-widest">Documents</p>
                                    </div>
                                    {(contract.amc_documents || []).length > 0 && (
                                        <div className="space-y-1.5 mb-3">
                                            {contract.amc_documents.map(doc => (
                                                <div key={doc.id} className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-xl">
                                                    <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                                    <span className="text-xs font-bold text-slate-600 flex-shrink-0">{DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}</span>
                                                    <span className="text-xs text-slate-500 truncate flex-1">{doc.file_name}</span>
                                                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/70 transition-colors">
                                                        <ExternalLink className="w-3.5 h-3.5" />
                                                    </a>
                                                    <button onClick={() => handleDocDelete(contract.id, doc.id)} className="text-rose-400 hover:text-rose-600 transition-colors">
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-2">
                                        {['contract', 'invoice', 'renewal', 'certificate'].map(docType => (
                                            <label key={docType} className="cursor-pointer">
                                                <input
                                                    type="file"
                                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                                    className="hidden"
                                                    disabled={isUploadingDoc}
                                                    onChange={async e => {
                                                        const f = e.target.files?.[0];
                                                        if (f) await handleDocUpload(contract.id, f, docType);
                                                        e.target.value = '';
                                                    }}
                                                />
                                                <span className="flex items-center gap-1.5 text-xs font-bold text-primary px-3 py-1.5 border border-primary/30 rounded-xl hover:bg-primary/5 transition-colors">
                                                    <Upload className="w-3 h-3" />
                                                    {isUploadingDoc ? '...' : `+ ${DOC_TYPE_LABELS[docType]}`}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Add / Edit Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white z-10">
                            <div>
                                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">{editingContract ? 'Edit' : 'New'} AMC Contract</p>
                                <h3 className="text-lg font-black text-slate-900">{editingContract ? editingContract.system_name : 'Add Contract'}</h3>
                            </div>
                            <button onClick={() => setShowAddModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg">
                                <X className="w-4 h-4 text-slate-500" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            {error && (
                                <div className="flex items-center gap-2 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700 font-semibold">
                                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">System Name *</label>
                                    <input
                                        type="text"
                                        value={form.system_name}
                                        onChange={e => setForm(f => ({ ...f, system_name: e.target.value }))}
                                        placeholder="e.g., HVAC, Fire Suppression..."
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Vendor Name *</label>
                                    <input
                                        type="text"
                                        value={form.vendor_name}
                                        onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Vendor Contact</label>
                                    <input
                                        type="text"
                                        value={form.vendor_contact}
                                        onChange={e => setForm(f => ({ ...f, vendor_contact: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Start Date *</label>
                                    <input
                                        type="date"
                                        value={form.contract_start_date}
                                        onChange={e => setForm(f => ({ ...f, contract_start_date: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">End Date *</label>
                                    <input
                                        type="date"
                                        value={form.contract_end_date}
                                        onChange={e => setForm(f => ({ ...f, contract_end_date: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Contract Value (₹)</label>
                                    <input
                                        type="number"
                                        value={form.contract_value}
                                        onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))}
                                        placeholder="0"
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Payment Terms</label>
                                    <select
                                        value={form.payment_terms}
                                        onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="">Select...</option>
                                        <option value="monthly">Monthly</option>
                                        <option value="quarterly">Quarterly</option>
                                        <option value="annual">Annual</option>
                                        <option value="one_time">One-time</option>
                                    </select>
                                </div>
                                {properties.length > 0 && !propertyId && (
                                    <div className="col-span-2">
                                        <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Property</label>
                                        <select
                                            value={form.property_id}
                                            onChange={e => setForm(f => ({ ...f, property_id: e.target.value }))}
                                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                                        >
                                            <option value="">Org-level (no specific property)</option>
                                            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                        </select>
                                    </div>
                                )}
                                <div className="col-span-2">
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Scope of Work</label>
                                    <textarea
                                        value={form.scope_of_work}
                                        onChange={e => setForm(f => ({ ...f, scope_of_work: e.target.value }))}
                                        rows={3}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-xs font-black text-slate-700 uppercase tracking-widest mb-1.5 block">Notes</label>
                                    <textarea
                                        value={form.notes}
                                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                                        rows={2}
                                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="w-full py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
                            >
                                {isSaving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</> : editingContract ? 'Save Changes' : 'Add Contract'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
