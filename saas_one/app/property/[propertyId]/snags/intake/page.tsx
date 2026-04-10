import { createClient } from '@/frontend/utils/supabase/server';
import { redirect } from 'next/navigation';
import { SnagIntakeDashboard } from '@/frontend/components/snags';

interface PageProps {
    params: Promise<{ propertyId: string }>;
}

export default async function SnagIntakePage({ params }: PageProps) {
    const { propertyId } = await params;
    const supabase = await createClient();

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        redirect('/login');
    }

    // Get property by ID
    const { data: property, error: propError } = await supabase
        .from('properties')
        .select('id, name, organization_id')
        .eq('id', propertyId)
        .single();

    if (propError || !property) {
        redirect('/property');
    }

    return (
        <SnagIntakeDashboard
            propertyId={property.id}
            organizationId={property.organization_id}
        />
    );
}
