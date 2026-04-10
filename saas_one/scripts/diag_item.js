const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env
const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split(/\r?\n/).forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const parts = line.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        let val = parts.slice(1).join('=').trim();
        if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
            val = val.slice(1, -1);
        }
        env[key] = val;
    }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function findItem() {
    const itemCode = 'ITEM-1771655337778';
    console.log(`Searching for item_code or barcode containing: ${itemCode}`);

    const { data: itemByCode, error: err1 } = await supabase
        .from('stock_items')
        .select('*')
        .eq('item_code', itemCode);

    const { data: itemByBarcode, error: err2 } = await supabase
        .from('stock_items')
        .select('*')
        .eq('barcode', itemCode);

    const { data: itemLikeBarcode, error: err3 } = await supabase
        .from('stock_items')
        .select('*')
        .ilike('barcode', `%${itemCode}%`);

    console.log('Results by item_code:', itemByCode);
    console.log('Results by barcode (exact):', itemByBarcode);
    console.log('Results by barcode (LIKE):', itemLikeBarcode);
}

findItem();
