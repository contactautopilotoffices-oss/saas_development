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

async function findThe9() {
    console.log('🔍 Searching for exactly the AI tickets...');

    // Attempt 1: Check by existance of llm_reasoning
    const { data: withReasoning } = await supabase
        .from('tickets')
        .select('id, created_at, llm_reasoning')
        .not('llm_reasoning', 'is', null);

    console.log(`Tickets with llm_reasoning: ${withReasoning?.length || 0}`);

    // Attempt 2: Check by risk_flag or secondary_category_code (usually LLM set)
    const { data: withExtra } = await supabase
        .from('tickets')
        .select('id, created_at, risk_flag, secondary_category_code')
        .or('risk_flag.not.is.null,secondary_category_code.not.is.null');

    console.log(`Tickets with extra AI fields: ${withExtra?.length || 0}`);

    // If still not matching 9, maybe they are in the logs? 
    // I already cleared the logs, but let's check if any survived
    const { data: logs } = await supabase.from('ticket_classification_logs').select('id');
    console.log(`Current logs: ${logs?.length || 0}`);

    // Let's just list the last 20 tickets with their specific fields
    const { data: last20 } = await supabase
        .from('tickets')
        .select('id, created_at, llm_reasoning, risk_flag, secondary_category_code, department, confidence')
        .order('created_at', { ascending: false })
        .limit(20);

    last20.forEach(t => {
        const isAI = t.llm_reasoning || t.risk_flag || t.secondary_category_code;
        console.log(`${t.created_at} | AI: ${isAI ? 'YES' : 'NO'} | ${t.id}`);
    });
}
findThe9();
