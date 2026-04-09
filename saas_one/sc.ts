import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function main() {
    const { data: orgs } = await supabase.from('organizations').select('id, name');
    console.log('Organizations:', orgs?.map(o => o.name));

    const { data: props } = await supabase.from('properties').select('id, name, organization_id');

    const { data: tickets } = await supabase
        .from('tickets')
        .select('id, priority, status, property_id')
        .in('priority', ['high', 'urgent', 'critical'])
        .not('status', 'in', '("resolved","closed","pending_validation")');

    console.log('\n--- URGENT OPEN TICKETS ---');
    console.log(`Total count: ${tickets?.length || 0}`);
    for (const t of tickets || []) {
        const prop = props?.find(p => p.id === t.property_id);
        const org = orgs?.find(o => o.id === prop?.organization_id);
        console.log(`- [${org?.name}] [${prop?.name}] Ticket ID: ${t.id} | Priority: ${t.priority} | Status: ${t.status}`);
    }
}

main().catch(console.error);
