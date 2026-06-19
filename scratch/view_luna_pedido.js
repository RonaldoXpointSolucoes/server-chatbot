import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// Load env
const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim().replace(/^"(.*)"$/, '$1');

const supabase = createClient(supabaseUrl, serviceKey);

async function run() {
  try {
    const { data: bot, error } = await supabase
      .from('bots')
      .select('*')
      .eq('id', 'd233db28-cf3a-494b-91f9-f0e258e6bb88')
      .single();

    if (error) throw error;

    console.log("Luna Pedido Prompt:");
    console.log(bot.system_prompt || bot.systemPrompt);
  } catch (err) {
    console.error("Error checking Luna Pedido:", err);
  }
}

run();
