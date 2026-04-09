
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://xvucakstcmtfoanmgcql.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dWNha3N0Y210Zm9hbm1nY3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzMyMjQ2NSwiZXhwIjoyMDgyODk4NDY1fQ.7WFGFGxTkSurehfwGNVPS2qzNf9toM3bO1GLaLClEwg';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    console.log('Checking columns...');
    const cols = ['full_name', 'phone', 'avatar_url', 'user_photo_url', 'phone_number'];
    for (const col of cols) {
        const { error } = await supabase.from('users').select(col).limit(1);
        if (error) {
            console.log(`Column [${col}] does NOT exist (Error: ${error.message})`);
        } else {
            console.log(`Column [${col}] exists.`);
        }
    }
}

checkColumns();
