'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import SOPChecklistRunner from '@/frontend/components/sop/SOPChecklistRunner';
import { ClipboardCheck, Lock, CheckCircle2 } from 'lucide-react';

export default function ChecklistDeepLinkPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const templateId = params?.templateId as string;
    const completionId = searchParams.get('completionId') ?? undefined;

    const [template, setTemplate] = useState<any>(null);
    const [user, setUser] = useState<any>(null);
    const [isAssigned, setIsAssigned] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [done, setDone] = useState(false);
    const [error, setError] = useState('');

    const supabase = createClient();

    useEffect(() => {
        const init = async () => {
            // Check auth
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) {
                router.replace(`/login?returnUrl=/checklist/${templateId}`);
                return;
            }
            setUser(currentUser);

            // Fetch template
            const { data: tmpl, error: tmplErr } = await supabase
                .from('sop_templates')
                .select('*, property:properties(id, name)')
                .eq('id', templateId)
                .eq('is_active', true)
                .single();

            if (tmplErr || !tmpl) {
                setError('Checklist not found or no longer active.');
                setIsLoading(false);
                return;
            }

            setTemplate(tmpl);

            // Check if user is assigned or is admin
            const { data: membership } = await supabase
                .from('property_memberships')
                .select('role')
                .eq('user_id', currentUser.id)
                .eq('property_id', tmpl.property?.id)
                .eq('is_active', true)
                .maybeSingle();

            const isAdmin = ['property_admin', 'org_admin', 'org_super_admin', 'master_admin'].includes(membership?.role || '');
            const assignedToMe = Array.isArray(tmpl.assigned_to) && tmpl.assigned_to.includes(currentUser.id);

            setIsAssigned(isAdmin || assignedToMe);
            setIsLoading(false);
        };

        init();
    }, [templateId]);

    if (isLoading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-slate-500 font-bold text-sm">Loading checklist...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
                    <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ClipboardCheck className="w-7 h-7 text-rose-500" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 mb-2">Checklist Unavailable</h2>
                    <p className="text-slate-500 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    if (!isAssigned) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
                    <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Lock className="w-7 h-7 text-amber-500" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 mb-2">Access Restricted</h2>
                    <p className="text-slate-500 text-sm">You are not assigned to the <strong>{template?.title}</strong> checklist.</p>
                </div>
            </div>
        );
    }

    if (done) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
                    <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                    </div>
                    <h2 className="text-lg font-black text-slate-900 mb-2">Checklist Complete!</h2>
                    <p className="text-slate-500 text-sm mb-6">{template?.title} has been submitted successfully.</p>
                    <button
                        onClick={() => router.back()}
                        className="w-full py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-700 transition-all"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
                <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                    <ClipboardCheck size={16} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">QR Checklist</p>
                    <h1 className="text-sm font-black text-slate-900 truncate">{template?.title}</h1>
                </div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest hidden sm:block">
                    {template?.property?.name}
                </span>
            </div>

            {/* Runner */}
            <div className="max-w-2xl mx-auto px-4 py-6">
                <SOPChecklistRunner
                    templateId={templateId}
                    completionId={completionId}
                    propertyId={template?.property?.id}

                    onComplete={() => setDone(true)}
                    onCancel={() => router.back()}
                />
            </div>
        </div>
    );
}
