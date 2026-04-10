const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigrations() {
    console.log('Applying AI metadata columns to tickets table...');

    // We use RPC or raw SQL via Supabase UI, but here we can at least try to see if they exist
    // Or try to execute via a function if it exists.
    // Since I can't run raw SQL through the client easily without a custom function,
    // I will try to check if the columns exist by fetching one row.

    const { data, error } = await supabase
        .from('tickets')
        .select('secondary_category_code, risk_flag, llm_reasoning')
        .limit(1);

    if (error) {
        console.error('Check failed. It is highly likely the columns are missing.');
        console.error('Error:', error.message);

        if (error.message.includes('column') && error.message.includes('does not exist')) {
            console.log('\nCONFIRMED: Missing columns detected.');
            console.log('Please run the following SQL in your Supabase SQL Editor:\n');
            console.log(`
ALTER TABLE tickets 
ADD COLUMN IF NOT EXISTS secondary_category_code text,
ADD COLUMN IF NOT EXISTS risk_flag text,
ADD COLUMN IF NOT EXISTS llm_reasoning text;

ALTER TABLE ticket_classification_logs 
ADD COLUMN IF NOT EXISTS llm_secondary_bucket text,
ADD COLUMN IF NOT EXISTS llm_risk_flag text,
ADD COLUMN IF NOT EXISTS prompt_tokens integer,
ADD COLUMN IF NOT EXISTS completion_tokens integer,
ADD COLUMN IF NOT EXISTS total_tokens integer;
            `);
        }
    } else {
        console.log('Columns exist! The failure might be elsewhere (e.g. Groq API Key).');
    }
}

applyMigrations();
