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

async function searchNames() {
    const namesToSearch = ['mst technical 2 etpl', 'MST-Plumbing', 'MST-Technical'];
    console.log('--- Search Results ---');

    for (const name of namesToSearch) {
        console.log(`\nSearching for: "${name}"`);

        // Check users
        const { data: users } = await supabase
            .from('users')
            .select('id, full_name, email')
            .ilike('full_name', `%${name}%`);

        console.log(`Users found: ${users?.length || 0}`);
        if (users) {
            for (const u of users) {
                console.log(` - USER: [${u.id}] ${u.full_name} (${u.email})`);

                // Check resolver_stats
                const { data: stats } = await supabase
                    .from('resolver_stats')
                    .select('id, property_id, skill_group_id')
                    .eq('user_id', u.id);

                console.log(`   ResolverStats entries: ${stats?.length || 0}`);
            }
        }

        // Check skill_groups (maybe they are searching for skill groups instead of users?)
        const { data: sgroups } = await supabase
            .from('skill_groups')
            .select('id, name, code, property_id')
            .ilike('name', `%${name}%`);

        console.log(`Skill Groups found: ${sgroups?.length || 0}`);
        if (sgroups) {
            sgroups.forEach(sg => console.log(` - SG: [${sg.id}] ${sg.name} (${sg.code})`));
        }
    }
    console.log('\n--- End ---');
}

searchNames();
