
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://xvucakstcmtfoanmgcql.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dWNha3N0Y210Zm9hbm1nY3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzMyMjQ2NSwiZXhwIjoyMDgyODk4NDY1fQ.7WFGFGxTkSurehfwGNVPS2qzNf9toM3bO1GLaLClEwg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function assignMembers() {
    console.log('--- ASSIGNING MSTs TO PLAZA PROPERTY ---');
    // 1. Get Property ID for SS Plaza
    const { data: props, error: pErr } = await supabase.from('properties').select('id, name').ilike('name', '%Plaza%');

    if (pErr || !props || props.length === 0) {
        console.log('No property found matching Plaza');
        // fallback to just getting the first property in the DB
        const { data: allProps } = await supabase.from('properties').select('id, name').limit(1);
        if (allProps && allProps.length > 0) {
            console.log('Fallback: Using first property found:', allProps[0].name);
            await seed(allProps[0].id);
        }
        return;
    }

    console.log('Found Property:', props[0].name);
    await seed(props[0].id);
}

async function seed(propId) {
    // 2. Get the MSTs
    const { data: msts } = await supabase.from('users').select('id, full_name').not('team', 'is', null);

    console.log('Found MSTs:', msts.length);

    // 3. Insert memberships
    for (const mst of msts) {
        // Check if exists first to avoid complex upsert syntax issues
        const { data: existing } = await supabase.from('property_memberships').select('id').match({ property_id: propId, user_id: mst.id }).single();

        if (!existing) {
            const { error } = await supabase
                .from('property_memberships')
                .insert({ property_id: propId, user_id: mst.id, role: 'staff' });

            if (error) console.log('Error assigning', mst.full_name, error.message);
            else console.log('Assigned', mst.full_name, 'to property');
        } else {
            console.log(mst.full_name, 'already a member');
        }
    }
}

assignMembers();
