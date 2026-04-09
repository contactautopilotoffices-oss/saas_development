import { createAdminClient } from './frontend/utils/supabase/admin';

async function checkProcurementUsers() {
    const adminSupabase = createAdminClient();
    
    console.log('--- Checking Property Memberships ---');
    const { data: propMembers, error: propError } = await adminSupabase
        .from('property_memberships')
        .select('user_id, role, is_active')
        .eq('is_active', true);
    
    if (propError) console.error(propError);
    else {
        const procMembers = propMembers.filter(m => m.role.toLowerCase().includes('procurement'));
        console.log('Found property-level procurement members (case-insensitive):', procMembers);
    }

    console.log('\n--- Checking Organization Memberships ---');
    const { data: orgMembers, error: orgError } = await adminSupabase
        .from('organization_memberships')
        .select('user_id, role');
    
    if (orgError) console.error(orgError);
    else {
        const procOrgMembers = orgMembers.filter(m => m.role.toLowerCase().includes('procurement'));
        console.log('Found organization-level procurement members (case-insensitive):', procOrgMembers);
    }
}

checkProcurementUsers().catch(console.error);
