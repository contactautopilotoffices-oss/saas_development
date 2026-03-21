'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Check, X, Clock, Zap, User, ChevronRight } from 'lucide-react';

interface AdminCreditsPanelProps {
    propertyId: string;
}

interface Tenant {
    id: string;
    full_name: string;
    email: string;
    user_photo_url?: string;
}

interface CreditRecord {
    id: string;
    user_id: string;
    monthly_hours: number;
    remaining_hours: number;
    updated_at: string;
    tenant?: { id: string; full_name: string; email: string };
}

interface RefillRequest {
    id: string;
    user_id: string;
    reason: string | null;
    admin_note: string | null;
    status: string;
    created_at: string;
    reviewed_at: string | null;
    tenant: { id: string; full_name: string; email: string };
    reviewer?: { full_name: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
    pending: 'bg-amber-50 border-amber-100 text-amber-600',
    approved: 'bg-emerald-50 border-emerald-100 text-emerald-600',
    rejected: 'bg-rose-50 border-rose-100 text-rose-600',
};

const AdminCreditsPanel: React.FC<AdminCreditsPanelProps> = ({ propertyId }) => {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [credits, setCredits] = useState<CreditRecord[]>([]);
    const [pendingRequests, setPendingRequests] = useState<RefillRequest[]>([]);
    const [historyRequests, setHistoryRequests] = useState<RefillRequest[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingHistory, setIsLoadingHistory] = useState(false);
    const [activeSection, setActiveSection] = useState<'credits' | 'requests'>('credits');
    const [requestTab, setRequestTab] = useState<'pending' | 'history'>('pending');

    // Per-tenant inline hour editing
    const [editHours, setEditHours] = useState<Record<string, string>>({});
    const [savingId, setSavingId] = useState<string | null>(null);

    // Refill request review
    const [reviewingId, setReviewingId] = useState<string | null>(null);
    const [refillHours, setRefillHours] = useState<Record<string, string>>({});
    const [adminNote, setAdminNote] = useState<Record<string, string>>({});

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [tenantsRes, creditsRes, pendingRes] = await Promise.all([
                fetch(`/api/properties/${propertyId}/tenants`),
                fetch(`/api/meeting-room-credits?propertyId=${propertyId}`),
                fetch(`/api/meeting-room-credits/refill-requests?propertyId=${propertyId}&status=pending`),
            ]);
            const [tenantsData, creditsData, pendingData] = await Promise.all([
                tenantsRes.json(), creditsRes.json(), pendingRes.json(),
            ]);
            if (tenantsRes.ok) setTenants(tenantsData.tenants || []);
            if (creditsRes.ok) setCredits(creditsData.credits || []);
            if (pendingRes.ok) setPendingRequests(pendingData.requests || []);
        } catch (err) {
            console.error('[AdminCreditsPanel] fetch error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [propertyId]);

    const fetchHistory = useCallback(async () => {
        setIsLoadingHistory(true);
        try {
            // Fetch approved and rejected in parallel
            const [approvedRes, rejectedRes] = await Promise.all([
                fetch(`/api/meeting-room-credits/refill-requests?propertyId=${propertyId}&status=approved`),
                fetch(`/api/meeting-room-credits/refill-requests?propertyId=${propertyId}&status=rejected`),
            ]);
            const [approvedData, rejectedData] = await Promise.all([
                approvedRes.json(), rejectedRes.json(),
            ]);
            const combined = [
                ...(approvedData.requests || []),
                ...(rejectedData.requests || []),
            ].sort((a, b) => new Date(b.reviewed_at || b.created_at).getTime() - new Date(a.reviewed_at || a.created_at).getTime());
            setHistoryRequests(combined);
        } catch (err) {
            console.error('[AdminCreditsPanel] history fetch error:', err);
        } finally {
            setIsLoadingHistory(false);
        }
    }, [propertyId]);

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        if (activeSection === 'requests' && requestTab === 'history') {
            fetchHistory();
        }
    }, [activeSection, requestTab, fetchHistory]);

    const tenantsWithCredits = tenants.map(tenant => ({
        tenant,
        credit: credits.find(c => c.user_id === tenant.id) || null,
    }));

