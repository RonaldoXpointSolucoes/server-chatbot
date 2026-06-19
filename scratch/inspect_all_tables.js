import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const tables = ['companies', 'contacts', 'conversations', 'messages', 'products', 'product_groups', 'product_steps', 'product_options', 'menu_categories', 'menu_products', 'menu_steps', 'tenant_products', 'tenant_groups'];
  for (const t of tables) {
    const { error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`Table ${t}: NOT EXISTS (${error.message})`);
    } else {
      console.log(`Table ${t}: EXISTS!`);
    }
  }
}
run();
