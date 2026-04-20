import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data } = await supabase.from('messages').select('media_url').not('media_url', 'is', null).limit(5);
  console.log(JSON.stringify(data, null, 2));
}

run();
