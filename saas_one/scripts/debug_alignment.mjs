
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
    const orgId = process.env.NEXT_PUBLIC_AUTOPILOT_ORG_ID;
    console.log(`--- Debugging Ticket counts for Org: ${orgId} ---`);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setMonth(thirtyDaysAgo.getMonth() - 1);
    const startDate = thirtyDaysAgo.toISOString();

    // 1. Fetch all properties
    const { data: properties } = await supabase
        .from('properties')
        .select('id, name')
        .eq('organization_id', orgId);

    if (!properties) {
        console.log('No properties found');
        return;
    }

    const results = [];
    for (const prop of properties) {
        // Total All time (Internal + External)
        const { count: totalAllTime } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('property_id', prop.id);
        // Total All time (External Only)
        const { count: externalAllTime } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('property_id', prop.id).eq('internal', false);
        // Total Last 30 Days (Internal + External)
        const { count: totalRecent } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('property_id', prop.id).gte('created_at', startDate);
        // Total Last 30 Days (External Only)
        const { count: externalRecent } = await supabase.from('tickets').select('*', { count: 'exact', head: true }).eq('property_id', prop.id).gte('created_at', startDate).eq('internal', false);

        results.push({
            name: prop.name,
            totalAllTime: totalAllTime || 0,
            externalAllTime: externalAllTime || 0,
            totalRecent: totalRecent || 0,
            externalRecent: externalRecent || 0
        });
    }

    console.log('\nProperty Stats:');
    results.forEach(r => {
        console.log(`- ${r.name.padEnd(20)} | All-Time: {Total: ${r.totalAllTime}, Ext: ${r.externalAllTime}} | 30-Day: {Total: ${r.totalRecent}, Ext: ${r.externalRecent}}`);
    });

    const sum = (key) => results.reduce((a, b) => a + b[key], 0);

    console.log('\n--- PORTFOLIO TOTALS ---');
    console.log(`All-Time Total:    ${sum('totalAllTime')}`);
    console.log(`All-Time External: ${sum('externalAllTime')}`);
    console.log(`30-Day Total:      ${sum('totalRecent')}`);
    console.log(`30-Day External:   ${sum('externalRecent')}`);
}

debug();
