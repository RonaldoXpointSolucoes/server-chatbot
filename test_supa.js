import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim();

const supabase = createClient(supabaseUrl, serviceKey);

async function check() {
  const { data: companies } = await supabase.from('companies').select('email');
  const { data: authData } = await supabase.auth.admin.listUsers();
  
  const authEmails = authData.users.map(u => u.email);
  
  console.log("Companies emails:");
  for (const c of companies) {
    if (c.email) {
      console.log(`- ${c.email}: in auth? ${authEmails.includes(c.email)}`);
    }
  }
}
check();
