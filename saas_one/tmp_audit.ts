import { createAdminClient } from './frontend/utils/supabase/admin';
import * as fs from 'fs';

async function audit() {
    const admin = createAdminClient();
    
    // Check for tickets
    const { data: tickets } = await admin
        .from('tickets')
        .select('id, ticket_number, status, hierarchy_id, assigned_to, escalation_last_action_at, current_escalation_level, escalation_paused, created_at')
        .order('created_at', { ascending: false })
        .limit(20);
        
    // Check for hierarchies
    const { data: hierarchies } = await admin
        .from('escalation_hierarchies')
        .select('*');

    // Check for levels
    const { data: levels } = await admin
        .from('escalation_levels')
        .select('*');
        
    const output = JSON.stringify({
        tickets,
        hierarchies,
        levels
    }, null, 2);
    
    fs.writeFileSync('audit.json', output);
    console.log('Audit saved to audit.json');
}

audit();
