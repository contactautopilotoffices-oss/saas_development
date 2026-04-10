'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import ExecutiveSummaryPanel from '@/frontend/components/shared/ExecutiveSummaryPanel';

export default function ExecutiveSummaryPage() {
    const params = useParams();
    const router = useRouter();
    const propertyId = params?.propertyId as string;

    return (
        <div className="min-h-screen bg-[#F8FAFC] pb-10 font-inter text-[#1E293B]">
            {/* Control bar */}
            <div className="w-full max-w-[1240px] mx-auto px-6 pt-6 pb-4 flex items-center justify-between">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-[#64748b] hover:text-[#1e293b] transition-colors font-bold text-sm"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Reports
                </button>
                <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-[#f1f5f9] text-[#475569] text-xs font-bold rounded-lg shadow-sm hover:bg-[#e2e8f0] transition-colors"
                >
                    Print / HD Vector PDF
                </button>
            </div>

            {/* Dashboard */}
            <div className="w-full max-w-[1240px] mx-auto px-6">
                <ExecutiveSummaryPanel propertyId={propertyId} idPrefix="fullpage" />
            </div>
        </div>
    );
}
