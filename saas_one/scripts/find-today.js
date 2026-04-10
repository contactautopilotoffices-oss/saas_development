const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

async function findToday() {
    // Current date is Feb 2
    const { data: tickets } = await supabase
        .from('tickets')
        .select('*')
        .gte('created_at', '2026-02-02T00:00:00Z');

    console.log(`Total tickets created today: ${tickets?.length || 0}`);

    // Check which ones have a priority or some other field that implies AI
    const likelyAI = tickets?.filter(t => t.confidence === 'high' || t.department);
    console.log(`Likely AI tickets: ${likelyAI?.length || 0}`);

    fs.writeFileSync('output.json', JSON.stringify(tickets, null, 2));
}
findToday();
