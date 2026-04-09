'use client';

import { Suspense } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import StockDashboard from '@/frontend/components/stock/StockDashboard';
import Loader from '@/frontend/components/ui/Loader';

function StockPageContent() {
    const params = useParams();
    const searchParams = useSearchParams();
    const propertyId = params.propertyId as string;

    // ?item=<uuid> comes from QR scan of a stock item
    // ?barcode=<value> comes from barcode scan
    const initialSearch = searchParams.get('item') || searchParams.get('barcode') || undefined;

    return <StockDashboard propertyId={propertyId} initialSearch={initialSearch} />;
}

export default function StockPage() {
    return (
        <Suspense fallback={<div className="h-screen w-full flex items-center justify-center bg-background"><Loader size="lg" /></div>}>
            <StockPageContent />
        </Suspense>
    );
}
