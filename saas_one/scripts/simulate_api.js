const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
            val = val.slice(1, -1);
        }
        env[key] = val;
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function simulateApi() {
    console.log('--- Simulating /api/admin/resolver-stats ---');

    // Exact same query as route.ts
    const { data, error } = await supabase
        .from('resolver_stats')
        .select(`
            id,
            user_id,
            property_id,
            skill_group_id,
            user:users!user_id(full_name, email),
            property:properties!property_id(name),
            skill_group:skill_groups!skill_group_id(name, code)
        `)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Fetch error:', error);
        return;
    }

    console.log(`Total records returned: ${data?.length || 0}`);

    const targetNames = ['mst technical 2 etpl', 'MST-Plumbing', 'MST-Technical'];

    data.forEach(item => {
        const name = item.user?.full_name || 'NO_NAME';
        const isTarget = targetNames.some(tn => name.toLowerCase().includes(tn.toLowerCase()));

        if (isTarget) {
            console.log(`\nTARGET FOUND: ${name}`);
            console.log(` - ID: ${item.id}`);
            console.log(` - UserID: ${item.user_id}`);
            console.log(` - Property: ${item.property?.name || 'NULL'}`);
            console.log(` - SkillGroup: ${item.skill_group?.name || 'NULL'} (${item.skill_group?.code || 'NULL'})`);
        }
    });

    console.log('\n--- First 5 records (for context) ---');
    data.slice(0, 5).forEach(item => {
        console.log(` - ${item.user?.full_name} (${item.property?.name})`);
    });

    console.log('\n--- End of Simulation ---');
}

simulateApi();
