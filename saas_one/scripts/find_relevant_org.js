const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env file
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8');
    envFile.split('\n').filter(line => line.trim() && !line.startsWith('#')).forEach(line => {
        const indexOfEquals = line.indexOf('=');
        if (indexOfEquals !== -1) {
            const key = line.substring(0, indexOfEquals).trim();
            const value = line.substring(indexOfEquals + 1).trim().replace(/^["'](.+)["']$/, '$1');
            process.env[key] = value;
        }
    });
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findRelevantOrg() {
    console.log("Searching for organization with ~1885 total tickets...");
    
    const { data: orgs, error: orgError } = await supabase
        .from('organizations')
        .select('id, name');
    
    if (orgError) {
        console.error(orgError);
        process.exit(1);
    }

    for (const org of orgs) {
        const { count, error } = await supabase
            .from('tickets')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', org.id);
        
        if (error) continue;
        
        console.log(`Org: ${org.name} | ID: ${org.id} | Total Tickets: ${count}`);
        
        if (count > 1500 && count < 2000) {
            console.log("\n--- FOUND RELEVANT ORG ---");
            console.log(`ID: ${org.id}`);
            
            const { data: statusCounts, error: statusError } = await supabase
                .from('tickets')
                .select('status')
                .eq('organization_id', org.id);
            
            if (statusError) {
                console.error(statusError);
                continue;
            }
            
            const counts = {};
            statusCounts.forEach(t => {
                counts[t.status] = (counts[t.status] || 0) + 1;
            });
            
            console.log("Status Counts:");
            Object.entries(counts).forEach(([status, c]) => {
                console.log(`  ${status}: ${c}`);
            });
            
            // Check completed_by_our_side logic
            const resolvedStatuses = ['closed', 'satisfied', 'resolved'];
            let ourSideCompleted = 0;
            Object.entries(counts).forEach(([status, c]) => {
                if (resolvedStatuses.includes(status) || status === 'pending_validation') {
                    ourSideCompleted += c;
                }
            });
            console.log(`Current KPI (Resolved+Closed+PendingVal): ${ourSideCompleted}`);
        }
    }
}

findRelevantOrg();
