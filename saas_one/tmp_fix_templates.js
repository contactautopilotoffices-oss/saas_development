const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://xvucakstcmtfoanmgcql.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dWNha3N0Y210Zm9hbm1nY3FsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NzMyMjQ2NSwiZXhwIjoyMDgyODk4NDY1fQ.7WFGFGxTkSurehfwGNVPS2qzNf9toM3bO1GLaLClEwg';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
    const { data, error } = await supabase
        .from('sop_templates')
        .update({ is_running: true })
        .eq('title', 'Testing');

    if (error) {
        console.error('Error:', error);
        return;
    }

    console.log('Reset is_running: true');
}

fix();
