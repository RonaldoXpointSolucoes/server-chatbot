import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env' });


const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findRonaldo() {
  console.log("=== RONALDO ===");
  const { data } = await supabase.from('contacts').select('*').ilike('name', '%Ronaldo%');
  console.log(JSON.stringify(data, null, 2));

  for (let c of (data||[])) {
      const { data: conv } = await supabase.from('conversations').select('id, status, last_message_at').eq('contact_id', c.id);
      console.log(`Conv for ${c.name} (${c.id}):`, conv);
  }
}

async function findGhost() {
  console.log("\n=== 99164-9959 ===");
  const { data } = await supabase.from('contacts').select('*').ilike('phone', '%991649959%');
  console.log(JSON.stringify(data, null, 2));
}

async function findRavardiere() {
  console.log("\n=== 9700-4040 ===");
  const { data } = await supabase.from('contacts').select('*').ilike('phone', '%97004040%');
  console.log(JSON.stringify(data, null, 2));
}

(async () => {
  await findRonaldo();
  await findGhost();
  await findRavardiere();
})();
