import { createAdminClient } from './frontend/utils/supabase/admin';

async function listRoles() {
    const adminSupabase = createAdminClient();
    
    console.log('--- Unique Roles in Property Memberships ---');
    const { data: propData } = await adminSupabase.from('property_memberships').select('role');
    const propRoles = new Set((propData || []).map(r => r.role));
    console.log('Property Roles:', Array.from(propRoles));

    console.log('\n--- Unique Roles in Organization Memberships ---');
    const { data: orgData } = await adminSupabase.from('organization_memberships').select('role');
    const orgRoles = new Set((orgData || []).map(r => r.role));
    console.log('Organization Roles:', Array.from(orgRoles));
}

listRoles().catch(console.error);
