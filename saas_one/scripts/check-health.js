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

async function checkHealth() {
    const { data, error } = await supabase
        .from('llm_health_metrics')
        .select('*')
        .order('timestamp', { ascending: false });

    if (error) {
        console.error(error);
    } else {
        console.log(`Found ${data?.length || 0} health metrics entries.`);
        data.forEach(d => console.log(`${d.timestamp} | Success: ${d.success_count}`));
    }
}
checkHealth();
