const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env file
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            let value = valueParts.join('=').trim();
            if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
                value = value.substring(1, value.length - 1);
            }
            process.env[key.trim()] = value;
        }
    });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function inspectTickets() {
    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) console.error(error);
    else {
        console.log('--- LATEST TICKETS ---');
        tickets.forEach(t => {
            console.log(`ID: ${t.id} | Created: ${t.created_at}`);
            Object.keys(t).forEach(key => {
                if (t[key] !== null) console.log(`  ${key}: ${t[key]}`);
            });
            console.log('---------------------');
        });
    }
}
inspectTickets();
