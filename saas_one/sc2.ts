import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

async function main() {
    const { data: tickets } = await supabase
        .from('tickets')
        .select('id, priority, status, created_at, property_id, property:properties(name)')
        .in('priority', ['high', 'urgent', 'critical'])
        .not('status', 'in', '("resolved","closed","pending_validation")');

    let out = '';
    for (const t of tickets || []) {
        out += `- [${(t.property as any)?.name}] ${t.priority} (${t.status}): created ${t.created_at} property_id=${t.property_id}\n`;
    }
    fs.writeFileSync('tickets_dump.txt', out);
}

main().catch(console.error);
