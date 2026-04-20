import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function run() {
  const { data } = await supabase.from('messages').select('media_url').not('media_url', 'is', null);
  const urls = data.map(d => d.media_url);
  const uniqueDomains = [...new Set(urls.map(u => {
    try { return new URL(u).origin } catch { return u }
  }))];
  console.log(uniqueDomains);
}
run();
