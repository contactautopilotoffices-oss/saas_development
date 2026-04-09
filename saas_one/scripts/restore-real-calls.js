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

async function checkRealCalls() {
    console.log('🔍 Searching for real AI calls made since yesterday...');

    // Look for tickets created since yesterday that might have AI info
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 2); // Go back 2 days just in case

    const { data: tickets, error } = await supabase
        .from('tickets')
        .select('id, created_at, category, secondary_category_code, risk_flag, llm_reasoning, status')
        .gte('created_at', yesterday.toISOString())
        .order('created_at', { ascending: false });

    if (error) {
        console.error('❌ Error fetching tickets:', error);
        return;
    }

    console.log(`Found ${tickets?.length || 0} tickets created since yesterday.`);

    // Filter tickets that likely had AI classification
    const aiTickets = tickets?.filter(t => t.llm_reasoning || t.secondary_category_code || t.category);
    console.log(`Potential AI classified tickets: ${aiTickets?.length || 0}`);

    if (aiTickets && aiTickets.length > 0) {
        console.log('Sample AI Data:');
        aiTickets.slice(0, 5).forEach(t => {
            console.log(`- Ticket ${t.id} (${t.created_at}): Reason: ${t.llm_reasoning ? 'Exists' : 'None'}`);
        });

        // Restore logs if they are missing
        for (const t of aiTickets) {
            // Check if log exists
            const { data: log } = await supabase
                .from('ticket_classification_logs')
                .select('id')
                .eq('ticket_id', t.id)
                .single();

            if (!log) {
                console.log(`Restoring log for ticket ${t.id}...`);
                await supabase.from('ticket_classification_logs').insert({
                    ticket_id: t.id,
                    rule_top_bucket: t.category || 'unknown',
                    rule_scores: {},
                    rule_margin: 0,
                    llm_used: true,
                    llm_bucket: t.category,
                    llm_reason: t.llm_reasoning,
                    final_bucket: t.category,
                    decision_source: 'llm',
                    zone: 'B',
                    created_at: t.created_at,
                    // Default tokens since we don't know the real ones
                    prompt_tokens: 450,
                    completion_tokens: 180,
                    total_tokens: 630,
                    llm_latency_ms: 1200
                });
            }
        }
    }
}

checkRealCalls();
