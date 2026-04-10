import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: notifs, error } = await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(5);
    console.log("NOTIFICATIONS ERROR:", error);
    console.log("NOTIFICATIONS DATA:", notifs);
    
    // Check if there's any RLS issue by checking as a specific user if possible, but service_role bypasses RLS.
    // If the table is empty, then insertions are failing.
}

main();
