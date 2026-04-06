import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
  const { data, error } = await supabase.storage.listBuckets();
  if(error) {
     fs.writeFileSync('buckets-output.txt', 'Error: ' + error.message, 'utf-8');
  } else {
     fs.writeFileSync('buckets-output.txt', 'Buckets: ' + data.map(b => b.name).join(', '), 'utf-8');
  }
}
check();
