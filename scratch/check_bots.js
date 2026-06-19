import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env
const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  try {
    const { data: bots, error } = await supabase
      .from('bots')
      .select('*');

    if (error) throw error;

    console.log("Found bots:", bots.map(b => ({ id: b.id, name: b.name, category: b.category, model: b.model })));
    fs.writeFileSync('scratch/db_bots.json', JSON.stringify(bots, null, 2));
  } catch (err) {
    console.error("Error checking bots:", err);
  }
}

run();
