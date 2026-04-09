const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStaff() {
    console.log('--- Searching for staff: Ganesh, Abhishek ---');

    // 1. Find users
    const { data: users, error: userError } = await supabase
        .from('users')
        .select('id, full_name, email, team')
        .or('full_name.ilike.%Ganesh%,full_name.ilike.%Abhishek%');

    if (userError) {
        console.error('Error fetching users:', userError);
        return;
    }

    if (!users || users.length === 0) {
        console.log('No users found with those names.');
        return;
    }

    for (const user of users) {
        console.log(`\nUser: ${user.full_name} (${user.id})`);
        console.log(`Email: ${user.email}, Team in users table: ${user.team}`);

        // 2. Check property memberships
        const { data: memberships, error: memError } = await supabase
            .from('property_memberships')
            .select('property_id, role, is_active, properties(name)')
            .eq('user_id', user.id);

        if (memError) {
            console.error('Error fetching memberships:', memError);
        } else {
            console.log('Memberships:');
            memberships?.forEach(m => {
                console.log(` - Property: ${m.properties?.name || m.property_id}, Role: ${m.role}, Active: ${m.is_active}`);
            });
        }

        // 3. Check resolver stats
        const { data: stats, error: statsError } = await supabase
            .from('resolver_stats')
            .select('property_id, is_checked_in, is_available, skill_group_id, skill_groups(name, code)')
            .eq('user_id', user.id);

        if (statsError) {
            console.error('Error fetching resolver stats:', statsError);
        } else {
            console.log('Resolver Stats:');
            stats?.forEach(s => {
                console.log(` - Property: ${s.property_id}, Checked In: ${s.is_checked_in}, Available: ${s.is_available}, Skill Group: ${s.skill_groups?.name} (${s.skill_groups?.code})`);
            });
        }
    }
}

checkStaff();
