const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Basic env parser
const env = {};
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
        const [key, ...val] = line.split('=');
        if (key && val.length > 0) {
            let value = val.join('=').trim();
            // Strip leading/trailing quotes if they exist
            if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
                value = value.slice(1, -1);
            }
            env[key.trim()] = value;
        }
    });
}

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'];

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log("Checking last 10 notifications...");
    const { data: notifs, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
        
    if (error) {
        console.error("Error fetching notifications:", error);
    } else {
        console.log("Found", notifs.length, "notifications.");
        notifs.forEach(n => {
            console.log(`[${n.created_at}] To: ${n.user_id} | Type: ${n.notification_type} | Read: ${n.is_read}`);
            console.log(`  Title: ${n.title}`);
        });
    }

    // Also check if any notifications exist at all
    const { count, error: countError } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true });
    
    console.log("Total notifications in DB:", count);
}

main();
