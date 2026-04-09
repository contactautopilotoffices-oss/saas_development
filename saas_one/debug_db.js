const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://xvucakstcmtfoanmgcql.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dWNha3N0Y210Zm9hbm1nY3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzMyMjQ2NSwiZXhwIjoyMDgyODk4NDY1fQ.7WFGFGxTkSurehfwGNVPS2qzNf9toM3bO1GLaLClEwg';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    console.log('Checking property_memberships for role=procurement...');
    const { data: propData, error: propErr } = await supabase
        .from('property_memberships')
        .select('user_id, role, is_active')
        .eq('role', 'procurement');
    
    if (propErr) console.error('Prop Error:', propErr);
    else console.log('Property Memberships (exact low):', propData);

    const { data: propDataUpper, error: propErrUpper } = await supabase
        .from('property_memberships')
        .select('user_id, role, is_active')
        .eq('role', 'Procurement');
    
    if (propErrUpper) console.error('Prop Error Upper:', propErrUpper);
    else console.log('Property Memberships (exact upper):', propDataUpper);

    console.log('\nChecking organization_memberships for role=procurement...');
    const { data: orgData, error: orgErr } = await supabase
        .from('organization_memberships')
        .select('user_id, role')
        .eq('role', 'procurement');
    
    if (orgErr) console.error('Org Error:', orgErr);
    else console.log('Org Memberships (exact low):', orgData);

    const { data: orgDataUpper, error: orgErrUpper } = await supabase
        .from('organization_memberships')
        .select('user_id, role')
        .eq('role', 'Procurement');
    
    if (orgErrUpper) console.error('Org Error Upper:', orgErrUpper);
    else console.log('Org Memberships (exact upper):', orgDataUpper);

    console.log('\nSampling first 5 memberships to see role casing...');
    const { data: sample } = await supabase.from('property_memberships').select('role').limit(5);
    console.log('Sample roles:', sample);
}

run();
