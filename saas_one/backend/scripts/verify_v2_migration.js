
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://xvucakstcmtfoanmgcql.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dWNha3N0Y210Zm9hbm1nY3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzMyMjQ2NSwiZXhwIjoyMDgyODk4NDY1fQ.7WFGFGxTkSurehfwGNVPS2qzNf9toM3bO1GLaLClEwg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkV2Columns() {
    console.log('Checking V2 Ticket Columns...');
    const ticketCols = ['assigned_at', 'accepted_at'];
    for (const col of ticketCols) {
        const { error } = await supabase.from('tickets').select(col).limit(1);
        if (error) {
            console.log(`Column tickets.[${col}] does NOT exist (Error: ${error.message})`);
        } else {
            console.log(`Column tickets.[${col}] exists.`);
        }
    }

    console.log('\nChecking V2 User Profile Columns...');
    const userCols = ['online_status', 'last_seen_at', 'team'];
    for (const col of userCols) {
        const { error } = await supabase.from('user_profiles').select(col).limit(1);
        if (error) {
            console.log(`Column user_profiles.[${col}] does NOT exist (Error: ${error.message})`);
        } else {
            console.log(`Column user_profiles.[${col}] exists.`);
        }
    }
}

checkV2Columns();
