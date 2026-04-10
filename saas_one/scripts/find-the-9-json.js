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

async function findThe9() {
    const { data: withReasoning } = await supabase
        .from('tickets')
        .select('id, created_at, llm_reasoning')
        .not('llm_reasoning', 'is', null);

    const { data: withExtra } = await supabase
        .from('tickets')
        .select('id, created_at, risk_flag, secondary_category_code')
        .or('risk_flag.not.is.null,secondary_category_code.not.is.null');

    const result = {
        withReasoning: withReasoning?.length || 0,
        withExtra: withExtra?.length || 0,
        tickets: (withReasoning || []).map(t => ({ id: t.id, created_at: t.created_at }))
    };

    fs.writeFileSync('output.json', JSON.stringify(result, null, 2));
}
findThe9();