    const handleSaveHours = async (userId: string) => {
        const hours = parseFloat(editHours[userId] || '');
        if (isNaN(hours) || hours < 0) return;
        setSavingId(userId);
        try {
            const res = await fetch('/api/meeting-room-credits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ propertyId, userId, monthlyHours: hours }),
            });
            if (res.ok) {
                setEditHours(prev => { const n = { ...prev }; delete n[userId]; return n; });
                fetchData();
            }
        } catch (err) {
            console.error('[AdminCreditsPanel] save error:', err);
        } finally {
            setSavingId(null);
        }
    };

    const handleReview = async (requestId: string, action: 'approve' | 'reject') => {
        setReviewingId(requestId);
        try {
            const res = await fetch(`/api/meeting-room-credits/refill-requests/${requestId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action,
                    hours: parseFloat(refillHours[requestId] || '0') || undefined,
                    adminNote: adminNote[requestId] || undefined,
                }),
            });
            if (res.ok) {
                setPendingRequests(prev => prev.filter(r => r.id !== requestId));
                fetchData();
                // Refresh history if open
                if (requestTab === 'history') fetchHistory();
            }
        } catch (err) {
            console.error('[AdminCreditsPanel] review error:', err);
        } finally {
            setReviewingId(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-5">
            {/* Section Toggle */}
            <div className="flex bg-slate-50 p-1.5 rounded-2xl w-fit">
                <button
                    onClick={() => setActiveSection('credits')}
                    className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSection === 'credits' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    <Zap className="w-3.5 h-3.5" />
                    Tenant Credits
                </button>
                <button
                    onClick={() => setActiveSection('requests')}
                    className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeSection === 'requests' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                    Refill Requests
                    {pendingRequests.length > 0 && (
                        <span className="bg-rose-500 text-white text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center">
                            {pendingRequests.length}
                        </span>
                    )}
                </button>
            </div>

            {/* ─── Tenant Credits ─── */}
            {activeSection === 'credits' && (
                <div className="space-y-3">
                    {tenantsWithCredits.length === 0 ? (
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                            <User className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                            <p className="font-bold text-slate-700 text-sm">No tenants in this property</p>
                            <p className="text-slate-400 text-xs mt-1">Add tenants to the property first.</p>
                        </div>
                    ) : tenantsWithCredits.map(({ tenant, credit }) => {
                        const isEditing = editHours[tenant.id] !== undefined;
                        const hasCredit = credit !== null;
                        const usagePct = hasCredit ? Math.min(100, (credit!.remaining_hours / (credit!.monthly_hours || 1)) * 100) : 0;

                        return (
                            <div key={tenant.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                                        <span className="text-primary font-black text-sm">
                                            {tenant.full_name?.[0]?.toUpperCase() || '?'}
                                        </span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-900 text-sm truncate">{tenant.full_name}</p>
                                        <p className="text-slate-400 text-xs truncate">{tenant.email}</p>
                                    </div>

                                    {isEditing ? (
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.5"
                                                value={editHours[tenant.id]}
                                                onChange={e => setEditHours(prev => ({ ...prev, [tenant.id]: e.target.value }))}
                                                placeholder="hrs"
                                                className="w-20 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 text-center font-bold"
                                                autoFocus
                                            />
                                            <span className="text-xs text-slate-400 font-bold whitespace-nowrap">h/mo</span>
                                            <button
                                                onClick={() => handleSaveHours(tenant.id)}
                                                disabled={savingId === tenant.id}
                                                className="p-1.5 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition-all disabled:opacity-60"
                                            >
                                                {savingId === tenant.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                            </button>
                                            <button
                                                onClick={() => setEditHours(prev => { const n = { ...prev }; delete n[tenant.id]; return n; })}
                                                className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ) : hasCredit ? (
                                        <button
                                            onClick={() => setEditHours(prev => ({ ...prev, [tenant.id]: String(credit!.monthly_hours) }))}
                                            className="text-right flex-shrink-0 group"
                                        >
                                            <p className="text-sm font-black text-primary group-hover:underline">{credit!.monthly_hours}h/mo</p>
                                            <p className="text-xs text-slate-400">{credit!.remaining_hours}h left</p>
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setEditHours(prev => ({ ...prev, [tenant.id]: '' }))}
                                            className="flex-shrink-0 px-3 py-1.5 rounded-xl border-2 border-dashed border-primary/30 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 transition-all"
                                        >
                                            + Assign Hours
                                        </button>
                                    )}
                                </div>

                                {hasCredit && !isEditing && (
                                    <div className="mt-3">
                                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${usagePct < 25 ? 'bg-rose-400' : usagePct < 50 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                                style={{ width: `${usagePct}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between mt-1">
                                            <span className="text-[10px] text-slate-400">{credit!.remaining_hours}h remaining</span>
                                            <span className="text-[10px] text-slate-400">{credit!.monthly_hours}h/month</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ─── Refill Requests ─── */}
            {activeSection === 'requests' && (
                <div className="space-y-4">
                    {/* Pending / History sub-tabs */}
                    <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
                        <button
                            onClick={() => setRequestTab('pending')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${requestTab === 'pending' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Pending
                            {pendingRequests.length > 0 && (
                                <span className="bg-rose-500 text-white text-[8px] font-black rounded-full w-3.5 h-3.5 flex items-center justify-center">
                                    {pendingRequests.length}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setRequestTab('history')}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${requestTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <Clock className="w-3 h-3" />
                            History
                        </button>
                    </div>

                    {/* Pending list */}
                    {requestTab === 'pending' && (
                        pendingRequests.length === 0 ? (
                            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                                <Check className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                                <p className="font-bold text-slate-700 text-sm">No pending requests</p>
                                <p className="text-slate-400 text-xs mt-1">All caught up!</p>
                            </div>
                        ) : pendingRequests.map(req => (
                            <div key={req.id} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                                            <span className="text-amber-600 font-black text-sm">
                                                {req.tenant?.full_name?.[0]?.toUpperCase() || '?'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 text-sm">{req.tenant?.full_name}</p>
                                            <p className="text-slate-400 text-xs">{req.tenant?.email}</p>
                                            <p className="text-slate-400 text-[10px] mt-0.5">
                                                {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border flex-shrink-0 ${STATUS_COLORS.pending}`}>
                                        Pending
                                    </span>
                                </div>

                                {req.reason && (
                                    <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-3 py-2 italic">"{req.reason}"</p>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Hours to add</label>
                                        <input
                                            type="number" min="0" step="0.5"
                                            placeholder="Use monthly default"
                                            value={refillHours[req.id] || ''}
                                            onChange={e => setRefillHours(prev => ({ ...prev, [req.id]: e.target.value }))}
                                            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 block">Note (optional)</label>
                                        <input
                                            type="text" placeholder="Admin note..."
                                            value={adminNote[req.id] || ''}
                                            onChange={e => setAdminNote(prev => ({ ...prev, [req.id]: e.target.value }))}
                                            className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleReview(req.id, 'approve')}
                                        disabled={reviewingId === req.id}
                                        className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                    >
                                        {reviewingId === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                        Approve
                                    </button>
                                    <button
                                        onClick={() => handleReview(req.id, 'reject')}
                                        disabled={reviewingId === req.id}
                                        className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-rose-50 hover:text-rose-600 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                        Reject
                                    </button>
                                </div>
                            </div>
                        ))
                    )}

                    {/* History list */}
                    {requestTab === 'history' && (
                        isLoadingHistory ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                            </div>
                        ) : historyRequests.length === 0 ? (
                            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
                                <Clock className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                                <p className="font-bold text-slate-700 text-sm">No request history yet</p>
                            </div>
                        ) : historyRequests.map(req => (
                            <div key={req.id} className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${req.status === 'approved' ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                                            <span className={`font-black text-sm ${req.status === 'approved' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                {req.tenant?.full_name?.[0]?.toUpperCase() || '?'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 text-sm">{req.tenant?.full_name}</p>
                                            <p className="text-slate-400 text-xs">{req.tenant?.email}</p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-1 text-[9px] font-black uppercase tracking-widest rounded-full border flex-shrink-0 ${STATUS_COLORS[req.status] || ''}`}>
                                        {req.status}
                                    </span>
                                </div>

                                <div className="mt-3 space-y-1.5">
                                    {req.reason && (
                                        <p className="text-xs text-slate-500 italic">Request: "{req.reason}"</p>
                                    )}
                                    {req.admin_note && (
                                        <p className="text-xs text-slate-500">Note: "{req.admin_note}"</p>
                                    )}
                                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                                        <span>Requested {new Date(req.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                        {req.reviewed_at && (
                                            <span className="flex items-center gap-1">
                                                <ChevronRight className="w-3 h-3" />
                                                Reviewed {new Date(req.reviewed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default AdminCreditsPanel;
