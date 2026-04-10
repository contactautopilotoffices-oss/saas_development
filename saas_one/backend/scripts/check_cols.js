
const { createClient } = require('@supabase/supabase-js');
const u = 'https://xvucakstcmtfoanmgcql.supabase.co';
const k = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dWNha3N0Y210Zm9hbm1nY3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzMyMjQ2NSwiZXhwIjoyMDgyODk4NDY1fQ.7WFGFGxTkSurehfwGNVPS2qzNf9toM3bO1GLaLClEwg';
const s = createClient(u, k);
async function c() {
    const cols = ['full_name', 'phone', 'avatar_url', 'user_photo_url'];
    for (const col of cols) {
        const { error } = await s.from('users').select(col).limit(1);
        console.log(`${col}: ${error ? 'NO' : 'YES'}`);
    }
}
c();
