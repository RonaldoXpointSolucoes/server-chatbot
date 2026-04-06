import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

import fs from 'fs';
async function check() {
  const { data, error } = await supabase.from('messages').select('*').limit(1);
  if(error) {
     fs.writeFileSync('schema-output.txt', 'Error: ' + error.message);
  } else {
     fs.writeFileSync('schema-output.txt', 'Columns: ' + Object.keys(data[0] || {}).join(', '));
  }
}
check();
