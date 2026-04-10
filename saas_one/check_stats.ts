import { createClient } from '@supabase/supabase-js';

async function check() {
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const orgId = '211e1330-ad34-45aa-95aa-2244199c0864';
    
    const { data, error, count } = await supabase
        .from('tickets')
        .select('status', { count: 'exact' })
        .eq('organization_id', orgId);
        
    if (error) {
        console.error(error);
        return;
    }
    
    const counts: Record<string, number> = {};
    data?.forEach(t => {
        counts[t.status] = (counts[t.status] || 0) + 1;
    });
    
    console.log('Total Count:', count);
    console.log('Status Breakdown:', JSON.stringify(counts, null, 2));
}

check();
