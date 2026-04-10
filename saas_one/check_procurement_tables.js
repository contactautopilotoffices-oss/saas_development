
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkTables() {
  const tables = ['material_requests', 'procurement_orders', 'procurement_activity_log'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table ${table}: NOT FOUND or ERROR (${error.message})`);
    } else {
      console.log(`Table ${table}: EXISTS`);
    }
  }
}

checkTables();
