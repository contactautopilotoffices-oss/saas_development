import { Metadata } from 'next';
import TicketFlowMap from '@/frontend/components/ops/TicketFlowMap';

export const metadata: Metadata = {
    title: 'Ticket Flow Map | Autopilot',
    description: 'Real-time ticket flow visualization',
};

interface FlowMapPageProps {
    params: Promise<{
        propertyId: string;
    }>;
}

export default async function FlowMapPage({ params }: FlowMapPageProps) {
    const { propertyId } = await params;

    return (
        <div className="h-screen w-screen bg-[#0d1117]">
            <TicketFlowMap propertyId={propertyId} />
        </div>
    );
}
