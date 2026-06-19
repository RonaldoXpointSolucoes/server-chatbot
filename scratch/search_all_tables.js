import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const target = '89985491-d785-4cc5-b859-bf2468ef3e2e';
  
  // List of tables to search
  const tables = [
    'contacts',
    'conversations',
    'messages',
    'whatsapp_instances',
    'companies',
    'tenant_users',
    'appointments',
    'contact_notes',
    'whatsapp_instance_runtime'
  ];

  for (const table of tables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select('*');
        
      if (error) {
        console.error(`Error fetching from ${table}:`, error);
        continue;
      }
      
      const found = data.filter(row => {
        const str = JSON.stringify(row);
        return str.includes(target);
      });
      
      if (found.length > 0) {
        console.log(`Found in table "${table}":`, found.length, 'rows');
        console.log(JSON.stringify(found[0], null, 2));
      }
    } catch (e) {
      console.error(`Error processing table ${table}:`, e);
    }
  }
}

run();
