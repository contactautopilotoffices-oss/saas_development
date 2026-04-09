import { createClient } from '@/frontend/utils/supabase/server';
import VMSKiosk from '@/frontend/components/vms/VMSKiosk';
import { notFound } from 'next/navigation';

interface Props {
    params: Promise<{ propertyId: string }>;
}

export default async function KioskPage({ params }: Props) {
    const { propertyId } = await params;
    const supabase = await createClient();

    // Fetch property info
    const { data: property, error } = await supabase
        .from('properties')
        .select('id, name, code')
        .eq('id', propertyId)
        .single();

    if (error || !property) {
        notFound();
    }

    return (
        <VMSKiosk
            propertyId={propertyId}
            propertyName={property.name}
        />
    );
}

// Generate metadata
export async function generateMetadata({ params }: Props) {
    const { propertyId } = await params;
    return {
        title: 'Visitor Check-In | VMS',
        description: 'Visitor Management System Kiosk',
    };
}
